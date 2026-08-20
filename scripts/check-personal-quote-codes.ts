/**
 * Offline checks for Personal Quote Codes (individually agreed fares).
 * Run: npx tsx scripts/check-personal-quote-codes.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  buildPersonalQuoteCustomerUrl,
  buildPersonalQuoteReservation,
  buildPersonalQuoteWhatsAppMessage,
  computeLinkedPersonalQuoteFares,
  describePersonalQuotePayment,
  evaluatePersonalQuote,
  generatePersonalQuoteCode,
  generatePersonalQuoteCustomerToken,
  isPersonallyDiscountedPersonalQuote,
  isPersonalQuoteReservationActive,
  isValidPersonalQuotePassengerCount,
  normalizePersonalQuoteCode,
  normalizePersonalQuoteCustomerToken,
  personalQuoteCustomerError,
  personalQuoteTokenCustomerError,
  personalQuoteTokenKey,
  resolvePersonalQuoteCheckoutAmount,
  resolvePersonalQuotePricing,
  toPersonalQuotePublicSummary,
  PERSONAL_QUOTE_PASSENGER_LIMIT_ERROR,
  PERSONAL_QUOTE_RESERVATION_TTL_SECONDS,
  type PersonalQuoteRecord,
} from "../shared/personal-quote";
import {
  RETURN_JOURNEY_DISCOUNT_RATE,
  formatReturnJourneyDiscountPercent,
  getWebsiteReturnJourneyFare,
} from "../shared/return-journey-discount";
import returnDiscountRates from "../shared/return-journey-discount-rate.json";
import { getReturnJourneyFare } from "../src/lib/point-to-point-premium";
import { PRICING_CONFIG } from "../src/lib/pricing-config";
import { calculateWebsiteOneWayFare } from "../src/lib/website-fare";
import { calculatePointToPointQuote, calculateQuote } from "../src/lib/quote";
import { emptySelectedPlace } from "../src/lib/selected-place";

const root = path.resolve(import.meta.dirname, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function check(label: string, fn: () => void) {
  try {
    fn();
    console.log(`OK  ${label}`);
  } catch (error) {
    console.error(`FAIL  ${label}`);
    throw error;
  }
}

function sampleQuote(overrides: Partial<PersonalQuoteRecord> = {}): PersonalQuoteRecord {
  return {
    code: "MQ-7K4P9X",
    customerName: "Existing minibus customer",
    agreedAmount: 75,
    standardWebsiteAmount: 100,
    singleUse: true,
    active: true,
    createdAt: "2026-08-01T12:00:00.000Z",
    expiresOn: "2026-08-31",
    ...overrides,
  };
}

check("1. Normal booking without quote uses website fare path (create-payment still sends amount)", () => {
  const createPay = read("src/lib/create-payment.ts");
  assert.match(createPay, /amount: request\.amount/);
  assert.match(createPay, /personalQuoteCode/);
  // Without personalQuoteCode the Worker uses client amount as website fare (existing behaviour).
  const payment = read("workers/addresses/src/index.ts");
  assert.match(payment, /let amount = Number\(body\.amount\)/);
});

check("2. Valid £75 quote evaluates redeemable and returns authorised amount", () => {
  const result = evaluatePersonalQuote(sampleQuote(), new Date("2026-08-18T12:00:00Z"));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.record.agreedAmount, 75);
  }
});

check("3–5. Invalid / expired / inactive quotes are rejected", () => {
  assert.equal(evaluatePersonalQuote(null).ok, false);
  assert.equal(
    evaluatePersonalQuote(sampleQuote({ expiresOn: "2026-08-01" }), new Date("2026-08-18T12:00:00Z"))
      .ok,
    false,
  );
  assert.equal(evaluatePersonalQuote(sampleQuote({ active: false })).ok, false);
  const expired = evaluatePersonalQuote(
    sampleQuote({ expiresOn: "2026-08-01" }),
    new Date("2026-08-18T12:00:00Z"),
  );
  assert.equal(expired.ok, false);
  if (!expired.ok) {
    assert.equal(expired.error, "expired");
  }
});

check("6. Already-used single-use quote is rejected", () => {
  const used = evaluatePersonalQuote(
    sampleQuote({ usedAt: "2026-08-10T10:00:00.000Z" }),
    new Date("2026-08-18T12:00:00Z"),
  );
  assert.equal(used.ok, false);
  if (!used.ok) assert.equal(used.error, "already_used");
});

check("7. Payment handler ignores client amount when personalQuoteCode is present", () => {
  const payment = read("workers/addresses/src/index.ts");
  assert.match(payment, /resolvePersonalQuoteForPayment/);
  assert.match(payment, /Personal quote: authorised amount from KV only/);
  assert.match(payment, /amount = resolved\.amount/);
});

check("8. Quote code persists in booking draft; amount re-validated on restore", () => {
  const draft = read("src/lib/booking-draft-storage.ts");
  assert.match(draft, /personalQuoteCode\?:/);
  const card = read("src/components/QuoteCard.tsx");
  assert.match(card, /Re-validate from server/);
  assert.match(card, /validatePersonalQuoteCode/);
});

check("9. SumUp create uses server amount; UI shows personal quoted fare", () => {
  const payment = read("workers/addresses/src/index.ts");
  assert.match(payment, /createSumUpHostedCheckout/);
  assert.match(payment, /personalQuoteCode/);
  const card = read("src/components/QuoteCard.tsx");
  assert.match(card, /Personal quoted fare/);
  assert.match(card, /Pay \$\{formatQuote\(appliedPersonalQuote\?\.agreedAmount/);
});

check("10. Failed/abandoned payment does not mark quote used on Pay click", () => {
  const paymentHandler = read("workers/addresses/src/index.ts");
  // handlePaymentRequest must not call markPersonalQuoteUsed — only finalize does.
  const paymentFn = paymentHandler.slice(
    paymentHandler.indexOf("async function handlePaymentRequest"),
    paymentHandler.indexOf("async function parseWebhookPayload"),
  );
  assert.doesNotMatch(paymentFn, /markPersonalQuoteUsed/);
  const finalize = read("workers/addresses/src/finalize-paid-checkout.ts");
  assert.match(finalize, /markPersonalQuoteUsed/);
  assert.match(finalize, /only after SumUp PAID finalize/);
});

check("11. Successful finalize consumes single-use quotes", () => {
  const store = read("workers/addresses/src/personal-quote-store.ts");
  assert.match(store, /markPersonalQuoteUsed/);
  assert.match(store, /usedAt: new Date\(\)\.toISOString\(\)/);
  assert.match(store, /if \(!record\.singleUse\)/);
});

check("12. Customer-facing errors hide technical details; codes are strong MQ- format", () => {
  assert.match(personalQuoteCustomerError("not_found"), /couldn’t apply that quote code/i);
  assert.doesNotMatch(personalQuoteCustomerError("not_found"), /KV|database|stack/i);
  const code = generatePersonalQuoteCode();
  assert.match(code, /^MQ-[A-Z2-9]{6}$/);
  assert.equal(normalizePersonalQuoteCode(" mq-7k4p9x "), "MQ-7K4P9X");
});

check("Owner panel + Worker routes exist and require owner auth", () => {
  const handlers = read("workers/addresses/src/personal-quote-handlers.ts");
  assert.match(handlers, /ownerAuthorized/);
  assert.match(handlers, /handleOwnerCreatePersonalQuote/);
  assert.match(handlers, /handlePublicValidatePersonalQuote/);
  assert.match(handlers, /handlePublicPersonalQuoteByToken/);
  const panel = read("src/components/OwnerPersonalQuotesPanel.tsx");
  assert.match(panel, /Create personal quote & link/);
  assert.match(panel, /Copy customer link/);
  assert.match(panel, /Copy WhatsApp message/);
  assert.doesNotMatch(panel, /voucher|coupon|discount code/i);
  const card = read("src/components/QuoteCard.tsx");
  assert.doesNotMatch(card, /voucher|coupon|promo code/i);
  assert.match(card, /Have a personal quote\?/);
  assert.match(card, /Apply Quote/);
});

check("Pending checkout stores quote audit fields", () => {
  const pending = read("workers/addresses/src/pending-checkout-store.ts");
  assert.match(pending, /personalQuoteCode\?:/);
  assert.match(pending, /standardWebsiteAmount\?:/);
  assert.match(pending, /personalQuotedAmount\?:/);
});

check("R1. Single-use quote with no reservation → checkout acquire path exists", () => {
  const store = read("workers/addresses/src/personal-quote-store.ts");
  assert.match(store, /tryAcquirePersonalQuoteReservation/);
  const payment = read("workers/addresses/src/index.ts");
  assert.match(payment, /tryAcquirePersonalQuoteReservation/);
  assert.match(payment, /quoteRecord\?\.singleUse/);
  const reservation = buildPersonalQuoteReservation({
    code: "MQ-7K4P9X",
    attemptId: "abc",
    now: new Date("2026-08-18T12:00:00Z"),
  });
  assert.equal(isPersonalQuoteReservationActive(reservation, new Date("2026-08-18T12:00:00Z")), true);
});

check("R2. Active reservation blocks second checkout (customer-friendly message)", () => {
  const now = new Date("2026-08-18T12:00:00Z");
  const active = buildPersonalQuoteReservation({
    code: "MQ-7K4P9X",
    attemptId: "attempt-a",
    checkoutId: "chk_1",
    paymentUrl: "https://pay.example/1",
    now,
  });
  assert.equal(isPersonalQuoteReservationActive(active, now), true);
  assert.match(
    personalQuoteCustomerError("reserved"),
    /currently being used for another payment attempt/i,
  );
  const payment = read("workers/addresses/src/index.ts");
  assert.match(payment, /personalQuoteCustomerError\("reserved"\)/);
});

check("R3. Same unpaid checkout/payment attempt can be reused", () => {
  const payment = read("workers/addresses/src/index.ts");
  assert.match(payment, /personalQuoteReuse: true/);
  assert.match(payment, /existingReservation\.paymentUrl/);
  assert.match(payment, /bindPersonalQuoteReservationCheckout/);
});

check("R4. Expired reservation → quote available again", () => {
  const created = new Date("2026-08-18T12:00:00Z");
  const reservation = buildPersonalQuoteReservation({
    code: "MQ-7K4P9X",
    attemptId: "old",
    now: created,
    ttlSeconds: 60,
  });
  assert.equal(
    isPersonalQuoteReservationActive(reservation, new Date("2026-08-18T12:00:30Z")),
    true,
  );
  assert.equal(
    isPersonalQuoteReservationActive(reservation, new Date("2026-08-18T12:02:00Z")),
    false,
  );
  assert.ok(PERSONAL_QUOTE_RESERVATION_TTL_SECONDS >= 15 * 60);
  assert.ok(PERSONAL_QUOTE_RESERVATION_TTL_SECONDS <= 30 * 60);
});

check("R5. Successful payment → quote used and reservation cleared", () => {
  const store = read("workers/addresses/src/personal-quote-store.ts");
  assert.match(store, /clearPersonalQuoteReservation/);
  // markPersonalQuoteUsed clears reservation after setting usedAt
  const markFn = store.slice(store.indexOf("export async function markPersonalQuoteUsed"));
  assert.match(markFn, /clearPersonalQuoteReservation/);
  assert.match(markFn, /usedAt: new Date\(\)\.toISOString\(\)/);
});

check("R6. Abandoned checkout → reservation expires without consuming quote", () => {
  const shared = read("shared/personal-quote.ts");
  assert.match(shared, /PERSONAL_QUOTE_RESERVATION_TTL_SECONDS/);
  // evaluatePersonalQuote does not treat reservation as used
  assert.equal(evaluatePersonalQuote(sampleQuote()).ok, true);
  const paymentFn = read("workers/addresses/src/index.ts").slice(
    read("workers/addresses/src/index.ts").indexOf("async function handlePaymentRequest"),
    read("workers/addresses/src/index.ts").indexOf("async function parseWebhookPayload"),
  );
  assert.doesNotMatch(paymentFn, /markPersonalQuoteUsed/);
});

check("R7. Multi-use quotes are not locked by reservation path", () => {
  const payment = read("workers/addresses/src/index.ts");
  // Reservation acquire is nested under singleUse — multi-use skips it.
  assert.match(
    payment,
    /if \(quoteRecord\?\.singleUse\)[\s\S]{0,4000}?tryAcquirePersonalQuoteReservation/,
  );
});

check("R8. Normal bookings without personal quotes skip reservation", () => {
  const payment = read("workers/addresses/src/index.ts");
  assert.match(
    payment,
    /if \(personalQuoteCode\) \{\s*const quoteRecord = await getPersonalQuoteByCode/,
  );
});

check("R9. Terminal SumUp failure clears reservation where practical", () => {
  const payment = read("workers/addresses/src/index.ts");
  assert.match(payment, /failedStatuses/);
  assert.match(payment, /clearPersonalQuoteReservation/);
  assert.match(payment, /FAILED/);
  assert.match(payment, /EXPIRED/);
});

check("L1. Personal quote without discount — agreed only", () => {
  const pricing = resolvePersonalQuotePricing({ agreedAmount: 65 });
  assert.equal(pricing.ok, true);
  if (pricing.ok) {
    assert.equal(pricing.agreedAmount, 65);
    assert.equal(pricing.standardWebsiteAmount, undefined);
    assert.equal(pricing.discountAmount, undefined);
  }
  const summary = toPersonalQuotePublicSummary(
    sampleQuote({
      agreedAmount: 65,
      standardWebsiteAmount: undefined,
      discountAmount: undefined,
    }),
  );
  assert.equal(summary.amountLabel, "£65.00");
  assert.equal(summary.discountAmount, undefined);
  assert.equal(summary.standardWebsiteAmount, undefined);
});

check("L2. £10 discount from £75 → £65", () => {
  const pricing = resolvePersonalQuotePricing({
    standardWebsiteAmount: 75,
    discountAmount: 10,
  });
  assert.equal(pricing.ok, true);
  if (pricing.ok) {
    assert.equal(pricing.agreedAmount, 65);
    assert.equal(pricing.discountAmount, 10);
    assert.equal(pricing.standardWebsiteAmount, 75);
  }
  const linked = computeLinkedPersonalQuoteFares({
    standardWebsiteAmount: 75,
    discountAmount: 10,
    agreedAmount: null,
    edited: "discount",
  });
  assert.deepEqual(linked, { discountAmount: 10, agreedAmount: 65 });
  const fromAgreed = computeLinkedPersonalQuoteFares({
    standardWebsiteAmount: 75,
    discountAmount: null,
    agreedAmount: 65,
    edited: "agreed",
  });
  assert.deepEqual(fromAgreed, { agreedAmount: 65, discountAmount: 10 });
});

check("L3. Invalid negative discount / discount > standard / agreed under £1", () => {
  assert.equal(resolvePersonalQuotePricing({ standardWebsiteAmount: 75, discountAmount: -5 }).ok, false);
  assert.equal(resolvePersonalQuotePricing({ standardWebsiteAmount: 75, discountAmount: 80 }).ok, false);
  assert.equal(resolvePersonalQuotePricing({ agreedAmount: 0.5 }).ok, false);
  assert.equal(resolvePersonalQuotePricing({ agreedAmount: "NaN" }).ok, false);
  assert.equal(resolvePersonalQuotePricing({ agreedAmount: -10 }).ok, false);
  assert.equal(
    resolvePersonalQuotePricing({
      standardWebsiteAmount: 75,
      discountAmount: 10,
      agreedAmount: 50,
    }).ok,
    false,
  );
});

check("L4. Secure token generation + URL never contains fare", () => {
  const token = generatePersonalQuoteCustomerToken();
  assert.match(token, /^[a-f0-9]{48}$/);
  assert.equal(normalizePersonalQuoteCustomerToken(` ${token.toUpperCase()} `), token);
  const url = buildPersonalQuoteCustomerUrl(token, "https://www.myairporttaxini.co.uk");
  assert.match(url, /\/personal-quote\/\?t=/);
  const parsed = new URL(url);
  assert.equal([...parsed.searchParams.keys()].join(","), "t");
  assert.equal(parsed.searchParams.get("t"), token);
  assert.equal(parsed.searchParams.has("amount"), false);
  assert.equal(parsed.searchParams.has("fare"), false);
  assert.equal(parsed.searchParams.has("discount"), false);
  assert.equal(parsed.searchParams.has("agreedAmount"), false);
  assert.doesNotMatch(url, /agreedAmount|discountAmount|customerEmail/);
  assert.equal(personalQuoteTokenKey(token), `personal-quote:token:${token}`);
});

check("L4b. WhatsApp message says personal quote (not private quote)", () => {
  const message = buildPersonalQuoteWhatsAppMessage({
    customerName: "Justine Smith",
    agreedAmount: 50,
    pickupLabel: "Belfast City Hall",
    dropoffLabel: "Belfast International Airport",
    customerUrl: "https://www.myairporttaxini.co.uk/personal-quote/?t=abc",
  });
  assert.match(message, /personal quote/i);
  assert.doesNotMatch(message, /private quote/i);
  assert.match(
    message,
    /^Hi Justine, here is your personal quote from My Airport Taxi NI for your airport transfer\. Your agreed fixed price is £50\.00\. You can review the journey and pay securely here: https:\/\/www\.myairporttaxini\.co\.uk\/personal-quote\/\?t=abc$/,
  );
  // Customer-facing UI / page title must also use personal quote wording.
  assert.match(read("src/app/personal-quote/page.tsx"), /Your personal quote/);
  assert.doesNotMatch(read("src/app/personal-quote/page.tsx"), /private quote/i);
  const customerPage = read("src/app/personal-quote/PersonalQuoteCustomerClient.tsx");
  assert.match(customerPage, /Loading your personal quote/);
  assert.match(customerPage, />Personal quote</);
  assert.doesNotMatch(customerPage, /private quote/i);
  assert.doesNotMatch(read("shared/personal-quote.ts"), /private quote/i);
});

check("L5. Token / expired / inactive / used customer messages", () => {
  assert.match(personalQuoteTokenCustomerError("not_found"), /invalid or no longer available/i);
  assert.match(personalQuoteCustomerError("expired"), /has expired/i);
  assert.match(personalQuoteCustomerError("inactive"), /no longer active/i);
  assert.match(personalQuoteCustomerError("already_used"), /already been used/i);
  assert.doesNotMatch(personalQuoteTokenCustomerError("not_found"), /KV|database|stack/i);
});

check("L6. Standard fare absent — no fabricated saving", () => {
  const summary = toPersonalQuotePublicSummary(
    sampleQuote({ agreedAmount: 65, standardWebsiteAmount: undefined }),
  );
  assert.equal(summary.discountAmount, undefined);
  assert.equal(summary.amountLabel, "£65.00");
});

check("L7. Customer page + token API; payment still server-authorised; MQ path intact", () => {
  const page = read("src/app/personal-quote/PersonalQuoteCustomerClient.tsx");
  assert.match(page, /fetchPersonalQuoteByToken/);
  assert.match(page, /personalQuoteCode: quote\.code/);
  assert.match(page, /Your private airport transfer quote/);
  assert.match(page, /You save/);
  assert.doesNotMatch(page, /coupon|promo code/i);
  // Fare must not be read from URL query params for payment.
  assert.doesNotMatch(page, /searchParams\.get\(["']amount/);
  assert.doesNotMatch(page, /searchParams\.get\(["']fare/);
  const api = read("src/lib/personal-quote-api.ts");
  assert.match(api, /personal-quotes\/by-token/);
  assert.match(api, /validatePersonalQuoteCode/);
  const index = read("workers/addresses/src/index.ts");
  assert.match(index, /isPublicPersonalQuoteTokenPath/);
  assert.match(index, /handlePublicPersonalQuoteByToken/);
  assert.match(index, /resolvePersonalQuoteForPayment/);
  assert.match(index, /amount = resolved\.amount/);
  const store = read("workers/addresses/src/personal-quote-store.ts");
  assert.match(store, /customerToken/);
  assert.match(store, /discountAmount/);
  assert.match(store, /getPersonalQuoteByCustomerToken/);
  assert.match(store, /ensurePersonalQuoteCustomerToken/);
  // Legacy MQ validate path still present.
  assert.match(read("workers/addresses/src/personal-quote-handlers.ts"), /handlePublicValidatePersonalQuote/);
  assert.match(read("src/components/QuoteCard.tsx"), /validatePersonalQuoteCode/);
});

check("L8. Backwards-compatible record shape (optional new fields)", () => {
  const legacy = sampleQuote();
  assert.equal(legacy.customerToken, undefined);
  assert.equal(legacy.discountAmount, undefined);
  assert.equal(legacy.customerMobile, undefined);
  const evaluated = evaluatePersonalQuote(legacy, new Date("2026-08-18T12:00:00Z"));
  assert.equal(evaluated.ok, true);
  const withDiscount = sampleQuote({
    agreedAmount: 65,
    standardWebsiteAmount: 75,
    discountAmount: 10,
    customerToken: generatePersonalQuoteCustomerToken(),
    customerMobile: "07700900123",
    customerEmail: "john@example.com",
  });
  const summary = toPersonalQuotePublicSummary(withDiscount);
  assert.equal(summary.discountAmount, 10);
  assert.equal(summary.amountLabel, "£65.00");
});

check("L9. Public summary / token path must not expose customer email or mobile", () => {
  const record = sampleQuote({
    customerEmail: "private@example.com",
    customerMobile: "07700900999",
  });
  const summary = toPersonalQuotePublicSummary(record);
  assert.equal(
    Object.prototype.hasOwnProperty.call(summary, "customerEmail"),
    false,
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(summary, "customerMobile"),
    false,
  );
  assert.equal((summary as { customerEmail?: string }).customerEmail, undefined);
  assert.equal((summary as { customerMobile?: string }).customerMobile, undefined);
  const shared = read("shared/personal-quote.ts");
  const summaryFn = shared.slice(shared.indexOf("export function toPersonalQuotePublicSummary"));
  assert.doesNotMatch(summaryFn, /customerEmail/);
  assert.doesNotMatch(summaryFn, /customerMobile/);
  // Owner create/list still accept and return email/mobile on the full record.
  const store = read("workers/addresses/src/personal-quote-store.ts");
  assert.match(store, /customerEmail/);
  assert.match(store, /customerMobile/);
  const handlers = read("workers/addresses/src/personal-quote-handlers.ts");
  assert.match(handlers, /customerEmail/);
  assert.match(handlers, /customerMobile/);
  const panel = read("src/components/OwnerPersonalQuotesPanel.tsx");
  assert.match(panel, /customerEmail/);
  assert.match(panel, /customerMobile/);
  // Customer page collects email/mobile itself — does not prefill from token payload.
  const page = read("src/app/personal-quote/PersonalQuoteCustomerClient.tsx");
  assert.doesNotMatch(page, /loaded\.customerEmail/);
  assert.doesNotMatch(page, /loaded\.customerMobile/);
  assert.match(page, /Email/);
  assert.match(page, /Mobile/);
});

check("L10. Personal-quote bookings capped at 4 passengers (UI + client + Worker)", () => {
  assert.equal(isValidPersonalQuotePassengerCount(1), true);
  assert.equal(isValidPersonalQuotePassengerCount(4), true);
  assert.equal(isValidPersonalQuotePassengerCount(5), false);
  assert.equal(isValidPersonalQuotePassengerCount(7), false);
  assert.equal(isValidPersonalQuotePassengerCount(0), false);
  assert.match(PERSONAL_QUOTE_PASSENGER_LIMIT_ERROR, /up to 4 passengers/i);
  const page = read("src/app/personal-quote/PersonalQuoteCustomerClient.tsx");
  assert.match(page, /PERSONAL_QUOTE_MAX_PASSENGERS/);
  assert.match(page, /PERSONAL_QUOTE_MIN_PASSENGERS/);
  assert.match(page, /isValidPersonalQuotePassengerCount/);
  assert.match(page, /PERSONAL_QUOTE_VEHICLE_TYPES\.map/);
  assert.doesNotMatch(page, /max=\{7\}/);
  assert.doesNotMatch(page, /[^_]VEHICLE_TYPES\.map/);
  // Filtered list excludes minibus / larger capacity labels from the selectable options source.
  assert.match(page, /includes\("minibus"\)/);
  const createPay = read("src/lib/create-payment.ts");
  assert.match(createPay, /personalQuoteCode[\s\S]{0,200}?isValidPersonalQuotePassengerCount/);
  const payment = read("workers/addresses/src/index.ts");
  assert.match(payment, /personalQuoteCode && !isValidPersonalQuotePassengerCount/);
  assert.match(payment, /PERSONAL_QUOTE_PASSENGER_LIMIT_ERROR/);
});

check("L11. SumUp amount still from KV agreedAmount; MQ path unchanged", () => {
  const payment = read("workers/addresses/src/index.ts");
  assert.match(payment, /Personal quote: authorised amount from KV only/);
  assert.match(payment, /amount = resolved\.amount/);
  assert.match(payment, /resolvePersonalQuoteForPayment/);
  assert.match(payment, /returnJourney: Boolean\(booking\?\.returnJourney\)/);
  const page = read("src/app/personal-quote/PersonalQuoteCustomerClient.tsx");
  assert.match(page, /Worker recalculates from KV/);
  assert.doesNotMatch(page, /searchParams\.get\(["'](?:amount|fare|price|discount)/);
  assert.match(read("src/components/QuoteCard.tsx"), /validatePersonalQuoteCode/);
  assert.match(read("src/components/QuoteCard.tsx"), /Apply Quote/);
});

check("R10. Return payment matrix (one-way / website return / personal discount)", () => {
  assert.equal(
    resolvePersonalQuoteCheckoutAmount({
      agreedAmount: 100,
      standardWebsiteAmount: 100,
      returnJourney: false,
    }),
    100,
  );
  assert.equal(
    resolvePersonalQuoteCheckoutAmount({
      agreedAmount: 100,
      standardWebsiteAmount: 100,
      returnJourney: true,
    }),
    190,
  );
  assert.equal(
    resolvePersonalQuoteCheckoutAmount({
      agreedAmount: 90,
      standardWebsiteAmount: 100,
      returnJourney: false,
    }),
    90,
  );
  assert.equal(
    resolvePersonalQuoteCheckoutAmount({
      agreedAmount: 90,
      standardWebsiteAmount: 100,
      returnJourney: true,
    }),
    180,
  );
  assert.equal(
    resolvePersonalQuoteCheckoutAmount({
      agreedAmount: 90,
      returnJourney: true,
    }),
    180,
  );
  // Public website helper and Personal Quote eligible-return path share one rate source.
  assert.equal(getReturnJourneyFare(100), 190);
  assert.equal(getWebsiteReturnJourneyFare(100), 190);
  assert.equal(getReturnJourneyFare(100), getWebsiteReturnJourneyFare(100));
  assert.equal(RETURN_JOURNEY_DISCOUNT_RATE, returnDiscountRates.returnJourneyDiscountRate);
  assert.equal(PRICING_CONFIG.returnJourneyDiscountRate, RETURN_JOURNEY_DISCOUNT_RATE);
  assert.doesNotMatch(read("shared/personal-quote.ts"), /PERSONAL_QUOTE_WEBSITE_RETURN_DISCOUNT_RATE\s*=\s*0\.05/);
  assert.doesNotMatch(read("shared/personal-quote.ts"), /× 2 \* \(1 - 0\.05\)|2 \* 0\.95/);
});

check("R10b. Shared return rate drives both public and Personal Quote (no hard-coded PQ rate)", () => {
  // Prove eligible Personal Quote return uses getWebsiteReturnJourneyFare (shared rate),
  // and public getReturnJourneyFare uses the same RETURN_JOURNEY_DISCOUNT_RATE.
  const shared = read("shared/personal-quote.ts");
  assert.match(shared, /getWebsiteReturnJourneyFare/);
  assert.match(read("shared/return-journey-discount.ts"), /return-journey-discount-rate\.json/);
  assert.match(read("src/lib/pricing-config.ts"), /RETURN_JOURNEY_DISCOUNT_RATE/);
  assert.match(read("src/lib/point-to-point-premium.ts"), /from "\.\.\/\.\.\/shared\/return-journey-discount"/);
  assert.doesNotMatch(read("src/lib/pricing-config.json"), /"returnJourneyDiscountRate"\s*:/);
  // Changing the shared JSON rate would change both formulas (algebraic identity).
  const rate = RETURN_JOURNEY_DISCOUNT_RATE;
  assert.equal(rate, 0.05);
  assert.equal(getWebsiteReturnJourneyFare(100), Math.round(100 * 2 * (1 - rate) * 100) / 100);
  assert.equal(getReturnJourneyFare(100), Math.round(100 * 2 * (1 - rate) * 100) / 100);
  // Eligible PQ checkout amount is the shared website return fare (not a private constant).
  assert.equal(
    resolvePersonalQuoteCheckoutAmount({
      agreedAmount: 100,
      standardWebsiteAmount: 100,
      returnJourney: true,
    }),
    getWebsiteReturnJourneyFare(100),
  );
  // If the shared rate were 10%, both public and eligible PQ returns would be £180.
  const altRate = 0.1;
  const altFare = Math.round(100 * 2 * (1 - altRate) * 100) / 100;
  assert.equal(altFare, 180);
  assert.notEqual(altFare, getWebsiteReturnJourneyFare(100));
  assert.equal(
    Math.round(100 * 2 * (1 - RETURN_JOURNEY_DISCOUNT_RATE) * 100) / 100,
    getReturnJourneyFare(100),
  );
});

check("R11. Personally discounted detection (currency-safe)", () => {
  assert.equal(isPersonallyDiscountedPersonalQuote(75, 75), false);
  assert.equal(isPersonallyDiscountedPersonalQuote(65, 75), true);
  assert.equal(isPersonallyDiscountedPersonalQuote(90, undefined), true);
  assert.equal(isPersonallyDiscountedPersonalQuote(100.0, 100.001), false);
});

check("R12. Customer return display + toggle wiring", () => {
  const page = read("src/app/personal-quote/PersonalQuoteCustomerClient.tsx");
  assert.match(page, /describePersonalQuotePayment/);
  assert.match(page, /formatReturnJourneyDiscountPercent/);
  assert.match(page, /Return journey discount:\s*\{formatReturnJourneyDiscountPercent\(\)\}/);
  // Must not hard-code the percentage in the Personal Quote UI.
  assert.doesNotMatch(page, /Return journey discount:\s*5%/);
  assert.doesNotMatch(page, /Return journey discount:\s*["'`]5%/);
  assert.equal(formatReturnJourneyDiscountPercent(), `${Math.round(RETURN_JOURNEY_DISCOUNT_RATE * 100)}%`);
  assert.equal(formatReturnJourneyDiscountPercent(0.05), "5%");
  assert.equal(formatReturnJourneyDiscountPercent(0.1), "10%");
  assert.match(page, /Return total:/);
  assert.match(page, /Personal agreed fare:/);
  assert.match(page, /paymentDisplay\.paymentAmountLabel/);
  assert.match(page, /setReturnJourney/);
  const displayReturn = describePersonalQuotePayment({
    agreedAmount: 100,
    standardWebsiteAmount: 100,
    returnJourney: true,
  });
  assert.equal(displayReturn.paymentAmount, 190);
  assert.equal(displayReturn.appliesWebsiteReturnDiscount, true);
  const displayPq = describePersonalQuotePayment({
    agreedAmount: 90,
    standardWebsiteAmount: 100,
    returnJourney: true,
  });
  assert.equal(displayPq.paymentAmount, 180);
  assert.equal(displayPq.appliesWebsiteReturnDiscount, false);
  const oneWay = describePersonalQuotePayment({
    agreedAmount: 90,
    standardWebsiteAmount: 100,
    returnJourney: false,
  });
  assert.equal(oneWay.paymentAmount, 90);
});

check("R13. Browser cannot dictate SumUp amount (Worker uses KV + returnJourney only)", () => {
  const handlers = read("workers/addresses/src/personal-quote-handlers.ts");
  assert.match(handlers, /resolvePersonalQuoteCheckoutAmount/);
  assert.match(handlers, /options\?\.returnJourney/);
  const payment = read("workers/addresses/src/index.ts");
  assert.match(payment, /never use client standardWebsiteAmount for SumUp amount/);
  // Client amount is overwritten after resolve.
  assert.match(payment, /amount = resolved\.amount/);
});

check("R14. Owner calculator reuses public website pricing engine", () => {
  const fareMod = read("src/lib/website-fare.ts");
  assert.match(fareMod, /from "@\/lib\/quote"/);
  assert.match(fareMod, /calculateQuote/);
  assert.match(fareMod, /calculatePointToPointQuote/);
  assert.match(fareMod, /calculateDublinCityBeyondAirportQuote/);
  assert.match(fareMod, /returnJourney = false/);
  assert.match(fareMod, /schedule/);
  const panel = read("src/components/OwnerPersonalQuotesPanel.tsx");
  assert.match(panel, /calculateWebsiteOneWayFare/);
  assert.match(panel, /Calculate website price/);
  assert.match(panel, /AddressInput/);
  assert.match(panel, /Current website price/);
  assert.match(panel, /journeyDate/);
  assert.match(panel, /outboundDate/);
  // Same engine: calculateQuote result is finite for a known airport leg.
  const airportDirect = calculateQuote(
    "Holywood BT18",
    "BHD",
    "Standard Saloon (1–4 passengers)",
    false,
    {},
    { distanceKm: 12, durationMinutes: 20 },
  );
  assert.ok(airportDirect && Number.isFinite(airportDirect.amount));
  assert.equal(typeof calculateWebsiteOneWayFare, "function");
});

check("R14b. Owner one-way fare matches public calculator for identical inputs (incl. weekend)", () => {
  const metrics = { distanceKm: 28, durationMinutes: 40 };
  const pickup = "12 Botanic Avenue, Belfast BT7 1JG";
  const dropoff = "45 Main Street, Bangor BT20 5AF";
  const vehicle = "Standard Saloon (1–4 passengers)" as const;

  const weekdaySchedule = {
    outboundDate: "2026-08-19", // Wednesday
    outboundTime: "10:00",
    returnJourney: false,
  };
  const weekendSchedule = {
    outboundDate: "2026-08-22", // Saturday
    outboundTime: "10:00",
    returnJourney: false,
  };

  const publicWeekday = calculatePointToPointQuote(
    pickup,
    dropoff,
    vehicle,
    false,
    weekdaySchedule,
    metrics,
  );
  const ownerWeekday = calculateWebsiteOneWayFare({
    pickupAddress: pickup,
    dropoffAddress: dropoff,
    pickupPlace: null,
    dropoffPlace: null,
    vehicleType: vehicle,
    routeMetrics: metrics,
    schedule: weekdaySchedule,
  });
  assert.ok(publicWeekday && ownerWeekday);
  assert.equal(ownerWeekday!.amount, publicWeekday!.amount);

  const publicWeekend = calculatePointToPointQuote(
    pickup,
    dropoff,
    vehicle,
    false,
    weekendSchedule,
    metrics,
  );
  const ownerWeekend = calculateWebsiteOneWayFare({
    pickupAddress: pickup,
    dropoffAddress: dropoff,
    pickupPlace: null,
    dropoffPlace: null,
    vehicleType: vehicle,
    routeMetrics: metrics,
    schedule: weekendSchedule,
  });
  assert.ok(publicWeekend && ownerWeekend);
  assert.equal(ownerWeekend!.amount, publicWeekend!.amount);
  // Weekend premium should change the one-way A2A fare vs weekday when premium rate > 0.
  if (PRICING_CONFIG.addressToAddressTripPremiumRate > 0) {
    assert.notEqual(publicWeekend!.amount, publicWeekday!.amount);
    assert.ok(publicWeekend!.premiumApplied);
  }

  // Bank Holiday (NI May Day 2026-05-04) — same schedule-sensitive path.
  const bankHolidaySchedule = {
    outboundDate: "2026-05-04",
    outboundTime: "10:00",
    returnJourney: false,
  };
  const publicBankHoliday = calculatePointToPointQuote(
    pickup,
    dropoff,
    vehicle,
    false,
    bankHolidaySchedule,
    metrics,
  );
  const ownerBankHoliday = calculateWebsiteOneWayFare({
    pickupAddress: pickup,
    dropoffAddress: dropoff,
    pickupPlace: null,
    dropoffPlace: null,
    vehicleType: vehicle,
    routeMetrics: metrics,
    schedule: bankHolidaySchedule,
  });
  assert.ok(publicBankHoliday && ownerBankHoliday);
  assert.equal(ownerBankHoliday!.amount, publicBankHoliday!.amount);
  if (PRICING_CONFIG.addressToAddressTripPremiumRate > 0) {
    assert.notEqual(publicBankHoliday!.amount, publicWeekday!.amount);
    assert.ok(publicBankHoliday!.premiumApplied);
  }
});

check("R14c. Owner airport weekend fare matches public (no weekend surcharge)", () => {
  assert.equal(PRICING_CONFIG.airportTripPremiumRate, 0);
  const cityHall = "Belfast City Hall, Belfast BT1 5GS";
  const vehicle = "Standard Saloon (1–4 passengers)" as const;
  const weekdaySchedule = {
    outboundDate: "2026-08-19",
    outboundTime: "10:00",
    returnJourney: false,
  };
  const weekendSchedule = {
    outboundDate: "2026-08-22",
    outboundTime: "10:00",
    returnJourney: false,
  };
  const publicWeekday = calculateQuote(cityHall, "BFS", vehicle, false, weekdaySchedule);
  const publicWeekend = calculateQuote(cityHall, "BFS", vehicle, false, weekendSchedule);
  assert.ok(publicWeekday && publicWeekend);
  assert.equal(publicWeekday!.premiumApplied, false);
  assert.equal(publicWeekend!.premiumApplied, false);
  assert.equal(publicWeekend!.amount, publicWeekday!.amount);

  const cityPlace = {
    ...emptySelectedPlace(),
    placeId: "city-hall-test",
    formattedAddress: cityHall,
    displayAddress: cityHall,
    placeName: "Belfast City Hall",
    lat: 54.5964,
    lng: -5.9301,
    countryCode: "GB",
    postalCode: "BT1 5GS",
  };
  const bfsPlace = {
    ...emptySelectedPlace(),
    placeId: "ChIJy4dKsjJVYEgRntaoTC4U5gw",
    formattedAddress: "Belfast International Airport, Airport Rd, Aldergrove BT29 4AB, UK",
    displayAddress: "Belfast International Airport, Aldergrove",
    placeName: "Belfast International Airport",
    lat: 54.6575,
    lng: -6.2158,
    countryCode: "GB",
    postalCode: "BT29 4AB",
  };
  const ownerWeekday = calculateWebsiteOneWayFare({
    pickupAddress: cityHall,
    dropoffAddress: "Belfast International Airport",
    pickupPlace: cityPlace,
    dropoffPlace: bfsPlace,
    vehicleType: vehicle,
    routeMetrics: null,
    schedule: weekdaySchedule,
  });
  const ownerWeekend = calculateWebsiteOneWayFare({
    pickupAddress: cityHall,
    dropoffAddress: "Belfast International Airport",
    pickupPlace: cityPlace,
    dropoffPlace: bfsPlace,
    vehicleType: vehicle,
    routeMetrics: null,
    schedule: weekendSchedule,
  });
  assert.ok(ownerWeekday && ownerWeekend);
  assert.equal(ownerWeekday!.amount, publicWeekday!.amount);
  assert.equal(ownerWeekend!.amount, publicWeekend!.amount);
  // standardWebsiteAmount stores the schedule-adjusted one-way fare.
  assert.equal(ownerWeekend!.amount, publicWeekend!.amount);
});

check("R15. Layout shift guards still present", () => {
  const css = read("src/app/globals.css");
  assert.match(css, /scrollbar-gutter:\s*stable/);
  const panel = read("src/components/OwnerPersonalQuotesPanel.tsx");
  assert.match(panel, /mb-8 w-full min-w-0 max-w-full/);
  assert.match(panel, /fieldClass/);
});

console.log("\nAll personal quote code checks passed.");
