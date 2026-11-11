/**
 * Short-notice requests reach the owner only once the customer's card is held.
 *
 *   npx tsx scripts/check-short-notice-hold-before-request.ts
 *
 * Uses an in-memory KV store and a stubbed Stripe API (no network, no charges).
 */
import assert from "node:assert/strict";
import { configureStripe } from "../workers/addresses/shared/stripe-payments";
import type { ShortNoticeBookingRecord } from "../workers/addresses/shared/short-notice-booking";
import {
  noteShortNoticeHoldAuthorised,
  sweepShortNoticeCardHolds,
} from "../workers/addresses/src/short-notice-card-hold";
import {
  getShortNoticeByReference,
  saveShortNoticeBooking,
} from "../workers/addresses/src/short-notice-store";
import {
  savePendingCheckout,
  type PendingCheckoutRecord,
} from "../workers/addresses/src/pending-checkout-store";
import {
  handleOwnerApproveShortNotice,
  handleOwnerListShortNotice,
  processExpiredShortNoticeResponseWindows,
} from "../workers/addresses/src/short-notice-handlers";

class MemoryKV {
  data = new Map<string, string>();
  async get(key: string, type?: string | { type?: string }) {
    const raw = this.data.get(key) ?? null;
    const mode = typeof type === "string" ? type : type?.type;
    if (raw !== null && mode === "json") return JSON.parse(raw);
    return raw;
  }
  async put(key: string, value: string) {
    this.data.set(key, value);
  }
  async delete(key: string) {
    this.data.delete(key);
  }
  async list({ prefix = "" }: { prefix?: string; cursor?: string } = {}) {
    return {
      keys: [...this.data.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })),
      list_complete: true,
      cursor: undefined,
    };
  }
}

// --- Stripe stub -----------------------------------------------------------
let piStatus = "requires_payment_method";
let sessionStatus = "open";
const stripeCalls: string[] = [];
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? "GET";
  stripeCalls.push(`${method} ${url.replace(/\?.*$/, "")}`);
  if (url.includes("/checkout/sessions/") && method === "GET") {
    return new Response(
      JSON.stringify({
        id: "cs_test_hold",
        object: "checkout.session",
        status: sessionStatus,
        amount_total: 9500,
        payment_intent: { id: "pi_test_hold", object: "payment_intent", status: piStatus },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
  return new Response(JSON.stringify({ id: "x", status: "canceled" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}) as typeof fetch;
configureStripe({ STRIPE_SECRET_KEY: "sk_test_stub" });

// --- Fixture ---------------------------------------------------------------
function makeRecord(reference: string, now: Date, expiresInMin: number): ShortNoticeBookingRecord {
  const createdAt = now.toISOString();
  return {
    reference,
    paymentToken: `tok-${reference}`,
    status: "SHORT_NOTICE_AWAITING_APPROVAL",
    amount: 95,
    currency: "GBP",
    amountLabel: "£95.00",
    booking: {
      customerName: "Test Customer",
      customerEmail: "test@example.com",
      customerPhone: "07000000000",
      pickupLabel: "Portstewart",
      dropoffLabel: "Belfast International Airport",
      tripDate: "2026-11-11",
      tripTime: "20:00",
      passengers: 1,
      suitcases: 0,
      vehicle: "Standard Saloon",
    } as unknown as ShortNoticeBookingRecord["booking"],
    materialFingerprint: "fp",
    underMinimumNotice: true,
    holdReasons: ["under_minimum_notice"] as ShortNoticeBookingRecord["holdReasons"],
    shortNoticeConfirmationWindowHours: 1,
    shortNoticeRequestedAt: createdAt,
    shortNoticeExpiresAt: new Date(now.getTime() + expiresInMin * 60_000).toISOString(),
    createdAt,
    updatedAt: createdAt,
    cardHold: {
      checkoutId: "cs_test_hold",
      checkoutReference: `${reference}-HOLD`,
      amount: 95,
      createdAt,
    },
    awaitingCardHold: true,
    deferredOwnerEmail: {
      subject: "SHORT-NOTICE BOOKING REQUEST — respond by {{RESPOND_BY}}",
      body: "CARD HELD — £95.00 authorised.\nRespond by {{RESPOND_BY}}\n",
    },
  } as ShortNoticeBookingRecord;
}

const pending = (reference: string): PendingCheckoutRecord =>
  ({
    checkoutId: "cs_test_hold",
    checkoutReference: `${reference}-HOLD`,
    amount: 95,
    createdAt: new Date().toISOString(),
    checkoutKind: "short-notice-hold",
    shortNoticeReference: reference,
    booking: { customerName: "Test Customer", customerEmail: "test@example.com" },
  }) as PendingCheckoutRecord;

const ownerEnv = (store: MemoryKV) =>
  ({ TRACKING_STORE: store, OWNER_ACCESS_KEY: "owner-key" }) as never;
const ownerRequest = () =>
  new Request("https://example.test/owner/short-notice", { headers: { "X-Owner-Key": "owner-key" } });

async function main() {
  // 1. Card not held yet → hidden, cannot approve, no owner email.
  {
    const store = new MemoryKV();
    const now = new Date();
    const record = makeRecord("SN-A", now, 60);
    await saveShortNoticeBooking(store as never, record);
    await savePendingCheckout(store as never, pending("SN-A"));

    const list = await handleOwnerListShortNotice(ownerRequest(), ownerEnv(store));
    assert.ok("bookings" in list);
    assert.equal(list.bookings.length, 0, "unheld request must not show in the dashboard");

    const approve = await handleOwnerApproveShortNotice(
      ownerRequest(),
      ownerEnv(store),
      { reference: "SN-A" },
      "https://www.myairporttaxini.co.uk",
    );
    assert.ok("error" in approve && approve.status === 409, "unheld request must not be approvable");
    assert.match((approve as { error: string }).error, /hasn't finished authorising/);

    // Webhook arrives while card still unauthorised → nothing happens.
    const owner: string[] = [];
    piStatus = "requires_payment_method";
    await noteShortNoticeHoldAuthorised({
      store: store as never,
      pending: pending("SN-A"),
      emailOwner: async (s) => void owner.push(s),
    });
    assert.equal(owner.length, 0);
    console.log("ok 1. Unheld request is hidden, unapprovable and silent");

    // 2. Card held → owner emailed with deadline, window restarts, customer emailed, visible.
    piStatus = "requires_capture";
    const later = new Date(now.getTime() + 10 * 60_000);
    const customer: string[] = [];
    await noteShortNoticeHoldAuthorised({
      store: store as never,
      pending: pending("SN-A"),
      emailOwner: async (s, b) => void owner.push(`${s}\n${b}`),
      sendCustomerRequestReceived: async (r) => void customer.push(r.reference),
      now: later,
    });
    assert.equal(owner.length, 1, "owner gets exactly one request email");
    assert.doesNotMatch(owner[0], /\{\{RESPOND_BY\}\}/);
    assert.match(owner[0], /respond by \d{2}:\d{2}/);
    assert.deepEqual(customer, ["SN-A"]);
    const stored = await getShortNoticeByReference(store as never, "SN-A");
    assert.equal(stored?.awaitingCardHold, false);
    assert.equal(stored?.deferredOwnerEmail, undefined);
    assert.ok(stored?.cardHold?.authorisedAt);
    assert.equal(
      new Date(stored!.shortNoticeExpiresAt!).getTime(),
      later.getTime() + 60 * 60_000,
      "response window restarts when the card is held",
    );
    const list2 = await handleOwnerListShortNotice(ownerRequest(), ownerEnv(store));
    assert.ok("bookings" in list2 && list2.bookings.length === 1);

    // Duplicate webhook → no second email.
    await noteShortNoticeHoldAuthorised({
      store: store as never,
      pending: pending("SN-A"),
      emailOwner: async (s) => void owner.push(s),
    });
    assert.equal(owner.length, 1);
    console.log("ok 2. Held card sends the request once, restarts the window, shows in dashboard");
  }

  // 3. Missed webhook → 5-minute sweep picks up the held card.
  {
    const store = new MemoryKV();
    const record = makeRecord("SN-B", new Date(), 60);
    await saveShortNoticeBooking(store as never, record);
    await savePendingCheckout(store as never, pending("SN-B"));
    await store.put("sn-card-hold:SN-B", "SN-B");
    piStatus = "requires_capture";
    const owner: string[] = [];
    const r = await sweepShortNoticeCardHolds(store as never, {
      emailOwner: async (s) => void owner.push(s),
    });
    assert.equal(r.authorised, 1);
    assert.equal(owner.length, 1);
    console.log("ok 3. Sweep backstop forwards a held card if the webhook was missed");
  }

  // 4. Never held, deadline passed → closed quietly (no customer expiry email, no owner email).
  {
    const store = new MemoryKV();
    const record = makeRecord("SN-C", new Date(Date.now() - 2 * 3600_000), 60);
    await saveShortNoticeBooking(store as never, record);
    await store.put("sn-card-hold:SN-C", "SN-C");
    piStatus = "requires_payment_method";
    sessionStatus = "open";
    stripeCalls.length = 0;
    const owner: string[] = [];
    const r = await sweepShortNoticeCardHolds(store as never, {
      emailOwner: async (s) => void owner.push(s),
    });
    assert.equal(r.released, 1);
    assert.equal(owner.length, 0);
    assert.ok(stripeCalls.some((c) => c.startsWith("POST") && c.includes("/expire")), "open session expired");
    const exp = await processExpiredShortNoticeResponseWindows({ TRACKING_STORE: store } as never);
    assert.equal(exp.emailed, 0, "no 'couldn't confirm' email for a request the owner never saw");
    console.log("ok 4. Abandoned card hold closes quietly");
  }

  // 5. Card held after the deadline passed → released, owner not bothered.
  {
    const store = new MemoryKV();
    const record = makeRecord("SN-D", new Date(Date.now() - 2 * 3600_000), 60);
    await saveShortNoticeBooking(store as never, record);
    piStatus = "requires_capture";
    stripeCalls.length = 0;
    const owner: string[] = [];
    await noteShortNoticeHoldAuthorised({
      store: store as never,
      pending: pending("SN-D"),
      emailOwner: async (s) => void owner.push(s),
    });
    assert.equal(owner.length, 0);
    assert.ok(stripeCalls.some((c) => c.includes("/payment_intents/pi_test_hold/cancel")));
    console.log("ok 5. Late authorisation after the deadline is released");
  }

  console.log("\nshort-notice hold-before-request checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
