/**
 * 24/7 booking approval — decision lock, deadline timer, approve/decline/expire
 * races, card-hold capture/release, duplicate webhooks, one-tap owner links and
 * WhatsApp failure isolation.
 *
 *   npx tsx scripts/check-booking-approval-flow.ts
 *
 * In-memory KV, an in-process Durable Object, stubbed Stripe / WhatsApp
 * (no network, no charges, no messages).
 */
import assert from "node:assert/strict";
import { configureStripe } from "../workers/addresses/shared/stripe-payments";
import type { ShortNoticeBookingRecord } from "../workers/addresses/shared/short-notice-booking";
import { materialJourneyFingerprint } from "../workers/addresses/shared/booking-notice";
import {
  ShortNoticeDecisionCoordinator,
  decideClaim,
} from "../workers/addresses/src/short-notice-decision-coordinator";
import {
  claimShortNoticeDecision,
  configureShortNoticeDecisionCoordinator,
  getShortNoticeByReference,
  saveShortNoticeBooking,
} from "../workers/addresses/src/short-notice-store";
import { noteShortNoticeHoldAuthorised } from "../workers/addresses/src/short-notice-card-hold";
import {
  handleOwnerApproveShortNotice,
  handleOwnerDeclineShortNotice,
  runShortNoticeDeadline,
} from "../workers/addresses/src/short-notice-handlers";
import { captureCheckoutHold } from "../workers/addresses/src/stripe-holds";
import type { PendingCheckoutRecord } from "../workers/addresses/src/pending-checkout-store";
import {
  alertOwnerApprovalRequest,
  signOwnerApprovalToken,
  verifyOwnerApprovalToken,
} from "../workers/addresses/src/owner-approval-alert";

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
  async list({ prefix = "" }: { prefix?: string } = {}) {
    return {
      keys: [...this.data.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })),
      list_complete: true,
      cursor: undefined,
    };
  }
}

// --- In-process Durable Object namespace -------------------------------------
const alarms = new Map<string, number>();
class FakeStorage {
  map = new Map<string, unknown>();
  constructor(private readonly name: string) {}
  async get<T>(key: string) {
    return this.map.get(key) as T | undefined;
  }
  async put(key: string, value: unknown) {
    this.map.set(key, structuredClone(value));
  }
  async delete(key: string) {
    this.map.delete(key);
  }
  async setAlarm(at: number) {
    alarms.set(this.name, at);
  }
}
const objects = new Map<string, ShortNoticeDecisionCoordinator>();
// Serialise requests per object, as Cloudflare does.
const queues = new Map<string, Promise<unknown>>();
const fakeNamespace = {
  idFromName: (name: string) => name,
  get: (id: string) => {
    if (!objects.has(id)) {
      objects.set(
        id,
        new ShortNoticeDecisionCoordinator({ storage: new FakeStorage(id) } as never, {}),
      );
    }
    const obj = objects.get(id)!;
    return {
      fetch: (url: string, init: RequestInit) => {
        const run = (queues.get(id) ?? Promise.resolve()).then(() => obj.fetch(new Request(url, init)));
        queues.set(id, run.catch(() => undefined));
        return run;
      },
    };
  },
} as unknown as DurableObjectNamespace;
configureShortNoticeDecisionCoordinator(fakeNamespace);

// --- Stripe / WhatsApp stub ---------------------------------------------------
let piStatus = "requires_capture";
let failWhatsApp = false;
const calls: string[] = [];
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? "GET";
  calls.push(`${method} ${url.replace(/\?.*$/, "")}`);
  if (url.includes("graph.facebook.com") || url.includes("360dialog")) {
    if (failWhatsApp) throw new Error("WhatsApp is down");
    return new Response(JSON.stringify({ data: [] }), { status: 200 });
  }
  if (url.includes("/checkout/sessions/") && method === "GET") {
    return new Response(
      JSON.stringify({
        id: "cs_test_hold",
        object: "checkout.session",
        status: "complete",
        amount_total: 9500,
        payment_intent: { id: "pi_test_hold", object: "payment_intent", status: piStatus },
      }),
      { status: 200 },
    );
  }
  if (url.includes("/payment_intents/pi_test_hold/capture")) {
    piStatus = "succeeded";
    return new Response(JSON.stringify({ id: "pi_test_hold", status: "succeeded" }), { status: 200 });
  }
  if (url.includes("/payment_intents/pi_test_hold/cancel")) {
    piStatus = "canceled";
    return new Response(JSON.stringify({ id: "pi_test_hold", status: "canceled" }), { status: 200 });
  }
  return new Response(JSON.stringify({}), { status: 200 });
}) as typeof fetch;
configureStripe({ STRIPE_SECRET_KEY: "sk_test_stub" });

// --- Fixtures ----------------------------------------------------------------
function record(reference: string, deadlineInMs: number, extra: Partial<ShortNoticeBookingRecord> = {}) {
  const now = new Date();
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
      mobileNumber: "07000000000",
      pickupLabel: "Portstewart",
      dropoffLabel: "Belfast International Airport",
      tripDate: "2027-06-01",
      tripTime: "20:00",
      flightNumber: "EZY123",
      passengers: 2,
      suitcases: 0,
      vehicle: "Standard Saloon",
    },
    materialFingerprint: "fp",
    underMinimumNotice: true,
    holdReasons: ["under_minimum_notice"],
    shortNoticeRequestedAt: now.toISOString(),
    shortNoticeExpiresAt: new Date(now.getTime() + deadlineInMs).toISOString(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    cardHold: {
      checkoutId: "cs_test_hold",
      checkoutReference: `${reference}-HOLD`,
      amount: 95,
      createdAt: now.toISOString(),
      authorisedAt: now.toISOString(),
    },
    ...extra,
  } as unknown as ShortNoticeBookingRecord;
}
function withFingerprint(r: ShortNoticeBookingRecord): ShortNoticeBookingRecord {
  return { ...r, materialFingerprint: materialJourneyFingerprint({ ...(r.booking as never), amount: r.amount } as never) };
}
const env = (store: MemoryKV) =>
  ({ TRACKING_STORE: store, OWNER_ACCESS_KEY: "owner-key" }) as never;
const owner = () =>
  new Request("https://example.test/owner/short-notice", { headers: { "X-Owner-Key": "owner-key" } });
const SITE = "https://www.myairporttaxini.co.uk";
const MIN = 60_000;

async function main() {
  // Pure decision rule.
  {
    const now = new Date("2026-11-12T12:00:00Z");
    const before = "2026-11-12T12:05:00Z";
    const past = "2026-11-12T11:59:59Z";
    assert.deepEqual(decideClaim(null, "approve", before, now).claim, { ok: true, alreadyClaimed: false });
    assert.equal(decideClaim(null, "approve", past, now).claim.ok, false);
    assert.equal(decideClaim(null, "approve", past, now).store?.action, "expire");
    assert.equal(decideClaim(null, "expire", before, now).claim.ok, false, "expire waits for the deadline");
    assert.equal(decideClaim({ action: "decline", at: "" }, "approve", before, now).claim.ok, false);
    assert.equal(decideClaim({ action: "approve", at: "" }, "expire", past, now).claim.ok, false);
    assert.deepEqual(decideClaim({ action: "approve", at: "" }, "approve", before, now).claim, {
      ok: true,
      alreadyClaimed: true,
      existingAction: "approve",
    });
    console.log("ok decision rule: first wins, deadline enforced, retries idempotent");
  }

  // Deadline timer is scheduled when a pending request is saved.
  {
    const store = new MemoryKV();
    const r = record("SN-TIMER", 30 * MIN);
    await saveShortNoticeBooking(store as never, r);
    assert.equal(alarms.get("SN-TIMER"), new Date(r.shortNoticeExpiresAt!).getTime());
    console.log("ok durable deadline alarm scheduled at the approval deadline");
  }

  // 8. Owner approves before expiry → APPROVED; card captured once.
  {
    const store = new MemoryKV();
    piStatus = "requires_capture";
    await saveShortNoticeBooking(store as never, withFingerprint(record("SN-8", 30 * MIN)));
    const res = await handleOwnerApproveShortNotice(owner(), env(store), { reference: "SN-8" }, SITE);
    assert.ok("ok" in res, JSON.stringify(res));
    assert.equal((await getShortNoticeByReference(store as never, "SN-8"))?.status, "SHORT_NOTICE_APPROVED");
    calls.length = 0;
    const first = await captureCheckoutHold("cs_test_hold");
    const second = await captureCheckoutHold("cs_test_hold");
    assert.deepEqual(first, { ok: true, alreadyCaptured: false });
    assert.deepEqual(second, { ok: true, alreadyCaptured: true });
    assert.equal(calls.filter((c) => c.includes("/capture")).length, 1, "captured exactly once");
    // Second approval tap is harmless.
    const again = await handleOwnerApproveShortNotice(owner(), env(store), { reference: "SN-8" }, SITE);
    assert.ok("ok" in again);
    // Expiry after approval does nothing.
    await runShortNoticeDeadline(env(store), "SN-8", new Date(Date.now() + 60 * MIN));
    assert.equal((await getShortNoticeByReference(store as never, "SN-8"))?.status, "SHORT_NOTICE_APPROVED");
    console.log("ok 8 approve before expiry → approved, charged once, expiry ignored");
  }

  // 9. Owner declines → DECLINED, can't be approved afterwards.
  {
    const store = new MemoryKV();
    await saveShortNoticeBooking(store as never, record("SN-9", 30 * MIN));
    const res = await handleOwnerDeclineShortNotice(owner(), env(store), { reference: "SN-9" });
    assert.ok("ok" in res);
    assert.equal(res.record.status, "SHORT_NOTICE_DECLINED");
    const approve = await handleOwnerApproveShortNotice(owner(), env(store), { reference: "SN-9" }, SITE);
    assert.ok("error" in approve);
    console.log("ok 9 decline → declined, approval refused");
  }

  // 10. No response → expired at the deadline, card hold cancelled.
  {
    const store = new MemoryKV();
    piStatus = "requires_capture";
    await saveShortNoticeBooking(store as never, record("SN-10", -1000));
    calls.length = 0;
    await runShortNoticeDeadline(env(store), "SN-10");
    const after = await getShortNoticeByReference(store as never, "SN-10");
    assert.equal(after?.status, "SHORT_NOTICE_EXPIRED");
    assert.ok(after?.cardHold?.releasedAt, "hold released");
    assert.ok(calls.some((c) => c.includes("/payment_intents/pi_test_hold/cancel")), "Stripe authorisation cancelled");
    assert.ok(!calls.some((c) => c.includes("/capture")), "never captured");
    // Alarm retried (duplicate run) → nothing more happens.
    calls.length = 0;
    await runShortNoticeDeadline(env(store), "SN-10");
    assert.ok(!calls.some((c) => c.includes("/cancel")));
    console.log("ok 10 no response → expired, authorisation cancelled, idempotent");
  }

  // 11. Approval after expiry is refused.
  {
    const store = new MemoryKV();
    await saveShortNoticeBooking(store as never, record("SN-11", -1000));
    const res = await handleOwnerApproveShortNotice(owner(), env(store), { reference: "SN-11" }, SITE);
    assert.ok("error" in res && res.status === 409);
    assert.notEqual((await getShortNoticeByReference(store as never, "SN-11"))?.status, "SHORT_NOTICE_APPROVED");
    console.log("ok 11 approval after expiry refused");
  }

  // 12. Capture fails (hold already released) → reported, never confirmed.
  {
    piStatus = "canceled";
    const res = await captureCheckoutHold("cs_test_hold");
    assert.equal(res.ok, false);
    piStatus = "requires_payment_method";
    assert.equal((await captureCheckoutHold("cs_test_hold")).ok, false);
    console.log("ok 12 failed capture is reported, not treated as paid");
  }

  // 13. WhatsApp failure never changes the pending state.
  {
    const store = new MemoryKV();
    const r = record("SN-13", 30 * MIN);
    await saveShortNoticeBooking(store as never, r);
    failWhatsApp = true;
    const out = await alertOwnerApprovalRequest(
      {
        TRACKING_STORE: store,
        OWNER_ACCESS_KEY: "owner-key",
        OWNER_APPROVAL_WHATSAPP: "07377000000",
        WHATSAPP_ACCESS_TOKEN: "t",
        WHATSAPP_PHONE_NUMBER_ID: "1",
        WHATSAPP_BUSINESS_ACCOUNT_ID: "2",
      } as never,
      r,
    );
    failWhatsApp = false;
    assert.notEqual(out.whatsapp, "sent");
    assert.ok(out.link?.startsWith(`${SITE}/owner/decision/?t=`));
    assert.equal((await getShortNoticeByReference(store as never, "SN-13"))?.status, "SHORT_NOTICE_AWAITING_APPROVAL");
    console.log("ok 13 WhatsApp failure → booking stays pending, link still produced");
  }

  // 14. Duplicate Stripe webhook → owner alerted once.
  {
    const store = new MemoryKV();
    piStatus = "requires_capture";
    const r = record("SN-14", 30 * MIN, {
      awaitingCardHold: true,
      cardHold: { checkoutId: "cs_test_hold", checkoutReference: "SN-14-HOLD", amount: 95, createdAt: new Date().toISOString() },
      deferredOwnerEmail: { subject: "REQUEST — respond by {{RESPOND_BY}}", body: "Respond by {{RESPOND_BY}}" },
    });
    // Pickup ~30h from now (by UK wall clock): approvable whatever time this runs.
    const pickupAt = new Date(Date.now() + 30 * 60 * MIN);
    const ukDate = pickupAt.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
    const ukTime = pickupAt.toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" });
    r.booking = { ...r.booking, tripDate: ukDate, tripTime: ukTime };
    await saveShortNoticeBooking(store as never, r);
    const pending = {
      checkoutId: "cs_test_hold",
      checkoutKind: "short-notice-hold",
      shortNoticeReference: "SN-14",
    } as PendingCheckoutRecord;
    const emails: string[] = [];
    let alerts = 0;
    const deliver = () =>
      noteShortNoticeHoldAuthorised({
        store: store as never,
        pending,
        emailOwner: async (s) => void emails.push(s),
        alertOwner: async () => {
          alerts += 1;
          return { link: `${SITE}/owner/decision/?t=x` };
        },
      });
    await deliver();
    await deliver();
    const after = await getShortNoticeByReference(store as never, "SN-14");
    assert.ok(after && new Date(after.shortNoticeExpiresAt!).getTime() > Date.now());
    assert.equal(emails.length, 1, "owner emailed once");
    assert.equal(alerts, 1, "owner alerted once");
    assert.match(emails[0], /respond by \d{2}:\d{2}/);
    console.log("ok 14 duplicate webhook → single owner alert");
  }

  // 15. Customer submits the same payment twice → one hold, one capture (idempotent capture above);
  //     a second authorisation webhook for the same session is ignored (14).
  console.log("ok 15 duplicate payment submission → single capture (see 8 and 14)");

  // 18. Approval at the same moment expiry runs → exactly one wins.
  {
    for (let i = 0; i < 20; i += 1) {
      const ref = `SN-18-${i}`;
      const deadline = new Date(Date.now() - 1).toISOString();
      const [approve, expire] = await Promise.all([
        claimShortNoticeDecision(new MemoryKV() as never, ref, "approve", { deadlineAt: deadline }),
        claimShortNoticeDecision(new MemoryKV() as never, ref, "expire", { deadlineAt: deadline }),
      ]);
      const winners = [approve, expire].filter((c) => c.ok && !c.alreadyClaimed).length;
      const expireClaimedTwice = approve.ok === false && expire.ok && expire.alreadyClaimed;
      assert.ok(winners === 1 || expireClaimedTwice, JSON.stringify({ approve, expire }));
      assert.equal(approve.ok, false, "approval at/after deadline never wins");
    }
    for (let i = 0; i < 20; i += 1) {
      const ref = `SN-18b-${i}`;
      const deadline = new Date(Date.now() + 60_000).toISOString();
      const [a, d] = await Promise.all([
        claimShortNoticeDecision(new MemoryKV() as never, ref, "approve", { deadlineAt: deadline }),
        claimShortNoticeDecision(new MemoryKV() as never, ref, "decline", { deadlineAt: deadline }),
      ]);
      assert.equal([a, d].filter((c) => c.ok).length, 1, "approve vs decline: exactly one");
    }
    console.log("ok 18 approve/expire and approve/decline races → exactly one decision");
  }

  // One-tap link tokens.
  {
    const e = { OWNER_ACCESS_KEY: "owner-key" };
    const exp = new Date(Date.now() + 10 * MIN).toISOString();
    const token = (await signOwnerApprovalToken(e, "SN-L", exp))!;
    const ok = await verifyOwnerApprovalToken(e, token);
    assert.ok(ok.ok && ok.reference === "SN-L");
    assert.equal((await verifyOwnerApprovalToken({ OWNER_ACCESS_KEY: "other" }, token)).ok, false, "wrong secret");
    const [p, s] = token.split(".");
    const forged = `${Buffer.from("v1|SN-OTHER|9999999999999").toString("base64url")}.${s}`;
    assert.equal((await verifyOwnerApprovalToken(e, forged)).ok, false, "can't retarget");
    assert.equal((await verifyOwnerApprovalToken(e, `${p}.${s.slice(0, -2)}xx`)).ok, false, "tamper");
    assert.equal((await verifyOwnerApprovalToken(e, token, new Date(Date.now() + 11 * MIN))).ok, false, "expires at deadline");
    assert.equal(await signOwnerApprovalToken({}, "SN-L", exp), null, "no secret → no link");
    console.log("ok approval links: signed, booking-bound, tamper-proof, expire at deadline");
  }

  console.log("\nAll booking approval flow checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
