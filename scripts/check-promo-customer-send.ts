/**
 * Owner "Send codes to my customer list": who is listed, who can be sent, the email, batching,
 * unsubscribe, failures, test copy and preview mode.
 * Run: npx tsx scripts/check-promo-customer-send.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  CUSTOMER_OFFER_SAMPLE_CODE,
  buildCustomerOfferEmail,
  customersFromBookings,
  firstName,
  isOwnerAddress,
} from "../shared/promo-customer-offer";
import { paidBookingCreatedDayIndexKey, paidBookingRefKey } from "../workers/addresses/shared/paid-booking-record";
import { handlePromoRequest, setPromoClockForTests } from "../workers/addresses/src/promo-handlers";
import { setCustomerSendSleepForTests } from "../workers/addresses/src/promo-customer-send";
import { handleMarketingUnsubscribeRequest } from "../workers/addresses/src/marketing-handlers";
import { recordMarketingOptIn, listMarketingSubscribers } from "../workers/addresses/src/marketing-store";
import {
  checkPromoCodeForBooking,
  issueOrResendPromoCode,
  promoEmailHash,
  redeemPromoCode,
  reservePromoCode,
  type PromoDb,
} from "../workers/addresses/src/promo-store";
import { DEFAULT_PROMO_SETTINGS } from "../shared/promo-code";

function d1(db: DatabaseSync): PromoDb {
  const make = (sql: string, values: unknown[] = []) => ({
    bind: (...v: unknown[]) => make(sql, v),
    first: async <T>() => (db.prepare(sql).get(...(values as never[])) as T) ?? null,
    all: async <T>() => ({ results: db.prepare(sql).all(...(values as never[])) as T[] }),
    run: async () => db.prepare(sql).run(...(values as never[])),
  });
  return { prepare: (sql: string) => make(sql) } as unknown as PromoDb;
}

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

function londonToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

const T0 = new Date("2026-11-17T10:00:00Z");

async function main() {
  /* ------------------------------------------------------------ pure rules */
  await check("customers: one row per email, newest trip name, cancelled only if every booking was", () => {
    const rows = customersFromBookings([
      { customerName: "Ann Old", customerEmail: "Ann@Example.com", tripDate: "2026-09-01" },
      { customerName: "Ann New", customerEmail: "ann@example.com", tripDate: "2026-10-01", operationalStatus: "cancelled" },
      { customerName: "Bob", customerEmail: "bob@example.com", tripDate: "2026-11-01", paymentStatus: "fully_refunded" },
      { customerName: "Cy", customerEmail: "cy@example.com", tripDate: "2026-08-01", paymentStatus: "partially_refunded", amountRefunded: 10 },
      { customerName: "No email", customerEmail: "", tripDate: "2026-11-02" },
    ]);
    assert.deepEqual(
      rows.map((r) => [r.email, r.name, r.bookings, r.lastTripDate, r.refundedOrCancelled]),
      [
        ["bob@example.com", "Bob", 1, "2026-11-01", true],
        ["ann@example.com", "Ann New", 2, "2026-10-01", false],
        ["cy@example.com", "Cy", 1, "2026-08-01", false],
      ],
    );
  });

  await check("owner's own addresses are never customers; first names are tidy", () => {
    assert.ok(isOwnerAddress("bookings@myairporttaxini.co.uk"));
    assert.ok(isOwnerAddress("Colin.Rice@icloud.com", ["colin.rice@icloud.com"]));
    assert.ok(!isOwnerAddress("someone@gmail.com"));
    assert.equal(firstName("JOY KENNEDY"), "Joy");
    assert.equal(firstName("Mrs Arlene small"), "");
    assert.equal(firstName("  "), "");
  });

  await check("offer email: code, expiry, terms, unsubscribe link, no phone numbers or prices", () => {
    const m = buildCustomerOfferEmail({
      code: "MATNI-7KQ4-X9PR",
      expiresAt: "2026-12-01T10:00:00.000Z",
      discountRate: 0.1,
      minimumVehicleFareGbp: 100,
      name: "jill matchett",
      hasExcludedDates: true,
      unsubscribeUrl: "https://www.myairporttaxini.co.uk/unsubscribe/?t=abc",
    });
    assert.equal(m.subject, "A thank-you from My Airport Taxi NI: 10% off your next journey");
    for (const part of [m.text, m.html]) {
      assert.ok(part.includes("MATNI-7KQ4-X9PR"));
      assert.ok(part.includes("1 December 2026"), "expiry date shown");
      assert.ok(part.includes("Hi Jill,"));
      assert.ok(part.includes("unsubscribe/?t=abc"));
      assert.ok(part.includes("Minimum eligible vehicle fare £100"));
      assert.ok(part.includes("peak travel dates are excluded"));
      assert.ok(!/028 9602|07549/.test(part), "no phone numbers");
    }
    assert.ok(m.html.includes("?promo=MATNI-7KQ4-X9PR#quote"), "button pre-fills the code");
  });

  /* ------------------------------------------------------------ routes */
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync("workers/addresses/migrations/driver-db/0005_promo_codes.sql", "utf8"));
  const db = d1(sqlite);

  const kvStore = new Map<string, string>();
  const kv = {
    async get(key: string, type?: string) {
      const v = kvStore.get(key);
      return v == null ? null : type === "json" ? JSON.parse(v) : v;
    },
    async put(key: string, value: string) {
      kvStore.set(key, value);
    },
    async delete(key: string) {
      kvStore.delete(key);
    },
    async list(opts: { prefix?: string }) {
      const keys = [...kvStore.keys()].filter((k) => k.startsWith(opts?.prefix ?? "")).map((name) => ({ name }));
      return { keys, list_complete: true, cursor: undefined };
    },
  } as unknown as KVNamespace;

  // Paid bookings (created today so they sit in today's created-day index).
  const today = londonToday();
  const booking = (ref: string, name: string, email: string, extra: Record<string, unknown> = {}) => ({
    paymentReference: ref,
    customerName: name,
    customerEmail: email,
    tripDate: "2026-11-20",
    tripTime: "10:00",
    createdAt: new Date().toISOString(),
    status: "committed",
    ...extra,
  });
  const bookings = [
    booking("MAT-1", "Jill Matchett", "jill@example.com"),
    booking("MAT-2", "Ron Marsh", "ron@example.com"),
    booking("MAT-3", "Faith Miller", "faith@example.com", { operationalStatus: "cancelled" }),
    booking("MAT-4", "colin rice", "bookings@myairporttaxini.co.uk"),
    booking("MAT-5", "Used Already", "used@example.com"),
    booking("MAT-6", "Said No", "no@example.com"),
    booking("REFUND-TEST-7", "Test Booking", "test@example.com"),
  ];
  for (const b of bookings) kvStore.set(paidBookingRefKey(b.paymentReference), JSON.stringify(b));
  kvStore.set(paidBookingCreatedDayIndexKey(today), JSON.stringify(bookings.map((b) => b.paymentReference)));

  // used@ already redeemed a website code; no@ unsubscribed from offers earlier.
  const usedHash = await promoEmailHash("used@example.com", "");
  const used = await issueOrResendPromoCode(db, { email: "used@example.com", emailHash: usedHash, settings: DEFAULT_PROMO_SETTINGS, now: new Date("2026-11-01T10:00:00Z"), source: "popup", marketingOptIn: false });
  assert.equal(used.kind, "issued");
  if (used.kind === "issued") {
    const ok = await reservePromoCode(db, { code: used.code, emailHash: usedHash, key: "chk-1", until: new Date("2026-11-03T10:00:00Z"), now: new Date("2026-11-02T10:00:00Z") });
    assert.ok(ok);
    const r = await redeemPromoCode(db, { code: used.code, key: "chk-1", bookingReference: "MAT-5", discountGbp: 15, vehicleFareGbp: 150, bookingTotalGbp: 135, now: new Date("2026-11-02T10:00:00Z") });
    assert.equal(r, "redeemed");
  }
  await recordMarketingOptIn(kv, { email: "no@example.com", source: "paid-booking" });
  await handleMarketingUnsubscribeRequest(
    new Request("https://w/marketing/unsubscribe", { method: "POST", body: JSON.stringify({ email: "no@example.com" }) }),
    { TRACKING_STORE: kv },
    null,
  );

  const sent: Array<{ to: unknown; subject: string; text: string; html?: string; headers?: unknown }> = [];
  const originalFetch = globalThis.fetch;
  let failFor = "";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (new URL(request.url).hostname === "api.resend.com") {
      const body = (await request.json()) as { to: unknown; subject: string; text: string; html?: string };
      if (failFor && JSON.stringify(body.to).includes(failFor)) return new Response(JSON.stringify({ message: "down" }), { status: 500 });
      sent.push(body);
      return Response.json({ id: `email-${sent.length}` });
    }
    throw new Error(`Unexpected fetch ${request.url}`);
  }) as typeof fetch;
  setCustomerSendSleepForTests(async () => {});
  setPromoClockForTests(() => T0);

  const env: Record<string, unknown> = {
    DRIVER_DB: db,
    TRACKING_STORE: kv,
    RESEND_API_KEY: "test",
    BOOKING_FROM_EMAIL: "bookings@myairporttaxini.co.uk",
    OWNER_ACCESS_KEY: "owner-secret",
  };
  const call = (path: string, body?: unknown, key = "owner-secret") =>
    handlePromoRequest(
      new Request(`https://worker.example${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: { "Content-Type": "application/json", "X-Owner-Key": key },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      env as never,
      "https://www.myairporttaxini.co.uk",
    );

  type Row = { email: string; exclusions: string[]; sendable: boolean; suggested: boolean };
  const list = async () => ((await (await call("/owner/promo/customers")).json()) as { customers: Row[] }).customers;
  const byEmail = (rows: Row[]) => Object.fromEntries(rows.map((r) => [r.email, r]));

  try {
    await check("customer list is owner-only", async () => {
      assert.equal((await call("/owner/promo/customers", undefined, "wrong")).status, 401);
    });

    await check("customer list: who can get a code and who is ticked", async () => {
      const rows = byEmail(await list());
      assert.ok(!rows["test@example.com"], "test bookings are not customers");
      assert.deepEqual(rows["jill@example.com"].exclusions, []);
      assert.equal(rows["jill@example.com"].suggested, true);
      assert.deepEqual(rows["faith@example.com"].exclusions, ["refunded_or_cancelled"]);
      assert.equal(rows["faith@example.com"].sendable, true, "owner may still tick a cancelled customer");
      assert.equal(rows["faith@example.com"].suggested, false, "but it's unticked by default");
      assert.deepEqual(rows["bookings@myairporttaxini.co.uk"].exclusions, ["owner_address"]);
      assert.equal(rows["bookings@myairporttaxini.co.uk"].sendable, false);
      assert.deepEqual(rows["used@example.com"].exclusions, ["already_used_code"]);
      assert.deepEqual(rows["no@example.com"].exclusions, ["unsubscribed"]);
    });

    await check("send needs confirmation and a small batch", async () => {
      assert.equal((await call("/owner/promo/customers/send", { emails: ["jill@example.com"] })).status, 400);
      const many = Array.from({ length: 21 }, (_, i) => `p${i}@example.com`);
      assert.equal((await call("/owner/promo/customers/send", { emails: many, confirm: true })).status, 400);
      assert.equal(sent.length, 0);
    });

    await check("test copy: real layout, sample code, nothing stored", async () => {
      const res = await call("/owner/promo/customers/send", { test: true, validityDays: 14 });
      assert.equal(res.status, 200);
      assert.equal(sent.length, 1);
      assert.ok(sent[0].subject.startsWith("[Test] "));
      assert.ok(sent[0].text.includes(CUSTOMER_OFFER_SAMPLE_CODE));
      assert.deepEqual(JSON.stringify(sent[0].to).includes("bookings@myairporttaxini.co.uk"), true);
      const n = sqlite.prepare("SELECT COUNT(*) AS n FROM promo_codes").get() as { n: number };
      assert.equal(n.n, 1, "only the pre-existing used code");
      sent.length = 0;
    });

    let jillCode = "";
    await check("send: own 14-day code each, only real customers, hard exclusions skipped", async () => {
      const res = await call("/owner/promo/customers/send", {
        emails: ["jill@example.com", "Ron@Example.com", "bookings@myairporttaxini.co.uk", "used@example.com", "no@example.com", "stranger@example.com", "faith@example.com"],
        validityDays: 14,
        confirm: true,
      });
      assert.equal(res.status, 200);
      const json = (await res.json()) as { results: Array<{ email: string; outcome: string; code?: string; reason?: string }>; expiresAt: string };
      const out = Object.fromEntries(json.results.map((r) => [r.email, r]));
      assert.equal(out["jill@example.com"].outcome, "sent");
      assert.equal(out["ron@example.com"].outcome, "sent");
      assert.equal(out["faith@example.com"].outcome, "sent", "ticked by the owner on purpose");
      assert.equal(out["bookings@myairporttaxini.co.uk"].reason, "owner_address");
      assert.equal(out["used@example.com"].reason, "already_used_code");
      assert.equal(out["no@example.com"].reason, "unsubscribed");
      assert.equal(out["stranger@example.com"].reason, "Not a past customer");
      assert.equal(sent.length, 3);
      assert.equal(json.expiresAt, "2026-12-01T10:00:00.000Z", "14 days from sending");
      jillCode = out["jill@example.com"].code ?? "";
      const row = sqlite.prepare("SELECT * FROM promo_codes WHERE code = ?").get(jillCode) as Record<string, unknown>;
      assert.equal(row.source, "customer-list");
      assert.equal(row.expires_at, "2026-12-01T10:00:00.000Z");
      assert.equal(row.email_send_count, 1);
      assert.equal(row.marketing_opt_in, 0, "a thank-you offer is not a marketing opt-in");
      const jillMail = sent.find((m) => JSON.stringify(m.to).includes("jill@example.com"))!;
      assert.ok(jillMail.text.includes(jillCode));
      assert.ok(jillMail.text.includes("Hi Jill,"));
      assert.match(jillMail.text, /unsubscribe\/\?t=[a-f0-9]{36}/);
      sent.length = 0;
    });

    await check("the code works at checkout for that customer only", async () => {
      const ok = await checkPromoCodeForBooking(db, { code: jillCode, bookingEmail: "jill@example.com", now: T0 });
      assert.ok(ok.ok);
      const other = await checkPromoCodeForBooking(db, { code: jillCode, bookingEmail: "ron@example.com", now: T0 });
      assert.equal(other.ok, false);
    });

    await check("sending again never doubles up", async () => {
      const res = await call("/owner/promo/customers/send", { emails: ["jill@example.com"], confirm: true });
      const json = (await res.json()) as { results: Array<{ outcome: string; reason?: string }> };
      assert.equal(json.results[0].outcome, "skipped");
      assert.equal(json.results[0].reason, "has_active_code");
      assert.equal(sent.length, 0);
      const rows = byEmail(await list());
      assert.deepEqual(rows["jill@example.com"].exclusions, ["has_active_code"]);
      assert.equal(rows["jill@example.com"].suggested, false);
    });

    await check("unsubscribe from the offer email: no more offers, never added to the opt-in list", async () => {
      const ronToken = kvStore.get("marketing:custtoken:ron@example.com");
      assert.ok(ronToken);
      await handleMarketingUnsubscribeRequest(
        new Request("https://w/marketing/unsubscribe", { method: "POST", body: JSON.stringify({ token: ronToken }) }),
        { TRACKING_STORE: kv },
        null,
      );
      const subs = await listMarketingSubscribers(kv);
      assert.ok(!subs.some((s) => s.email === "ron@example.com"), "not on the marketing list");
      const rows = byEmail(await list());
      assert.ok(rows["ron@example.com"].exclusions.includes("unsubscribed"));
      assert.equal(rows["ron@example.com"].sendable, false);
      // Opting in again later lifts the "no offers".
      await recordMarketingOptIn(kv, { email: "ron@example.com", source: "paid-booking" });
      assert.ok(!kvStore.has("marketing:optout:ron@example.com"));
    });

    await check("a failed email withdraws that customer's code so it can be retried", async () => {
      kvStore.set(paidBookingRefKey("MAT-8"), JSON.stringify(booking("MAT-8", "Kim Coney", "kim@example.com")));
      const idx = JSON.parse(kvStore.get(paidBookingCreatedDayIndexKey(today))!);
      kvStore.set(paidBookingCreatedDayIndexKey(today), JSON.stringify([...idx, "MAT-8"]));
      failFor = "kim@example.com";
      const res = await call("/owner/promo/customers/send", { emails: ["kim@example.com"], confirm: true });
      const json = (await res.json()) as { results: Array<{ outcome: string }> };
      assert.equal(json.results[0].outcome, "failed");
      const n = sqlite.prepare("SELECT COUNT(*) AS n FROM promo_codes WHERE email = 'kim@example.com'").get() as { n: number };
      assert.equal(n.n, 0);
      failFor = "";
      const retry = (await (await call("/owner/promo/customers/send", { emails: ["kim@example.com"], confirm: true })).json()) as { results: Array<{ outcome: string }> };
      assert.equal(retry.results[0].outcome, "sent");
      sent.length = 0;
    });

    await check("preview site: codes shown on screen, no email sent", async () => {
      env.PROMO_PREVIEW_MODE = "1";
      kvStore.set(paidBookingRefKey("MAT-9"), JSON.stringify(booking("MAT-9", "Peter Gracey", "peter@example.com")));
      const idx = JSON.parse(kvStore.get(paidBookingCreatedDayIndexKey(today))!);
      kvStore.set(paidBookingCreatedDayIndexKey(today), JSON.stringify([...idx, "MAT-9"]));
      const json = (await (await call("/owner/promo/customers/send", { emails: ["peter@example.com"], confirm: true })).json()) as {
        preview: boolean;
        results: Array<{ outcome: string; code?: string }>;
      };
      assert.equal(json.preview, true);
      assert.equal(json.results[0].outcome, "preview");
      assert.match(json.results[0].code ?? "", /^MATNI-/);
      assert.equal(sent.length, 0);
      delete env.PROMO_PREVIEW_MODE;
    });
  } finally {
    globalThis.fetch = originalFetch;
    setPromoClockForTests(null);
    setCustomerSendSleepForTests(null);
  }

  console.log(`\n${passed} customer-list checks passed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
