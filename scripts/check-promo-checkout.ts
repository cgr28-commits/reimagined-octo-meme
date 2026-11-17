/**
 * Promo codes through the real quote → payment → confirmation handlers (no live writes).
 * External services (Google, OSRM, SumUp, Resend) are stubbed; D1 is real SQLite.
 * Run: npx tsx scripts/check-promo-checkout.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { SERVED_AIRPORTS } from "../shared/served-airports";
import { defaultOwnerPricingSettings } from "../shared/owner-pricing-config";
import { composeWebsiteFareBreakdown } from "../shared/website-fare-breakdown";
import { resolveExpressDropOff } from "../shared/express-drop-off";
import { quoteAirportAccessCharges } from "../shared/meet-greet";
import type { SumUpCheckoutDetails } from "../shared/sumup-checkout";
import { SALOON_VEHICLE } from "../src/lib/vehicle-selection";
import { createPaymentCheckout, isPaymentFareMismatchError, isPaymentPromoRejectedError } from "../src/lib/create-payment";
import { calculateServerQuote } from "../src/lib/quick-quote-api";
import { handleQuoteCalculateRequest } from "../workers/addresses/src/quote-handlers";
import worker from "../workers/addresses/src/index";
import { getPendingCheckout } from "../workers/addresses/src/pending-checkout-store";
import { finalizePaidCheckout } from "../workers/addresses/src/finalize-paid-checkout";
import { getPaidBookingRecord } from "../workers/addresses/src/paid-booking-store";
import { issueOrResendPromoCode, promoEmailHash, reservePromoCode, type PromoDb } from "../workers/addresses/src/promo-store";
import { createHmac } from "node:crypto";
import { DEFAULT_PROMO_SETTINGS } from "../shared/promo-code";

const home = { placeId: "test-home", address: "12 Holywood Road, Belfast BT4 1NT, UK", lat: 54.6063, lng: -5.8711 };

function d1(db: DatabaseSync): PromoDb & { batch: (s: unknown[]) => Promise<unknown[]> } {
  const make = (sql: string, values: unknown[] = []) => ({
    bind: (...v: unknown[]) => make(sql, v),
    first: async <T>() => (db.prepare(sql).get(...(values as never[])) as T) ?? null,
    all: async <T>() => ({ results: db.prepare(sql).all(...(values as never[])) as T[] }),
    run: async () => db.prepare(sql).run(...(values as never[])),
  });
  return { prepare: (sql: string) => make(sql), batch: async () => [] } as never;
}

async function main() {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  let now = Date.parse("2026-11-16T12:00:00Z");
  Date.now = () => now;
  const origin = "https://www.myairporttaxini.co.uk";
  const kvMap = new Map<string, string>();
  const kv = {
    async get(key: string, type?: string) {
      const v = kvMap.get(key);
      return v == null ? null : type === "json" ? JSON.parse(v) : v;
    },
    async put(key: string, value: string) {
      kvMap.set(key, value);
    },
    async delete(key: string) {
      kvMap.delete(key);
    },
    async list() {
      return { keys: [], list_complete: true };
    },
  } as unknown as KVNamespace;
  const sqlite = new DatabaseSync(":memory:");
  for (const f of ["0001_stage1_driver_accounts.sql", "0002_stage1_alerts_priority.sql", "0003_stage1_booking_review_items.sql", "0004_stage2_offers_jobs.sql", "0005_promo_codes.sql"]) {
    sqlite.exec(readFileSync(`workers/addresses/migrations/driver-db/${f}`, "utf8"));
  }
  const db = d1(sqlite);
  const env = {
    TRACKING_STORE: kv,
    DRIVER_DB: db,
    GOOGLE_PLACES_API_KEY: "mock-google",
    SUMUP_API_KEY: "mock-sumup",
    SUMUP_MERCHANT_CODE: "mock-merchant",
    QUOTE_RECEIPT_SECRET: "isolated-receipt-secret",
    PUBLIC_SITE_ORIGIN: origin,
    RESEND_API_KEY: "mock-email",
    BOOKING_TO_EMAIL: "owner@example.invalid",
    BOOKING_FROM_EMAIL: "bookings@example.invalid",
  };
  let distanceMetres = 160000;
  let checkouts = 0;
  let lastCheckoutAmount = 0;
  const paid = new Map<string, SumUpCheckoutDetails>();
  const emails: Array<{ to: string | string[]; subject: string; text: string }> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.pathname === "/payments") {
      return worker.fetch(new Request(request, { headers: { ...Object.fromEntries(request.headers), Origin: origin } }), env as never);
    }
    if (url.pathname === "/quote/calculate") return handleQuoteCalculateRequest(request, origin, env);
    if (url.hostname === "places.googleapis.com") {
      return Response.json({
        id: home.placeId,
        formattedAddress: home.address,
        displayName: { text: "12 Holywood Road" },
        types: ["street_address"],
        location: { latitude: home.lat, longitude: home.lng },
        addressComponents: [
          { longText: "12", types: ["street_number"] },
          { longText: "Holywood Road", types: ["route"] },
          { longText: "BT4 1NT", types: ["postal_code"] },
          { longText: "United Kingdom", shortText: "GB", types: ["country"] },
        ],
      });
    }
    if (url.pathname.includes("/route/v1/driving/")) {
      return Response.json({ code: "Ok", routes: [{ distance: distanceMetres, duration: 1800 + distanceMetres / 30 }] });
    }
    if (url.hostname === "api.sumup.com" && request.method === "POST") {
      const body = (await request.json()) as { amount: number; checkout_reference: string };
      checkouts++;
      lastCheckoutAmount = body.amount;
      const id = `isolated-${checkouts}`;
      paid.set(id, { id, checkout_reference: body.checkout_reference, status: "PAID", amount: body.amount, currency: "GBP", transactions: [{ id: `t-${id}`, transaction_code: `c-${id}`, status: "SUCCESSFUL" }] });
      return Response.json({ id, checkout_reference: body.checkout_reference, hosted_checkout_url: "https://checkout.sumup.com/x", status: "PENDING", amount: body.amount }, { status: 201 });
    }
    if (url.hostname === "api.sumup.com" && request.method === "GET") {
      const c = paid.get(url.pathname.split("/").at(-1)!);
      assert.ok(c);
      return Response.json(c);
    }
    if (url.hostname === "api.resend.com") {
      emails.push(await request.json());
      return Response.json({ id: `e-${emails.length}` });
    }
    throw new Error(`Unexpected external call ${request.method} ${url.href}`);
  }) as typeof fetch;

  const pricing = defaultOwnerPricingSettings();
  pricing.saloonFormula = { enabled: true, startingChargeGbp: 10, ratePerMileGbp: 2.5, minimumFareGbp: 30 };
  // Owner, 17 Nov 2026: the 5% return-booking discount is live again (stored owner setting 5%).
  pricing.returnDiscount = { rate: 0.05 };
  kvMap.set("owner:pricing-settings", JSON.stringify(pricing));

  const dub = SERVED_AIRPORTS.find((a) => a.code === "DUB")!;
  const bfs = SERVED_AIRPORTS.find((a) => a.code === "BFS")!;

  let dayOffset = 0;
  async function quoteFor(airport: typeof dub, returning: boolean, fixedDay?: number, sameDay?: { date: string; time: string }) {
    // A different week for every booking (same weekday both ways), so earlier test bookings
    // never block availability and both legs are priced alike.
    if (fixedDay == null) dayOffset += 7;
    const offset = fixedDay ?? dayOffset;
    const outbound = new Date(Date.UTC(2027, 0, 5 + offset)).toISOString().slice(0, 10);
    const back = new Date(Date.UTC(2027, 0, 5 + offset + 35)).toISOString().slice(0, 10);
    const journey = {
      pickupAddress: home.address,
      dropoffAddress: airport.formattedAddress,
      pickupPlaceId: home.placeId,
      dropoffPlaceId: airport.placeId,
      returnJourney: returning,
      outboundDate: sameDay?.date ?? outbound,
      outboundTime: sameDay?.time ?? "12:00",
      returnDate: back,
      returnTime: "12:00",
      passengers: 1,
      suitcases: 1,
      vehicleType: SALOON_VEHICLE,
    };
    const quote = await calculateServerQuote(journey);
    assert.ok(quote.ok, JSON.stringify(quote));
    const express = resolveExpressDropOff({ airportCode: airport.code, fromAirport: false, returnJourney: returning, selected: true, outboundSelected: true, returnSelected: true });
    const access = quoteAirportAccessCharges({ airportCode: airport.code, fromAirport: false, returnJourney: returning, expressLegs: express.legs, fees: pricing.meetGreet });
    const base = {
      journeyFareBeforeAirportAccessGbp: quote.journeyFareGbp!,
      airportFixedCostsGbp: quote.airportFixedCostsGbp,
      nightWeekendSurchargeGbp: quote.nightWeekendSurchargeGbp ?? 0,
      airportAccessChargeGbp: access.airportAccessChargeGbp,
      outboundAirportAccessChargeGbp: access.outboundAirportAccessChargeGbp,
      returnAirportAccessChargeGbp: access.returnAirportAccessChargeGbp,
      returnJourney: returning,
      preserveFixedFarePence: quote.preserveBfsMinimumPence,
    };
    return { journey, quote, base, airport };
  }

  function request(q: Awaited<ReturnType<typeof quoteFor>>, email: string, accepted: number, promoCode?: string) {
    const booking = {
      customerName: "Promo Test",
      customerEmail: email,
      mobileNumber: "07700900123",
      pickupLabel: q.journey.pickupAddress,
      dropoffLabel: q.journey.dropoffAddress,
      tripLabel: "Airport drop-off",
      tripDate: q.journey.outboundDate,
      tripTime: q.journey.outboundTime,
      returnDate: q.journey.returnDate,
      returnTime: q.journey.returnTime,
      returnJourney: q.journey.returnJourney,
      passengers: 1,
      suitcases: 1,
      vehicle: SALOON_VEHICLE,
      isAirportTrip: true,
      isFromAirport: false,
      airportCode: q.airport.code,
      flightNumber: "BA1234",
      returnFlightNumber: "BA1234",
      termsAcceptedAt: new Date().toISOString(),
      estimatedPrice: `£${accepted}`,
    };
    return createPaymentCheckout({
      paymentMethod: "FULL_ONLINE",
      booking,
      pickupPlaceId: q.journey.pickupPlaceId,
      dropoffPlaceId: q.journey.dropoffPlaceId,
      quoteReceipt: q.quote.quoteReceipt,
      amount: q.quote.amount,
      acceptedFinalAmountGbp: accepted,
      journeyFareGbp: q.quote.journeyFareGbp,
      airportFixedCostsGbp: q.quote.airportFixedCostsGbp,
      description: "Promo isolated test",
      redirectUrl: `${origin}/booking-confirmed/`,
      ...(promoCode ? { promoCode } : {}),
    });
  }

  async function issue(email: string): Promise<string> {
    const r = await issueOrResendPromoCode(db, { email, emailHash: await promoEmailHash(email), settings: DEFAULT_PROMO_SETTINGS, now: new Date(now), source: "test", marketingOptIn: false });
    assert.ok("code" in r);
    return r.code;
  }

  let passed = 0;
  const check = async (name: string, fn: () => Promise<void>) => {
    await fn();
    passed++;
    console.log(`✓ ${name}`);
  };

  try {
    await check("return quotes get the 5% return-booking discount again", async () => {
      const one = await quoteFor(dub, false, 0);
      const ret = await quoteFor(dub, true, 0);
      assert.equal(ret.quote.journeyFareGbp, Math.round(one.quote.journeyFareGbp! * 2 * 0.95 * 100) / 100, "5% off the combined journey fare");
    });

    await check("one-way with a valid code: server charges exactly the discounted total and holds the code", async () => {
      const q = await quoteFor(dub, false);
      const code = await issue("promo.one@example.com");
      const expected = composeWebsiteFareBreakdown({ ...q.base, promoCode: { code, discountRate: 0.1, minimumVehicleFareGbp: 100 } });
      assert.equal(expected.promoCodeStatus, "applied");
      const plain = composeWebsiteFareBreakdown(q.base);
      assert.ok(expected.finalAmountPayableGbp < plain.finalAmountPayableGbp);

      // Tampering: claim the code but agree the full price → refused, no payment page.
      const before = checkouts;
      await assert.rejects(request(q, "promo.one@example.com", plain.finalAmountPayableGbp, code), (e) => isPaymentFareMismatchError(e));
      // Claiming the discount without the code → refused.
      await assert.rejects(request(q, "promo.one@example.com", expected.finalAmountPayableGbp), (e) => isPaymentFareMismatchError(e));
      assert.equal(checkouts, before);

      const result = await request(q, "promo.one@example.com", expected.finalAmountPayableGbp, code);
      assert.ok(result.checkoutId);
      assert.equal(lastCheckoutAmount, expected.finalAmountPayableGbp);
      const pending = await getPendingCheckout(kv, result.checkoutId!);
      assert.equal(pending?.booking.promoCode, code);
      assert.equal(pending?.booking.promoCodeSavingGbp, expected.promoCodeSavingGbp);
      const row = sqlite.prepare("SELECT status, reserved_key FROM promo_codes WHERE code = ?").get(code) as { status: string; reserved_key: string };
      assert.equal(row.status, "reserved");
      assert.equal(row.reserved_key, result.checkoutId);

      // Paid: confirmation records the use; the email shows the saving; the code is spent.
      const emailStart = emails.length;
      const done = await finalizePaidCheckout({ env, checkoutId: result.checkoutId!, booking: pending!.booking, logPaidBookingCalendar: async () => ({ logged: true, events: 0, eventIds: [] }) });
      assert.equal(done.ok, true, JSON.stringify(done));
      const used = sqlite.prepare("SELECT status, booking_reference, discount_pence FROM promo_codes WHERE code = ?").get(code) as { status: string; booking_reference: string; discount_pence: number };
      assert.equal(used.status, "redeemed");
      assert.equal(used.discount_pence, Math.round(expected.promoCodeSavingGbp * 100));
      const record = await getPaidBookingRecord(kv, done.paymentReference);
      assert.equal(record?.promoCode, code);
      const customer = emails.slice(emailStart).find((e) => String(e.to).includes("promo.one@example.com"));
      assert.ok(customer?.text.includes(`10% promo code (${code})`), "confirmation shows the promotional saving");

      // Same code again → refused before any payment page.
      const again = checkouts;
      await assert.rejects(request(q, "promo.one@example.com", expected.finalAmountPayableGbp, code), (e) => isPaymentPromoRejectedError(e) && e.promoReason === "redeemed");
      assert.equal(checkouts, again);
    });

    await check("return booking: combined outward + return vehicle fare discounted; airport charges not", async () => {
      now += 60_000;
      const q = await quoteFor(dub, true);
      const code = await issue("promo.return@example.com");
      const expected = composeWebsiteFareBreakdown({ ...q.base, promoCode: { code, discountRate: 0.1, minimumVehicleFareGbp: 100 } });
      const plain = composeWebsiteFareBreakdown(q.base);
      // No stacking: the 10% code replaces the 5% return discount (it saves more), assessed on the
      // combined fare without the 5%.
      assert.equal(expected.promoCodeStatus, "applied");
      assert.equal(expected.returnJourneySavingGbp, 0, "the 5% is not added on top of the code");
      const undiscounted = Math.round((q.quote.journeyFareGbp! + plain.returnJourneySavingGbp) * 100) / 100;
      assert.ok(plain.returnJourneySavingGbp > 0);
      assert.equal(expected.promoEligibleVehicleFareGbp, undiscounted);
      assert.ok(expected.finalAmountPayableGbp < plain.finalAmountPayableGbp, "the code is the better price here");
      assert.ok(Math.abs(expected.finalAmountPayableGbp - (plain.finalAmountPayableGbp + plain.returnJourneySavingGbp - undiscounted * 0.1)) <= 1);
      // Tampering: claiming both discounts is refused.
      const before = checkouts;
      await assert.rejects(request(q, "promo.return@example.com", Math.round((expected.finalAmountPayableGbp - plain.returnJourneySavingGbp) * 100) / 100, code), (e) => isPaymentFareMismatchError(e));
      assert.equal(checkouts, before);
      const result = await request(q, "promo.return@example.com", expected.finalAmountPayableGbp, code);
      assert.equal(lastCheckoutAmount, expected.finalAmountPayableGbp);
      assert.ok(result.checkoutId);
    });

    await check("short-notice request (owner approval / card hold): discounted amount held, code held until decided", async () => {
      now += 60_000;
      const q = await quoteFor(dub, false, undefined, { date: "2026-11-16", time: "20:00" });
      const code = await issue("short.notice@example.com");
      const expected = composeWebsiteFareBreakdown({ ...q.base, promoCode: { code, discountRate: 0.1, minimumVehicleFareGbp: 100 } });
      const before = checkouts;
      const result = await request(q, "short.notice@example.com", expected.finalAmountPayableGbp, code);
      assert.equal(result.shortNotice, true, JSON.stringify(result));
      assert.equal(checkouts, before, "no payment taken before the owner decides");
      assert.equal(result.amount, expected.finalAmountPayableGbp, "request amount is the discounted total");
      const row = sqlite.prepare("SELECT status, reserved_key, reserved_until FROM promo_codes WHERE code = ?").get(code) as { status: string; reserved_key: string; reserved_until: string };
      assert.equal(row.status, "reserved");
      assert.equal(row.reserved_key, `sn:${result.reference}`);
      assert.ok(Date.parse(row.reserved_until) > now + 86_400_000 - 1, "held at least until after pickup");
    });

    await check("failed card payment (SumUp) releases the code for another try", async () => {
      now += 60_000;
      const q = await quoteFor(dub, false);
      const code = await issue("declined@example.com");
      const expected = composeWebsiteFareBreakdown({ ...q.base, promoCode: { code, discountRate: 0.1, minimumVehicleFareGbp: 100 } });
      const result = await request(q, "declined@example.com", expected.finalAmountPayableGbp, code);
      paid.set(result.checkoutId!, { ...paid.get(result.checkoutId!)!, status: "FAILED", transactions: [] });
      const res = await worker.fetch(new Request(`https://w.example/payments/webhook?checkout_id=${result.checkoutId}`, { method: "POST" }), env as never);
      assert.equal(res.status, 200);
      const row = sqlite.prepare("SELECT status, reserved_key FROM promo_codes WHERE code = ?").get(code) as { status: string; reserved_key: string | null };
      assert.deepEqual({ ...row }, { status: "active", reserved_key: null }, "failed payment never consumes the code");
    });

    await check("Stripe payment page expired / async payment failed releases the code", async () => {
      const code = await issue("stripe.expired@example.com");
      const hash = await promoEmailHash("stripe.expired@example.com");
      assert.ok(await reservePromoCode(db, { code, emailHash: hash, key: "cs_test_promo_1", until: new Date(now + 86_400_000), now: new Date(now) }));
      const secret = "whsec_test";
      const payload = JSON.stringify({ id: "evt_1", type: "checkout.session.expired", livemode: false, data: { object: { object: "checkout.session", id: "cs_test_promo_1" } } });
      const t = Math.floor(now / 1000);
      const sig = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
      const stripeEnv = { ...env, STRIPE_WEBHOOK_SECRET: secret };
      const res = await worker.fetch(
        new Request("https://w.example/payments/stripe-webhook", { method: "POST", body: payload, headers: { "Stripe-Signature": `t=${t},v1=${sig}` } }),
        stripeEnv as never,
      );
      assert.equal(res.status, 200);
      const row = sqlite.prepare("SELECT status FROM promo_codes WHERE code = ?").get(code) as { status: string };
      assert.equal(row.status, "active");
    });

    await check("excluded dates (14 Dec – 5 Jan): refused for either leg, fine outside them", async () => {
      now += 60_000;
      const code = await issue("christmas@example.com");
      const q = await quoteFor(dub, false, undefined, { date: "2026-12-20", time: "12:00" });
      const expected = composeWebsiteFareBreakdown({ ...q.base, promoCode: { code, discountRate: 0.1, minimumVehicleFareGbp: 100 } });
      const before = checkouts;
      await assert.rejects(
        request(q, "christmas@example.com", expected.finalAmountPayableGbp, code),
        (e) => isPaymentPromoRejectedError(e) && e.promoReason === "blackout_date" && /20 Dec 2026/.test(e.message),
      );
      // Return leg on 2 Jan with an outward date before Christmas.
      const r = await quoteFor(dub, true, undefined, { date: "2026-12-10", time: "12:00" });
      r.journey.returnDate = "2027-01-02";
      const r2 = { ...r, quote: (await calculateServerQuote(r.journey)) as typeof r.quote };
      const exp2 = composeWebsiteFareBreakdown({ ...r.base, journeyFareBeforeAirportAccessGbp: r2.quote.journeyFareGbp!, nightWeekendSurchargeGbp: r2.quote.nightWeekendSurchargeGbp ?? 0, promoCode: { code, discountRate: 0.1, minimumVehicleFareGbp: 100 } });
      await assert.rejects(
        request(r2, "christmas@example.com", exp2.finalAmountPayableGbp, code),
        (e) => isPaymentPromoRejectedError(e) && e.promoReason === "blackout_date",
      );
      assert.equal(checkouts, before, "no payment page opened");
      // 6 January is fine.
      const ok = await quoteFor(dub, false, undefined, { date: "2027-01-06", time: "12:00" });
      const exp3 = composeWebsiteFareBreakdown({ ...ok.base, promoCode: { code, discountRate: 0.1, minimumVehicleFareGbp: 100 } });
      const res = await request(ok, "christmas@example.com", exp3.finalAmountPayableGbp, code);
      assert.ok(res.checkoutId);
    });

    await check("email mismatch: someone else's code is refused", async () => {
      now += 60_000;
      const q = await quoteFor(dub, false);
      const code = await issue("owner.of.code@example.com");
      const expected = composeWebsiteFareBreakdown({ ...q.base, promoCode: { code, discountRate: 0.1, minimumVehicleFareGbp: 100 } });
      await assert.rejects(request(q, "friend@example.com", expected.finalAmountPayableGbp, code), (e) => isPaymentPromoRejectedError(e) && e.promoReason === "email_mismatch");
    });

    await check("below the £100 minimum vehicle fare: refused with the minimum explained", async () => {
      now += 60_000;
      distanceMetres = 12000;
      const q = await quoteFor(bfs, false);
      const plain = composeWebsiteFareBreakdown(q.base);
      assert.ok(q.quote.journeyFareGbp! < 100, `short journey fare ${q.quote.journeyFareGbp}`);
      const code = await issue("short.trip@example.com");
      await assert.rejects(
        request(q, "short.trip@example.com", plain.finalAmountPayableGbp, code),
        (e) => isPaymentPromoRejectedError(e) && e.promoReason === "minimum_fare" && /£100 or more/.test(e.message),
      );
      // Without the code the same booking goes through at the normal price.
      const ok = await request(q, "short.trip@example.com", plain.finalAmountPayableGbp);
      assert.ok(ok.checkoutId);
      distanceMetres = 160000;
    });

    await check("expired and malformed codes are refused", async () => {
      now += 60_000;
      const q = await quoteFor(dub, false);
      const code = await issue("late@example.com");
      now += 31 * 86_400_000;
      const expected = composeWebsiteFareBreakdown({ ...q.base, promoCode: { code, discountRate: 0.1, minimumVehicleFareGbp: 100 } });
      // Date.now drives the payment handler; the store uses new Date() → patch Date too.
      const RealDate = Date;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).Date = class extends RealDate {
        constructor(...args: ConstructorParameters<typeof RealDate>) {
          super(...((args.length ? args : [now]) as [number]));
        }
        static now() {
          return now;
        }
      };
      try {
        const q2 = await quoteFor(dub, false);
        const e2 = composeWebsiteFareBreakdown({ ...q2.base, promoCode: { code, discountRate: 0.1, minimumVehicleFareGbp: 100 } });
        await assert.rejects(request(q2, "late@example.com", e2.finalAmountPayableGbp, code), (e) => isPaymentPromoRejectedError(e) && e.promoReason === "expired");
      } finally {
        (globalThis as { Date: DateConstructor }).Date = RealDate;
      }
      void expected;
      await assert.rejects(request(q, "late@example.com", 100, "SAVE10NOW"), (e) => isPaymentPromoRejectedError(e) && e.promoReason === "not_found");
    });
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
  }
  console.log(`\nAll ${passed} promo checkout checks passed.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
