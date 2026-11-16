/**
 * Email promo codes (10% welcome discount) — rules, storage, routes and lifecycle.
 * Real SQLite (node:sqlite) through the D1 API shape, real migration file, stubbed email.
 * Run: npx tsx scripts/check-promo-codes.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  DEFAULT_PROMO_SETTINGS,
  PROMO_MARKETING_CONSENT_WORDING,
  PROMO_REQUEST_ACCEPTED_MESSAGE,
  canonicalPromoEmail,
  generatePromoCode,
  normalizePromoCode,
  normalizePromoEmail,
  promoCodesCsv,
  promoDisplayStatus,
  promoBlackoutFor,
  promoBlackoutMessage,
  promoMeetsMinimum,
  validatePromoSettingsInput,
} from "../shared/promo-code";
import { composeWebsiteFareBreakdown, customerFacingFareBreakdown } from "../shared/website-fare-breakdown";
import { formatCustomerPromoPricingLines, promoFieldsFromFareBreakdown } from "../shared/website-promo-pricing";
import { buildPromoCodeEmail } from "../shared/promo-email";
import {
  LEGACY_RETURN_JOURNEY_DISCOUNT_RATE,
  RETURN_JOURNEY_DISCOUNT_RATE,
  getWebsiteReturnJourneyFare,
  returnDiscountRateForRecord,
} from "../shared/return-journey-discount";
import { resolvePersonalQuoteCheckoutAmount } from "../shared/personal-quote";
import {
  checkPromoCodeForBooking,
  deactivatePromoCode,
  expireStalePromoCodes,
  getPromoSettings,
  issueOrResendPromoCode,
  listPromoCodes,
  promoEmailHash,
  promoStats,
  rebindPromoReservation,
  redeemPromoCode,
  reinstatePromoCode,
  releasePromoReservation,
  reservePromoCode,
  runPromoRetention,
  savePromoSettings,
  type PromoDb,
} from "../workers/addresses/src/promo-store";
import { handlePromoRequest, setPromoClockForTests } from "../workers/addresses/src/promo-handlers";
import {
  promoHoldUntilPickup,
  redeemPromoForPaidBooking,
  reinstatePromoForCancelledBooking,
} from "../workers/addresses/src/promo-checkout";
import { retireReturnBookingDiscount, savedQuotePricingFor } from "../workers/addresses/src/owner-pricing-store";
import { defaultOwnerPricingSettings } from "../shared/owner-pricing-config";

function d1(db: DatabaseSync): PromoDb {
  const make = (sql: string, values: unknown[] = []) => ({
    bind: (...v: unknown[]) => make(sql, v),
    first: async <T>() => (db.prepare(sql).get(...(values as never[])) as T) ?? null,
    all: async <T>() => ({ results: db.prepare(sql).all(...(values as never[])) as T[] }),
    run: async () => db.prepare(sql).run(...(values as never[])),
  });
  return { prepare: (sql: string) => make(sql) } as unknown as PromoDb;
}

function freshDb() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync("workers/addresses/migrations/driver-db/0005_promo_codes.sql", "utf8"));
  return { sqlite, db: d1(sqlite) };
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

const T0 = new Date("2026-11-16T12:00:00Z");
const days = (n: number) => new Date(T0.getTime() + n * 86_400_000);
const settings = { ...DEFAULT_PROMO_SETTINGS };
const terms = { code: "MATNI-AAAA-BBBB", discountRate: 0.1, minimumVehicleFareGbp: 100 };

async function main() {
  /* --------------------------------------------------------------- shared rules */
  await check("code format, normalisation and generation", () => {
    assert.equal(normalizePromoCode("matni 7kq4 x9pr"), "MATNI-7KQ4-X9PR");
    assert.equal(normalizePromoCode("MATNI-7KQ4X9PR"), "MATNI-7KQ4-X9PR");
    assert.equal(normalizePromoCode("MATNI-7KQ4-X9P0"), "", "0 is not in the alphabet");
    assert.equal(normalizePromoCode("SAVE10"), "");
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const code = generatePromoCode();
      assert.match(code, /^MATNI-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
      assert.equal(normalizePromoCode(code), code);
      seen.add(code);
    }
    assert.equal(seen.size, 2000, "no collisions in 2000 codes");
  });

  await check("one customer = one mailbox (Gmail dots, +tags, googlemail)", () => {
    assert.equal(canonicalPromoEmail("J.Smith+taxi@Gmail.com"), "jsmith@gmail.com");
    assert.equal(canonicalPromoEmail("jsmith@googlemail.com"), "jsmith@gmail.com");
    assert.equal(canonicalPromoEmail("a.b+x@outlook.com"), "a.b@outlook.com");
    assert.equal(normalizePromoEmail("not-an-email"), "");
  });

  await check("owner settings validation rejects out-of-range values", () => {
    assert.equal(validatePromoSettingsInput({ discountPercent: 50 }).ok, false);
    assert.equal(validatePromoSettingsInput({ validityDays: 0 }).ok, false);
    assert.equal(validatePromoSettingsInput({ minimumVehicleFareGbp: -1 }).ok, false);
    const ok = validatePromoSettingsInput({ discountPercent: 12.5, minimumVehicleFareGbp: 80, validityDays: 14, enabled: false });
    assert.ok(ok.ok);
    assert.deepEqual(ok.ok && ok.settings, { discountRate: 0.125, minimumVehicleFareGbp: 80, validityDays: 14, enabled: false });
  });

  await check("excluded dates: 14 Dec – 5 Jan by default, inclusive, either leg of a return", () => {
    const ranges = DEFAULT_PROMO_SETTINGS.blackoutDates;
    assert.deepEqual(ranges, [{ from: "2026-12-14", to: "2027-01-05", label: "Christmas & New Year" }]);
    assert.equal(promoBlackoutFor(["2026-12-13"], ranges), null);
    assert.equal(promoBlackoutFor(["2026-12-14"], ranges)?.date, "2026-12-14");
    assert.equal(promoBlackoutFor(["2027-01-05"], ranges)?.date, "2027-01-05");
    assert.equal(promoBlackoutFor(["2027-01-06"], ranges), null);
    assert.equal(promoBlackoutFor(["2026-12-10", "2027-01-02"], ranges)?.date, "2027-01-02", "return leg counts");
    assert.equal(promoBlackoutFor(["2026-12-10", null], ranges), null);
    assert.match(promoBlackoutMessage(promoBlackoutFor(["2026-12-25"], ranges)!), /25 Dec 2026 \(Christmas & New Year\)/);
    const bad = validatePromoSettingsInput({ blackoutDates: [{ from: "2026-12-20", to: "2026-12-10" }] });
    assert.equal(bad.ok, false);
    const one = validatePromoSettingsInput({ blackoutDates: [{ from: "2027-07-12", label: "Twelfth" }] });
    assert.ok(one.ok);
    assert.deepEqual(one.ok && one.settings.blackoutDates, [{ from: "2027-07-12", to: "2027-07-12", label: "Twelfth" }]);
    assert.deepEqual(validatePromoSettingsInput({ blackoutDates: [] }).ok && true, true, "owner can remove all dates");
  });

  await check("£100 minimum is compared in pence", () => {
    assert.equal(promoMeetsMinimum(100, 100), true);
    assert.equal(promoMeetsMinimum(99.99, 100), false);
    assert.equal(promoMeetsMinimum(99.995, 100), true, "rounds to £100.00");
  });

  /* --------------------------------------------------------------- 5% retired */
  await check("automatic 5% return discount is retired; legacy records keep their price", () => {
    assert.equal(RETURN_JOURNEY_DISCOUNT_RATE, 0);
    assert.equal(getWebsiteReturnJourneyFare(100), 200, "return = two full journeys");
    assert.equal(getWebsiteReturnJourneyFare(100, LEGACY_RETURN_JOURNEY_DISCOUNT_RATE), 190);
    assert.equal(returnDiscountRateForRecord({}), 0.05, "unstamped (older) record = 5% it was quoted with");
    assert.equal(returnDiscountRateForRecord({ returnDiscountRate: 0 }), 0);
    // Personal Quote (standard price, not personally discounted) issued before vs after the change.
    const before = resolvePersonalQuoteCheckoutAmount({ agreedAmount: 100, standardWebsiteAmount: 100, returnJourney: true, returnDiscountRate: returnDiscountRateForRecord({}) });
    const after = resolvePersonalQuoteCheckoutAmount({ agreedAmount: 100, standardWebsiteAmount: 100, returnJourney: true, returnDiscountRate: returnDiscountRateForRecord({ returnDiscountRate: 0 }) });
    assert.equal(before, 190);
    assert.equal(after, 200);
  });

  await check("live owner pricing ignores an old stored 5%; legacy saved quotes get it back", () => {
    const stored = { ...defaultOwnerPricingSettings(), returnDiscount: { rate: 0.05 } };
    const live = retireReturnBookingDiscount(stored);
    assert.equal(live.returnDiscount.rate, 0);
    // Other pricing untouched (Christmas, minimums, Estate, airport fees).
    assert.deepEqual({ ...live, returnDiscount: stored.returnDiscount }, stored);
    assert.equal(savedQuotePricingFor(live, {}).returnDiscount.rate, 0.05);
    assert.equal(savedQuotePricingFor(live, { returnDiscountRate: 0 }).returnDiscount.rate, 0);
  });

  /* --------------------------------------------------------------- fare maths */
  await check("one-way: 10% of the vehicle fare, airport charges excluded", () => {
    const b = composeWebsiteFareBreakdown({
      journeyFareBeforeAirportAccessGbp: 160, // vehicle fare 150 + airport fixed 10 are both inside
      airportFixedCostsGbp: 10,
      airportAccessChargeGbp: 5,
      promoCode: terms,
    });
    // transfer = journey 160 incl. 10 fixed? -> composeWebsiteFareBreakdown treats journeyFare as journey only
    assert.equal(b.promoCodeStatus, "applied");
    assert.equal(b.promoEligibleVehicleFareGbp, 160);
    assert.equal(b.promoCodeSavingGbp, 16);
    assert.equal(b.finalAmountPayableGbp, 160 + 10 + 5 - 16);
    assert.equal(b.totalPromotionalSavingGbp, 16);
  });

  await check("return: combined outward + return fare is discounted, airport charges never", () => {
    const b = composeWebsiteFareBreakdown({
      journeyFareBeforeAirportAccessGbp: 300,
      airportFixedCostsGbp: 13,
      outboundAirportAccessChargeGbp: 5,
      returnAirportAccessChargeGbp: 5,
      returnJourney: true,
      promoCode: terms,
    });
    assert.equal(b.returnJourneySavingGbp, 0, "no automatic return discount any more");
    assert.equal(b.promoCodeSavingGbp, 30);
    assert.equal(b.finalAmountPayableGbp, 300 + 13 + 10 - 30);
  });

  await check("minimum vehicle fare £100: exactly £100 qualifies, £99 does not", () => {
    const at = composeWebsiteFareBreakdown({ journeyFareBeforeAirportAccessGbp: 100, airportFixedCostsGbp: 40, promoCode: terms });
    assert.equal(at.promoCodeStatus, "applied");
    assert.equal(at.promoCodeSavingGbp, 10);
    const below = composeWebsiteFareBreakdown({ journeyFareBeforeAirportAccessGbp: 99, airportFixedCostsGbp: 40, promoCode: terms });
    assert.equal(below.promoCodeStatus, "below_minimum", "airport charges never count towards the minimum");
    assert.equal(below.promoCodeSavingGbp, 0);
    assert.equal(below.finalAmountPayableGbp, 139);
  });

  await check("Christmas / time-of-day pricing is part of the vehicle fare and is discounted with it", () => {
    // Engine journey fare 144 includes a 24 Christmas surcharge (20% of 120).
    const b = composeWebsiteFareBreakdown({ journeyFareBeforeAirportAccessGbp: 144, nightWeekendSurchargeGbp: 24, promoCode: terms });
    assert.equal(b.promoEligibleVehicleFareGbp, 144);
    assert.equal(b.nightWeekendSurchargeGbp, 24, "the surcharge itself is untouched");
    assert.equal(b.promoCodeSavingGbp, 14, "£14.40 rounds with the whole-pound payable");
    assert.equal(b.finalAmountPayableGbp, 130);
  });

  await check("rows always add up to the amount payable (whole-pound rounding)", () => {
    for (const journey of [100, 101.5, 137, 149.99, 233.33, 417.6]) {
      for (const fixed of [0, 5, 13]) {
        for (const access of [0, 4.5]) {
          const b = composeWebsiteFareBreakdown({ journeyFareBeforeAirportAccessGbp: journey, airportFixedCostsGbp: fixed, airportAccessChargeGbp: access, promoCode: terms });
          const plain = composeWebsiteFareBreakdown({ journeyFareBeforeAirportAccessGbp: journey, airportFixedCostsGbp: fixed, airportAccessChargeGbp: access });
          assert.equal(Math.round((plain.finalAmountPayableGbp - b.finalAmountPayableGbp) * 100) / 100, b.promoCodeSavingGbp, "saving = exact drop in payable");
          assert.ok(Math.abs(b.promoCodeSavingGbp - journey * 0.1) < 1, "saving within rounding of 10%");
          const shown = customerFacingFareBreakdown(b);
          const rows = shown.journeyFareBeforePromotionsGbp - b.promoCodeSavingGbp + shown.airportFixedCostsGbp + shown.airportAccessChargeGbp;
          assert.equal(Math.round(rows * 100) / 100, b.finalAmountPayableGbp, `${journey}/${fixed}/${access}`);
          // Confirmation email rows add up too.
          const fields = promoFieldsFromFareBreakdown(b);
          assert.equal(fields.promoCode, terms.code);
          const lines = formatCustomerPromoPricingLines(fields);
          assert.ok(lines.some((l) => l.startsWith("10% promo code (MATNI-AAAA-BBBB): −")), lines.join("|"));
        }
      }
    }
  });

  await check("no code = identical breakdown to before (no hidden change to fares)", () => {
    const a = composeWebsiteFareBreakdown({ journeyFareBeforeAirportAccessGbp: 187.4, airportFixedCostsGbp: 13, airportAccessChargeGbp: 5, returnJourney: true });
    assert.equal(a.promoCodeStatus, "none");
    assert.equal(a.promoCodeSavingGbp, 0);
    assert.equal(a.finalAmountPayableGbp, 187 + 13 + 5);
  });

  /* --------------------------------------------------------------- storage */
  await check("issue, resend the same code, one live code per customer", async () => {
    const { db } = freshDb();
    const hash = await promoEmailHash("jane.doe@gmail.com");
    const first = await issueOrResendPromoCode(db, { email: "jane.doe@gmail.com", emailHash: hash, settings, now: T0, source: "popup", marketingOptIn: false });
    assert.equal(first.kind, "issued");
    assert.ok("code" in first);
    assert.equal(first.kind === "issued" && first.expiresAt, days(30).toISOString(), "30 days from issue");
    // Same mailbox spelled differently → same code, not a second one.
    const hash2 = await promoEmailHash("JaneDoe+promo@googlemail.com");
    assert.equal(hash2, hash);
    const again = await issueOrResendPromoCode(db, { email: "JaneDoe+promo@googlemail.com", emailHash: hash2, settings, now: days(1), source: "popup", marketingOptIn: true });
    assert.equal(again.kind, "resend");
    assert.equal("code" in again && again.code, "code" in first && first.code);
  });

  await check("concurrent first requests never create two live codes", async () => {
    const { db, sqlite } = freshDb();
    const hash = await promoEmailHash("race@example.com");
    const results = await Promise.all(
      Array.from({ length: 5 }, () => issueOrResendPromoCode(db, { email: "race@example.com", emailHash: hash, settings, now: T0, source: "popup", marketingOptIn: false })),
    );
    const live = sqlite.prepare("SELECT COUNT(*) AS n FROM promo_codes WHERE email_hash = ? AND status IN ('active','reserved')").get(hash) as { n: number };
    assert.equal(live.n, 1);
    assert.equal(new Set(results.map((r) => ("code" in r ? r.code : ""))).size, 1);
  });

  await check("codes expire after 30 days; an unused expired code may be replaced", async () => {
    const { db } = freshDb();
    const hash = await promoEmailHash("exp@example.com");
    const first = await issueOrResendPromoCode(db, { email: "exp@example.com", emailHash: hash, settings, now: T0, source: "popup", marketingOptIn: false });
    const code = "code" in first ? first.code : "";
    const at29 = await checkPromoCodeForBooking(db, { code, bookingEmail: "exp@example.com", now: days(29.9) });
    assert.equal(at29.ok, true);
    const at30 = await checkPromoCodeForBooking(db, { code, bookingEmail: "exp@example.com", now: days(30) });
    assert.deepEqual(at30, { ok: false, reason: "expired" });
    assert.equal(await expireStalePromoCodes(db, days(31)), 1);
    const second = await issueOrResendPromoCode(db, { email: "exp@example.com", emailHash: hash, settings, now: days(31), source: "popup", marketingOptIn: false });
    assert.equal(second.kind, "issued");
    assert.notEqual("code" in second && second.code, code);
  });

  await check("invalid, wrong-email, deactivated and already-used codes are refused", async () => {
    const { db } = freshDb();
    const hash = await promoEmailHash("owner@example.com");
    const issued = await issueOrResendPromoCode(db, { email: "owner@example.com", emailHash: hash, settings, now: T0, source: "popup", marketingOptIn: false });
    const code = "code" in issued ? issued.code : "";
    assert.deepEqual(await checkPromoCodeForBooking(db, { code: "MATNI-ZZZZ-ZZZZ", bookingEmail: "owner@example.com", now: T0 }), { ok: false, reason: "not_found" });
    assert.deepEqual(await checkPromoCodeForBooking(db, { code, bookingEmail: "friend@example.com", now: T0 }), { ok: false, reason: "email_mismatch" });
    assert.equal((await checkPromoCodeForBooking(db, { code, bookingEmail: "OWNER@example.com", now: T0 })).ok, true, "case-insensitive email");
    assert.equal(await redeemPromoCode(db, { code, key: "cs_1", bookingReference: "MAT-1001", discountGbp: 15, vehicleFareGbp: 150, bookingTotalGbp: 140, now: T0 }), "redeemed");
    assert.deepEqual(await checkPromoCodeForBooking(db, { code, bookingEmail: "owner@example.com", now: T0 }), { ok: false, reason: "redeemed" });
    // Used customers get no new code.
    assert.deepEqual(await issueOrResendPromoCode(db, { email: "owner@example.com", emailHash: hash, settings, now: days(40), source: "popup", marketingOptIn: false }), { kind: "already_used" });
    // Deactivated.
    const h2 = await promoEmailHash("abuse@example.com");
    const other = await issueOrResendPromoCode(db, { email: "abuse@example.com", emailHash: h2, settings, now: T0, source: "popup", marketingOptIn: false });
    const code2 = "code" in other ? other.code : "";
    assert.equal(await deactivatePromoCode(db, { code: code2, reason: "test", now: T0 }), true);
    assert.deepEqual(await checkPromoCodeForBooking(db, { code: code2, bookingEmail: "abuse@example.com", now: T0 }), { ok: false, reason: "deactivated" });
    assert.deepEqual(await issueOrResendPromoCode(db, { email: "abuse@example.com", emailHash: h2, settings, now: days(1), source: "popup", marketingOptIn: false }), { kind: "blocked" });
  });

  await check("reservations: hold, move, release, never after redemption", async () => {
    const { db } = freshDb();
    const hash = await promoEmailHash("hold@example.com");
    const issued = await issueOrResendPromoCode(db, { email: "hold@example.com", emailHash: hash, settings, now: T0, source: "popup", marketingOptIn: false });
    const code = "code" in issued ? issued.code : "";
    assert.equal(await reservePromoCode(db, { code, emailHash: hash, key: "pending:a", until: days(0.02), now: T0 }), true);
    assert.equal(await rebindPromoReservation(db, { code, fromKey: "pending:a", toKey: "cs_A", until: days(1) }), true);
    // Same customer starts again (changed booking): the hold moves to the new checkout.
    assert.equal(await reservePromoCode(db, { code, emailHash: hash, key: "cs_B", until: days(1), now: T0 }), true);
    assert.equal(await releasePromoReservation(db, { key: "cs_A" }), 0, "old checkout no longer holds it");
    assert.equal(await releasePromoReservation(db, { key: "cs_B" }), 1, "expired / failed payment frees the code");
    const otherHash = await promoEmailHash("someone@else.com");
    assert.equal(await reservePromoCode(db, { code, emailHash: otherHash, key: "cs_X", until: days(1), now: T0 }), false, "another email can never hold it");
    assert.equal(await redeemPromoCode(db, { code, key: "cs_C", bookingReference: "MAT-2001", discountGbp: 12, vehicleFareGbp: 120, bookingTotalGbp: 118, now: T0 }), "redeemed");
    assert.equal(await reservePromoCode(db, { code, emailHash: hash, key: "cs_D", until: days(1), now: T0 }), false, "spent code cannot be held again");
  });

  await check("double redemption: first wins, the second is flagged for the owner, retries are idempotent", async () => {
    const { db } = freshDb();
    const hash = await promoEmailHash("twice@example.com");
    const issued = await issueOrResendPromoCode(db, { email: "twice@example.com", emailHash: hash, settings, now: T0, source: "popup", marketingOptIn: false });
    const code = "code" in issued ? issued.code : "";
    const base = { code, discountGbp: 10, vehicleFareGbp: 100, bookingTotalGbp: 95, now: T0 };
    const [a, b] = await Promise.all([
      redeemPromoCode(db, { ...base, key: "cs_1", bookingReference: "MAT-1" }),
      redeemPromoCode(db, { ...base, key: "cs_2", bookingReference: "MAT-2" }),
    ]);
    assert.deepEqual([a, b].sort(), ["conflict", "redeemed"]);
    assert.equal(await redeemPromoCode(db, { ...base, key: a === "redeemed" ? "cs_1" : "cs_2", bookingReference: a === "redeemed" ? "MAT-1" : "MAT-2" }), "already_redeemed_by_this_booking");
    const rows = await listPromoCodes(db, { now: T0 });
    assert.equal(rows[0].conflict, true);
    const alerts: string[] = [];
    const env = { DRIVER_DB: db };
    const outcome = await redeemPromoForPaidBooking(env, {
      booking: { promoCode: code, promoCodeSavingGbp: 10, promoEligibleVehicleFareGbp: 100, finalAmountPayableGbp: 95 },
      checkoutId: "cs_3",
      bookingReference: "MAT-3",
      amountGbp: 95,
      alertOwner: async (subject) => {
        alerts.push(subject);
      },
    });
    assert.equal(outcome, "conflict");
    assert.match(alerts[0], /used twice/);
  });

  await check("full cancellation + refund reinstates the code (until its original expiry)", async () => {
    const { db } = freshDb();
    const hash = await promoEmailHash("cancel@example.com");
    const issued = await issueOrResendPromoCode(db, { email: "cancel@example.com", emailHash: hash, settings, now: T0, source: "popup", marketingOptIn: false });
    const code = "code" in issued ? issued.code : "";
    await redeemPromoCode(db, { code, key: "cs_1", bookingReference: "MAT-9", discountGbp: 10, vehicleFareGbp: 100, bookingTotalGbp: 95, now: T0 });
    const env = { DRIVER_DB: db };
    assert.equal(await reinstatePromoForCancelledBooking(env, { promoCode: code, bookingReference: "MAT-9", refundedGbp: 50, paidGbp: 95 }), false, "partial refund keeps it used");
    assert.equal(await reinstatePromoForCancelledBooking(env, { promoCode: code, bookingReference: "MAT-9", refundedGbp: 95, paidGbp: 95, now: days(2) }), true);
    assert.equal((await checkPromoCodeForBooking(db, { code, bookingEmail: "cancel@example.com", now: days(3) })).ok, true);
    // Expired by the time it is reinstated → back as expired, not usable.
    await redeemPromoCode(db, { code, key: "cs_2", bookingReference: "MAT-10", discountGbp: 10, vehicleFareGbp: 100, bookingTotalGbp: 95, now: days(3) });
    assert.equal(await reinstatePromoCode(db, { code, bookingReference: "MAT-10", now: days(40) }), true);
    assert.deepEqual(await checkPromoCodeForBooking(db, { code, bookingEmail: "cancel@example.com", now: days(40) }), { ok: false, reason: "expired" });
  });

  await check("card holds and short-notice requests hold the code until pickup (max 14 days)", () => {
    const until = promoHoldUntilPickup({ tripDate: "2026-11-18", tripTime: "09:30" }, T0);
    assert.equal(until.toISOString(), "2026-11-19T09:30:00.000Z");
    const far = promoHoldUntilPickup({ tripDate: "2027-03-01", tripTime: "09:30" }, T0);
    assert.equal(far.getTime(), days(14).getTime());
  });

  await check("dashboard stats, display status and CSV (formula-safe)", async () => {
    const { db } = freshDb();
    for (const [i, email] of ["a@x.com", "b@x.com", "=cmd@x.com"].entries()) {
      const hash = await promoEmailHash(email);
      const r = await issueOrResendPromoCode(db, { email, emailHash: hash, settings, now: T0, source: "popup", marketingOptIn: i === 0 });
      if (i === 0 && "code" in r) await redeemPromoCode(db, { code: r.code, key: "cs", bookingReference: "MAT-1", discountGbp: 15, vehicleFareGbp: 150, bookingTotalGbp: 140, now: T0 });
    }
    const stats = await promoStats(db, T0);
    assert.equal(stats.issued, 3);
    assert.equal(stats.redeemed, 1);
    assert.equal(stats.active, 2);
    assert.equal(stats.discountTotalGbp, 15);
    assert.equal(stats.revenueTotalGbp, 140);
    assert.equal(stats.conversionRate, 0.333);
    assert.equal(stats.marketingOptIns, 1);
    const later = await promoStats(db, days(31));
    assert.equal(later.expired, 2);
    assert.equal(promoDisplayStatus({ status: "active", expiresAt: days(30).toISOString() }, days(31)), "expired");
    const csv = promoCodesCsv(await listPromoCodes(db, { now: T0 }));
    assert.ok(csv.includes("'=cmd@x.com"), "formula injection neutralised");
    assert.equal((await listPromoCodes(db, { now: T0, status: "redeemed" })).length, 1);
    assert.equal((await listPromoCodes(db, { now: T0, search: "b@x" })).length, 1);
  });

  await check("retention: request log 90 days, unused codes 12 months after expiry, emails erased 24 months after use", async () => {
    const { db, sqlite } = freshDb();
    const hash = await promoEmailHash("keep@x.com");
    const r = await issueOrResendPromoCode(db, { email: "keep@x.com", emailHash: hash, settings, now: T0, source: "popup", marketingOptIn: false });
    await redeemPromoCode(db, { code: "code" in r ? r.code : "", key: "cs", bookingReference: "MAT-1", discountGbp: 10, vehicleFareGbp: 100, bookingTotalGbp: 95, now: T0 });
    const h2 = await promoEmailHash("old@x.com");
    await issueOrResendPromoCode(db, { email: "old@x.com", emailHash: h2, settings, now: T0, source: "popup", marketingOptIn: false });
    sqlite.prepare("INSERT INTO promo_requests (at, email_hash, outcome) VALUES (?, ?, 'issued')").run(T0.toISOString(), hash);
    await runPromoRetention(db, days(100));
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS n FROM promo_requests").get() as { n: number }).n, 0);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS n FROM promo_codes").get() as { n: number }).n, 2);
    await runPromoRetention(db, days(30 + 366));
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS n FROM promo_codes").get() as { n: number }).n, 1, "unused expired code deleted");
    await runPromoRetention(db, days(731));
    const kept = sqlite.prepare("SELECT email, email_hash FROM promo_codes").get() as { email: string; email_hash: string };
    assert.equal(kept.email, "");
    assert.equal(kept.email_hash, hash, "hash kept: one welcome discount per customer still enforced");
    assert.deepEqual(await issueOrResendPromoCode(db, { email: "keep@x.com", emailHash: hash, settings, now: days(731), source: "popup", marketingOptIn: false }), { kind: "already_used" });
  });

  await check("settings persist and new terms apply only to new codes", async () => {
    const { db } = freshDb();
    const hash = await promoEmailHash("terms@x.com");
    const r = await issueOrResendPromoCode(db, { email: "terms@x.com", emailHash: hash, settings, now: T0, source: "popup", marketingOptIn: false });
    await savePromoSettings(db, { discountRate: 0.15, minimumVehicleFareGbp: 80 }, T0);
    const s = await getPromoSettings(db);
    assert.equal(s.discountRate, 0.15);
    const check1 = await checkPromoCodeForBooking(db, { code: "code" in r ? r.code : "", bookingEmail: "terms@x.com", now: T0 });
    assert.ok(check1.ok);
    assert.equal(check1.ok && check1.terms.discountRate, 0.1, "already-sent code keeps 10%");
  });

  /* --------------------------------------------------------------- routes */
  const sent: Array<{ to: unknown; subject: string; text: string; html?: string }> = [];
  const originalFetch = globalThis.fetch;
  let failEmail = false;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (new URL(request.url).hostname === "api.resend.com") {
      if (failEmail) return new Response(JSON.stringify({ message: "down" }), { status: 500 });
      sent.push(await request.json());
      return Response.json({ id: `email-${sent.length}` });
    }
    throw new Error(`Unexpected fetch ${request.url}`);
  }) as typeof fetch;

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
  } as unknown as KVNamespace;
  const { db: routeDb, sqlite: routeSql } = freshDb();
  const env = {
    DRIVER_DB: routeDb,
    TRACKING_STORE: kv,
    RESEND_API_KEY: "test",
    BOOKING_FROM_EMAIL: "bookings@myairporttaxini.co.uk",
    OWNER_ACCESS_KEY: "owner-secret",
  };
  setPromoClockForTests(() => T0);
  const call = (path: string, body?: unknown, headers: Record<string, string> = {}, ip = "203.0.113.5") =>
    handlePromoRequest(
      new Request(`https://worker.example${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip, Origin: "https://www.myairporttaxini.co.uk", ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      env,
      "https://www.myairporttaxini.co.uk",
    );

  try {
    await check("public config hides nothing personal and reflects the owner switch", async () => {
      const res = await call("/promo/config");
      const json = (await res.json()) as { config: Record<string, unknown> };
      assert.deepEqual(Object.keys(json.config).sort(), ["blackoutDates", "discountPercentLabel", "discountRate", "enabled", "minimumVehicleFareGbp", "popupDelaySeconds", "popupEnabled", "validityDays"]);
      assert.equal(json.config.enabled, true);
    });

    let issuedCode = "";
    await check("request: code emailed with exact expiry + booking link; no marketing unless ticked", async () => {
      const res = await call("/promo/request", { email: "Customer@Example.com", marketingOptIn: false, source: "popup" });
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { ok: true, message: PROMO_REQUEST_ACCEPTED_MESSAGE });
      assert.equal(sent.length, 1);
      assert.equal(sent[0].subject, "Your Exclusive 10% Airport Transfer Discount");
      assert.deepEqual(sent[0].to, ["customer@example.com"]);
      issuedCode = /MATNI-[A-Z0-9]{4}-[A-Z0-9]{4}/.exec(sent[0].text)![0];
      assert.ok(sent[0].text.includes("valid for 30 days from the date of issue, until Wednesday 16 December 2026"));
      assert.ok(sent[0].text.includes(`https://www.myairporttaxini.co.uk/?promo=${issuedCode}#quote`));
      assert.ok(sent[0].text.includes("Airport charges are excluded. Minimum eligible vehicle fare £100. One redemption per customer."));
      assert.ok(sent[0].html?.includes(issuedCode));
      assert.equal(kvStore.has("marketing:sub:customer@example.com"), false, "no marketing permission assumed");
      assert.equal((routeSql.prepare("SELECT COUNT(*) AS n FROM marketing_consents").get() as { n: number }).n, 0);
    });

    await check("request with the box ticked records consent (time + exact wording) separately", async () => {
      const res = await call("/promo/request", { email: "fan@example.com", marketingOptIn: true, source: "mobile-banner" }, {}, "203.0.113.6");
      assert.equal(res.status, 200);
      const sub = JSON.parse(kvStore.get("marketing:sub:fan@example.com")!);
      assert.equal(sub.source, "promo-signup");
      assert.equal(sub.consentWording, PROMO_MARKETING_CONSENT_WORDING);
      const row = routeSql.prepare("SELECT consented, wording, source FROM marketing_consents").get() as { consented: number; wording: string; source: string };
      assert.equal(row.consented, 1);
      assert.equal(row.wording, PROMO_MARKETING_CONSENT_WORDING);
      assert.equal(row.source, "promo-mobile-banner");
    });

    await check("same neutral reply for new, repeat and already-used addresses (no account enumeration)", async () => {
      sent.length = 0;
      // Repeat within 2 minutes: same reply, no second email (throttled).
      const repeat = await call("/promo/request", { email: "customer@example.com" }, {}, "203.0.113.7");
      assert.deepEqual(await repeat.json(), { ok: true, message: PROMO_REQUEST_ACCEPTED_MESSAGE });
      assert.equal(sent.length, 0);
      // Used address.
      await redeemPromoCode(routeDb, { code: issuedCode, key: "cs", bookingReference: "MAT-77", discountGbp: 10, vehicleFareGbp: 100, bookingTotalGbp: 95, now: T0 });
      const used = await call("/promo/request", { email: "customer@example.com" }, {}, "203.0.113.8");
      assert.deepEqual(await used.json(), { ok: true, message: PROMO_REQUEST_ACCEPTED_MESSAGE });
      assert.equal(sent.length, 1);
      assert.equal(sent[0].subject, "About your discount code request");
      assert.ok(!/MATNI-/.test(sent[0].text), "no new code for a used address");
    });

    await check("rate limits: per network address and per email", async () => {
      let last = 0;
      for (let i = 0; i < 8; i++) {
        const res = await call("/promo/request", { email: `bulk${i}@example.com` }, {}, "198.51.100.9");
        last = res.status;
      }
      assert.equal(last, 429);
      for (let i = 0; i < 6; i++) {
        const res = await call("/promo/request", { email: "hammer@example.com" }, {}, `192.0.2.${i}`);
        last = res.status;
      }
      assert.equal(last, 429);
    });

    await check("honeypot and invalid email", async () => {
      const before = sent.length;
      const bot = await call("/promo/request", { email: "bot@example.com", website: "http://spam" }, {}, "192.0.2.200");
      assert.equal(bot.status, 200);
      assert.equal(sent.length, before, "bots get the normal reply and nothing is sent");
      const bad = await call("/promo/request", { email: "nope" }, {}, "192.0.2.201");
      assert.equal(bad.status, 400);
    });

    await check("email failure: clear failure message and the unsent code is withdrawn", async () => {
      failEmail = true;
      const res = await call("/promo/request", { email: "unlucky@example.com" }, {}, "192.0.2.210");
      failEmail = false;
      assert.equal(res.status, 502);
      const row = routeSql.prepare("SELECT COUNT(*) AS n FROM promo_codes WHERE email = 'unlucky@example.com'").get() as { n: number };
      assert.equal(row.n, 0);
      const retry = await call("/promo/request", { email: "unlucky@example.com" }, {}, "192.0.2.211");
      assert.equal(retry.status, 200);
    });

    await check("validate: email match, used, minimum fare warning", async () => {
      const fanCode = (routeSql.prepare("SELECT code FROM promo_codes WHERE email = 'fan@example.com'").get() as { code: string }).code;
      const ok = (await (await call("/promo/validate", { code: fanCode.toLowerCase(), email: "fan@example.com", vehicleFareGbp: 150 })).json()) as Record<string, unknown>;
      assert.equal(ok.ok, true);
      assert.equal(ok.meetsMinimum, true);
      const low = (await (await call("/promo/validate", { code: fanCode, email: "fan@example.com", vehicleFareGbp: 80 })).json()) as Record<string, unknown>;
      assert.equal(low.meetsMinimum, false);
      assert.match(String(low.warning), /£100 or more/);
      const xmas = (await (await call("/promo/validate", { code: fanCode, email: "fan@example.com", vehicleFareGbp: 150, tripDate: "2026-12-10", returnDate: "2026-12-24" })).json()) as Record<string, unknown>;
      assert.equal(xmas.reason, "blackout_date");
      assert.match(String(xmas.error), /24 Dec 2026/);
      const wrong = (await (await call("/promo/validate", { code: fanCode, email: "thief@example.com" })).json()) as Record<string, unknown>;
      assert.equal(wrong.reason, "email_mismatch");
      const used = (await (await call("/promo/validate", { code: issuedCode, email: "customer@example.com" })).json()) as Record<string, unknown>;
      assert.equal(used.reason, "redeemed");
    });

    await check("owner routes need the Owner Dashboard key; settings, deactivate and exports work", async () => {
      assert.equal((await call("/owner/promo")).status, 401);
      const auth = { "X-Owner-Key": "owner-secret" };
      const overview = (await (await call("/owner/promo", undefined, auth)).json()) as { stats: { issued: number }; codes: unknown[] };
      assert.ok(overview.stats.issued >= 3);
      const bad = await call("/owner/promo/settings", { discountPercent: 90 }, auth);
      assert.equal(bad.status, 400);
      const dates = await call("/owner/promo/settings", { blackoutDates: [{ from: "2027-07-11", to: "2027-07-13", label: "Twelfth" }] }, auth);
      assert.equal(dates.status, 200);
      const cfgDates = (await (await call("/promo/config")).json()) as { config: { blackoutDates: unknown } };
      assert.deepEqual(cfgDates.config.blackoutDates, [{ from: "2027-07-11", to: "2027-07-13", label: "Twelfth" }]);
      await call("/owner/promo/settings", { blackoutDates: [{ from: "2026-12-14", to: "2027-01-05", label: "Christmas & New Year" }] }, auth);
      const off = await call("/owner/promo/settings", { enabled: false }, auth);
      assert.equal(off.status, 200);
      const cfg = (await (await call("/promo/config")).json()) as { config: { enabled: boolean } };
      assert.equal(cfg.config.enabled, false);
      const refused = await call("/promo/request", { email: "late@example.com" }, {}, "192.0.2.220");
      assert.equal(refused.status, 409, "switched off: no new codes");
      await call("/owner/promo/settings", { enabled: true }, auth);
      const fanCode = (routeSql.prepare("SELECT code FROM promo_codes WHERE email = 'fan@example.com'").get() as { code: string }).code;
      assert.equal((await call("/owner/promo/deactivate", { code: fanCode }, auth)).status, 200);
      assert.equal((await call("/owner/promo/deactivate", { code: fanCode }, auth)).status, 409);
      const csv = await (await call("/owner/promo/export.csv?list=codes", undefined, auth)).text();
      assert.ok(csv.startsWith("Code,Email,Status"));
      // Unsubscribed people never appear in the permission export.
      kvStore.set("marketing:index", JSON.stringify(["fan@example.com", "gone@example.com"]));
      kvStore.set("marketing:sub:gone@example.com", JSON.stringify({ email: "gone@example.com", optedInAt: T0.toISOString(), source: "paid-booking", consentVersion: "x", unsubscribedAt: T0.toISOString() }));
      const mk = await (await call("/owner/promo/export.csv?list=marketing", undefined, auth)).text();
      assert.ok(mk.includes("fan@example.com"));
      assert.ok(!mk.includes("gone@example.com"));
    });

    await check("migration not applied yet: routes answer 503 / promotion hidden, never 500", async () => {
      const empty = new DatabaseSync(":memory:");
      const bare = { ...env, DRIVER_DB: d1(empty) };
      const req = (path: string, body?: unknown) =>
        handlePromoRequest(new Request(`https://w.example${path}`, { method: body ? "POST" : "GET", body: body ? JSON.stringify(body) : undefined, headers: { "Content-Type": "application/json" } }), bare, null);
      assert.equal(((await (await req("/promo/config")).json()) as { config: { enabled: boolean } }).config.enabled, false);
      assert.equal((await req("/promo/request", { email: "x@example.com" })).status, 503);
    });
  } finally {
    globalThis.fetch = originalFetch;
    setPromoClockForTests(null);
  }

  await check("email copy: subject, business sign-off only, validity reflects settings", () => {
    const email = buildPromoCodeEmail({ code: "MATNI-AAAA-BBBB", expiresAt: days(14).toISOString(), discountRate: 0.1, minimumVehicleFareGbp: 100, validityDays: 14 });
    assert.equal(email.subject, "Your Exclusive 10% Airport Transfer Discount");
    assert.ok(email.text.includes("valid for 14 days"));
    assert.ok(email.text.startsWith("Thank you for choosing My Airport Taxi NI."));
    assert.ok(!/Colin|Brian/i.test(email.text + email.html));
  });

  console.log(`\nAll ${passed} promo-code checks passed.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
