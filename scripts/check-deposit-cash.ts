/**
 * Deposit + Cash Stage 2 — homepage instant quote only.
 * Run: npx tsx scripts/check-deposit-cash.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_DEPOSIT_CASH_ENABLED,
  DEFAULT_DEPOSIT_MINIMUM_GBP,
  DEFAULT_DEPOSIT_PERCENT,
  PAYMENT_METHOD_DEPOSIT_CASH,
  PAYMENT_METHOD_FULL_ONLINE,
  calculateDepositCashQuote,
  cashAgreementLabel,
  cashDueOnTheDayCopy,
  defaultDepositCashSettings,
  depositPayButtonLabel,
  normalizeDepositCashSettings,
  paidBookingConversionValueGbp,
  parseDepositCashSettingsInput,
  publicDepositCashOffer,
  remainingCashDueGbp,
  snapshotDepositCash,
} from "../shared/deposit-cash";
import {
  CHECKOUT_CANCELLATION_SUMMARY,
  DEPOSIT_CASH_POLICY_PARAGRAPHS,
  DEPOSIT_CASH_POLICY_TITLE,
  MORE_THAN_24H_REFUND,
} from "../shared/cancellation-policy";
import { CANCELLATION_POLICY_VERSION, remainingRefundableBalance } from "../shared/refund-ops";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
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

console.log("=== Defaults and calculator ===");
check("disabled by default with 20% / £15", () => {
  assert.equal(DEFAULT_DEPOSIT_CASH_ENABLED, false);
  assert.equal(DEFAULT_DEPOSIT_PERCENT, 20);
  assert.equal(DEFAULT_DEPOSIT_MINIMUM_GBP, 15);
  const settings = defaultDepositCashSettings();
  assert.equal(settings.enabled, false);
  assert.equal(settings.percent, 20);
  assert.equal(settings.minimumGbp, 15);
});

check("£100 fare → £20 deposit / £80 cash", () => {
  const quote = calculateDepositCashQuote(100, {
    enabled: true,
    percent: 20,
    minimumGbp: 15,
  });
  assert.equal(quote.eligible, true);
  assert.equal(quote.depositGbp, 20);
  assert.equal(quote.cashDueGbp, 80);
  assert.equal(quote.depositGbp + quote.cashDueGbp, quote.totalFare);
});

check("minimum deposit wins on a low fare", () => {
  const quote = calculateDepositCashQuote(40, {
    enabled: true,
    percent: 20,
    minimumGbp: 15,
  });
  assert.equal(quote.depositGbp, 15);
  assert.equal(quote.cashDueGbp, 25);
});

check("hides Deposit + Cash when deposit covers almost the whole fare", () => {
  const quote = calculateDepositCashQuote(15.5, {
    enabled: true,
    percent: 20,
    minimumGbp: 15,
  });
  assert.equal(quote.eligible, false);
  assert.equal(calculateDepositCashQuote(15, {
    enabled: true,
    percent: 20,
    minimumGbp: 15,
  }).eligible, false);
});

check("public offer is ineligible while admin setting is off", () => {
  const offer = publicDepositCashOffer(100, defaultDepositCashSettings());
  assert.equal(offer.enabled, false);
  assert.equal(offer.eligible, false);
});

check("settings parser rejects fractions and out-of-range values", () => {
  assert.throws(() => parseDepositCashSettingsInput({ enabled: true, percent: 20.5, minimumGbp: 15 }));
  assert.throws(() => parseDepositCashSettingsInput({ enabled: true, percent: 9, minimumGbp: 15 }));
  assert.throws(() => parseDepositCashSettingsInput({ enabled: true, percent: 20, minimumGbp: 4 }));
  const parsed = parseDepositCashSettingsInput({ enabled: true, percent: 25, minimumGbp: 20 });
  assert.deepEqual(parsed, { enabled: true, percent: 25, minimumGbp: 20 });
  const normalized = normalizeDepositCashSettings({ enabled: "yes", percent: 99, minimumGbp: 1 });
  assert.equal(normalized.enabled, false);
  assert.equal(normalized.percent, 20);
  assert.equal(normalized.minimumGbp, 15);
});

console.log("\n=== Ads conversion uses the confirmed booking fare ===");
check("conversion value is the full fare, never the deposit", () => {
  assert.equal(
    paidBookingConversionValueGbp({ totalFare: 100, amount: 20 }),
    100,
  );
  assert.equal(paidBookingConversionValueGbp({ amount: 45 }), 45);
  const ads = read("workers/addresses/src/paid-booking-ads-conversion.ts");
  assert.match(ads, /paidBookingConversionValueGbp|totalFare/);
  assert.match(ads, /typeof record\.totalFare === "number" && record\.totalFare > 0/);
  assert.doesNotMatch(
    ads,
    /amount:\s*\n\s*typeof record\.originalAmount === "number"/,
  );
  const finalize = read("workers/addresses/src/finalize-paid-checkout.ts");
  assert.match(finalize, /confirmedFareGbp/);
  assert.match(finalize, /paidBookingConversionValueGbp\(existing\)/);
  assert.match(finalize, /amount: confirmedFareGbp/);
});

console.log("\n=== Worker is authoritative; specialist paths stay full-pay ===");
check("homepage payment path only applies deposit after fare lock", () => {
  const payments = read("workers/addresses/src/index.ts");
  assert.match(payments, /PAYMENT_METHOD_DEPOSIT_CASH/);
  assert.match(payments, /specialistPayPath/);
  assert.match(payments, /shortNoticeToken/);
  assert.match(payments, /a2aQuoteToken/);
  assert.match(payments, /personalQuoteCode/);
  assert.match(payments, /quickQuoteId/);
  assert.match(payments, /savedQuoteToken/);
  assert.match(payments, /cashAgreementAccepted/);
  assert.match(payments, /calculateDepositCashQuote\(amount, settings\.depositCash\)/);
  assert.doesNotMatch(payments, /body\.depositGbp|body\.depositPercent|body\.minimumGbp/);
});

check("QuoteCard is the only customer payment-choice UI", () => {
  const card = read("src/components/QuoteCard.tsx");
  assert.match(card, /showDepositCashChoice/);
  assert.match(card, /cashAgreementAccepted/);
  assert.match(card, /depositPayButtonLabel/);
  assert.doesNotMatch(read("src/app/personal-quote/PersonalQuoteCustomerClient.tsx"), /DEPOSIT_CASH/);
  assert.doesNotMatch(read("src/app/quote/SavedQuoteCustomerClient.tsx"), /DEPOSIT_CASH/);
  assert.doesNotMatch(read("src/app/book-quote/BookQuoteCustomerClient.tsx"), /DEPOSIT_CASH/);
  assert.doesNotMatch(read("src/app/pay/short-notice/ShortNoticePayClient.tsx"), /DEPOSIT_CASH/);
  assert.doesNotMatch(read("src/app/pay/a2a-quote/A2aQuotePayClient.tsx"), /DEPOSIT_CASH/);
  assert.doesNotMatch(read("src/app/quick-quote/QuickQuoteOwnerClient.tsx"), /DEPOSIT_CASH/);
});

check("Deposit + Cash renders before Full Online and is preselected when eligible", () => {
  const card = read("src/components/QuoteCard.tsx");
  const depositCard = card.indexOf("{DEPOSIT_CASH_OPTION_LABEL}");
  const fullCard = card.indexOf("{FULL_ONLINE_OPTION_LABEL}");
  assert.ok(depositCard > 0, "Deposit + Cash card missing");
  assert.ok(fullCard > 0, "Pay in Full Online card missing");
  assert.ok(
    depositCard < fullCard,
    "Deposit + Cash must render before Pay in Full Online",
  );
  assert.match(
    card,
    /useState<PaymentMethod>\(PAYMENT_METHOD_DEPOSIT_CASH\)/,
  );
  assert.match(card, /DEPOSIT_CASH_BADGE/);
  assert.match(card, /todayPayLabel\(depositCashOffer\.depositGbp\)/);
  assert.match(card, /cashToDriverOnTheDayLabel\(depositCashOffer\.cashDueGbp\)/);
  assert.match(card, /todayPayLabel\(depositCashOffer\.totalFare\)/);
  assert.match(card, /nothingToPayOnTheDayLabel\(\)/);
});

check("cash agreement stays unchecked and is required before pay", () => {
  const card = read("src/components/QuoteCard.tsx");
  assert.match(card, /const \[cashAgreementAccepted, setCashAgreementAccepted\] = useState\(false\)/);
  assert.match(
    card,
    /paymentMethod === PAYMENT_METHOD_DEPOSIT_CASH &&\s*\n\s*!cashAgreementAccepted/,
  );
  assert.match(card, /checked=\{cashAgreementAccepted\}/);
  assert.doesNotMatch(card, /setCashAgreementAccepted\(true\)/);
});

check("disabled or ineligible Deposit + Cash keeps existing full-online pay behaviour", () => {
  const card = read("src/components/QuoteCard.tsx");
  assert.match(
    card,
    /showDepositCashChoice && depositCashOffer\s*\n\s+\? selectedDepositCash/,
  );
  assert.match(
    card,
    /: `Confirm booking & pay securely — \$\{amountLabel \?\? formatQuote\(liveQuote\.amount\)\}`/,
  );
  assert.match(
    card,
    /\.\.\.\(showDepositCashChoice\s*\n\s+\? \{\s*\n\s+paymentMethod,/,
  );
  const payments = read("workers/addresses/src/index.ts");
  assert.match(payments, /settings\.depositCash\.enabled === true/);
  assert.match(payments, /specialistPayPath/);
});

check("quote API exposes a public offer for non-owner quotes only", () => {
  const quotes = read("workers/addresses/src/quote-handlers.ts");
  assert.match(quotes, /publicDepositCashOffer/);
  assert.match(quotes, /if \(!ownerMode\)/);
});

console.log("\n=== Settings affect new bookings only ===");
check("pending checkout and paid records snapshot deposit figures", () => {
  const pending = read("workers/addresses/src/pending-checkout-store.ts");
  assert.match(pending, /paymentMethod\?: "FULL_ONLINE" \| "DEPOSIT_CASH"/);
  assert.match(pending, /depositPercentUsed/);
  const record = read("shared/paid-booking-record.ts");
  assert.match(record, /depositPercentUsed/);
  assert.match(record, /never recalculated later/);
  const snapshot = snapshotDepositCash(
    calculateDepositCashQuote(100, { enabled: true, percent: 20, minimumGbp: 15 }),
  );
  assert.equal(snapshot.onlineAmountPaid, 20);
  assert.equal(snapshot.cashBalanceDue, 80);
  assert.equal(snapshot.depositPercentUsed, 20);
});

check("owner settings preserve depositCash on unrelated writes", () => {
  const store = read("workers/addresses/src/booking-settings-store.ts");
  assert.match(store, /depositCash: current\.depositCash/);
  assert.match(store, /updateDepositCashSettings/);
  assert.match(store, /defaultDepositCashSettings/);
});

console.log("\n=== Refunds stay capped to card money ===");
check("£20 deposit refundable; £80 cash is not card money", () => {
  assert.equal(remainingRefundableBalance(20, 0), 20);
  assert.equal(remainingCashDueGbp({
    paymentMethod: PAYMENT_METHOD_DEPOSIT_CASH,
    cashBalanceDue: 80,
    cashCollected: false,
  }), 80);
  assert.equal(remainingCashDueGbp({
    paymentMethod: PAYMENT_METHOD_DEPOSIT_CASH,
    cashBalanceDue: 80,
    cashCollected: true,
  }), 0);
  assert.equal(remainingCashDueGbp({
    paymentMethod: PAYMENT_METHOD_FULL_ONLINE,
    cashBalanceDue: 80,
  }), 0);
});

console.log("\n=== Legal copy ===");
check("24-hour rule now refunds the amount actually paid", () => {
  assert.match(CHECKOUT_CANCELLATION_SUMMARY, /refund of the amount actually paid/);
  assert.match(CHECKOUT_CANCELLATION_SUMMARY, /non-refundable/);
  assert.match(MORE_THAN_24H_REFUND, /amount actually paid/);
  assert.doesNotMatch(MORE_THAN_24H_REFUND, /full refund of the fare paid/);
  assert.equal(CANCELLATION_POLICY_VERSION, "September 2026 v2");
  assert.equal(DEPOSIT_CASH_POLICY_TITLE, "Deposit + Cash bookings");
  assert.ok(DEPOSIT_CASH_POLICY_PARAGRAPHS.some((line) => line.includes("card deposit")));
  const policy = read("shared/cancellation-policy.ts");
  assert.match(policy, /DEPOSIT_CASH_POLICY_TITLE/);
  const terms = read("src/lib/terms.ts");
  assert.match(terms, /DEPOSIT_CASH_POLICY_TITLE/);
  assert.match(terms, /Deposit \+ Cash is not available on Personal Quotes/);
});

console.log("\n=== Confirmation reminders only; WhatsApp operational messages unchanged ===");
check("confirmation page and email mention cash due", () => {
  assert.match(read("src/app/booking-confirmed/BookingConfirmedClient.tsx"), /cashDueOnTheDayCopy/);
  assert.match(read("shared/booking-notifications.ts"), /cash balance due/);
  assert.match(cashDueOnTheDayCopy(80), /£80/);
  assert.match(cashAgreementLabel(80), /£80 is payable in cash/);
  assert.match(depositPayButtonLabel(20), /Pay £20 Deposit/);
});

check("Driver on Way / Arrived WhatsApp messages stay operational-only", () => {
  const whatsapp = read("shared/arrival-whatsapp.ts");
  assert.doesNotMatch(whatsapp, /deposit|cash due|cash balance|total fare/i);
  const companyVoice = read("scripts/check-company-voice-journey-messages.ts");
  assert.match(companyVoice, /Driver on the way|on the way/i);
});

console.log("\n=== Owner / driver UI ===");
check("owner can toggle Deposit + Cash and mark cash collected", () => {
  assert.match(read("src/components/OwnerDepositCashSettings.tsx"), /Save Deposit \+ Cash/);
  assert.match(read("src/components/OwnerShortNoticePanel.tsx"), /OwnerDepositCashSettings/);
  assert.match(read("src/components/OwnerPaidBookingsPanel.tsx"), /CASH DUE/);
  assert.match(read("src/components/OwnerPaidBookingsPanel.tsx"), /markPaidBookingCashCollected/);
  assert.match(read("src/app/driver/DriverPageClient.tsx"), /CASH TO COLLECT/);
  assert.match(read("workers/addresses/src/paid-booking-handlers.ts"), /handlePaidBookingCashCollectedRequest/);
  assert.match(read("shared/driver-job-sanitize.ts"), /cashBalanceDue/);
});

console.log("\nAll Deposit + Cash checks passed.");
