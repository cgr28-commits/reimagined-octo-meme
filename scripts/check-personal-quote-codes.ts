/**
 * Offline checks for Personal Quote Codes (individually agreed fares).
 * Run: npx tsx scripts/check-personal-quote-codes.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  evaluatePersonalQuote,
  generatePersonalQuoteCode,
  normalizePersonalQuoteCode,
  personalQuoteCustomerError,
  type PersonalQuoteRecord,
} from "../shared/personal-quote";

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
  const panel = read("src/components/OwnerPersonalQuotesPanel.tsx");
  assert.match(panel, /Generate personal quote code/);
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

console.log("\nAll personal quote code checks passed.");
