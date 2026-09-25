/**
 * Deposit + Cash Stage 2 — homepage instant quote only.
 * Run: npx tsx scripts/check-deposit-cash.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CASH_AGREEMENT_REQUIRED_MESSAGE,
  CASH_SELECTED_CARD_UNAVAILABLE,
  DEFAULT_DEPOSIT_CASH_ENABLED,
  DEFAULT_DEPOSIT_MINIMUM_GBP,
  DEFAULT_DEPOSIT_PERCENT,
  DEPOSIT_CASH_SELECTED_HEADING,
  PAYMENT_METHOD_DEPOSIT_CASH,
  PAYMENT_METHOD_FULL_ONLINE,
  REMAINING_BALANCE_CASH_ONLY,
  bookingTotalLabel,
  calculateDepositCashQuote,
  cashAgreementLabel,
  cashDueOnTheDayCopy,
  cashOnTheDayCardLabel,
  cashSelectedBody,
  cashSelectedRemainingSentence,
  defaultDepositCashSettings,
  depositCashAmountsMatch,
  depositPaidOnlineLabel,
  depositPayButtonLabel,
  formatDepositCashGbp,
  fullPayButtonLabel,
  nothingToPayOnTheDayLabel,
  normalizeDepositCashSettings,
  paidBookingConversionValueGbp,
  parseDepositCashSettingsInput,
  paymentSummaryCashDueLabel,
  paymentSummaryPayTodayDepositLabel,
  paymentSummaryTotalFareLabel,
  publicDepositCashOffer,
  remainingCashDueGbp,
  snapshotDepositCash,
  todayPayLabel,
} from "../shared/deposit-cash";
import { formatGbpAmount, isWholePoundGbp, roundGbp } from "../shared/gbp";
import { buildCustomerConfirmationEmail } from "../shared/booking-notifications";
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

function assertWholePoundDepositCash(
  fare: number,
  expectedDeposit: number,
  expectedCash: number,
  settings = { enabled: true, percent: 20, minimumGbp: 15 },
) {
  const quote = calculateDepositCashQuote(fare, settings);
  const percentAmount = roundGbp((roundGbp(fare) * settings.percent) / 100);
  const baseDeposit = roundGbp(Math.max(percentAmount, settings.minimumGbp));
  assert.equal(quote.totalFare, roundGbp(fare));
  assert.equal(quote.depositGbp, expectedDeposit);
  assert.equal(quote.cashDueGbp, expectedCash);
  assert.equal(roundGbp(quote.depositGbp + quote.cashDueGbp), quote.totalFare);
  assert.equal(isWholePoundGbp(quote.cashDueGbp), true);
  assert.ok(quote.depositGbp + 1e-9 >= baseDeposit, "deposit must not fall below the configured base");
  assert.ok(quote.depositGbp <= quote.totalFare);
  assert.ok(quote.cashDueGbp >= 0);
  assert.ok(
    depositCashAmountsMatch({
      totalFare: quote.totalFare,
      onlineAmountPaid: quote.depositGbp,
      cashBalanceDue: quote.cashDueGbp,
    }),
  );
  return quote;
}

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
  assert.match(card, /formatDepositCashGbp\(depositCashOffer\.cashDueGbp\)/);
  assert.doesNotMatch(card, /calculateDepositCashQuote/);
  assert.doesNotMatch(card, /Math\.floor\(|oddPence|cashPence/);
  assert.match(card, /CASH/);
  assert.match(card, /todayPayLabel\(depositCashOffer\.totalFare\)/);
  assert.match(card, /nothingToPayOnTheDayLabel\(\)/);
  assert.match(card, /FULL_ONLINE_SUPPORTING/);
  assert.match(card, /paymentSummaryTotalFareLabel\(depositCashOffer\.totalFare\)/);
  assert.match(card, /paymentSummaryPayTodayDepositLabel\(depositCashOffer\.depositGbp\)/);
  assert.match(card, /paymentSummaryCashDueLabel\(depositCashOffer\.cashDueGbp\)/);
  assert.match(card, /cashSelectedRemainingSentence\(depositCashOffer\.cashDueGbp\)/);
  assert.match(card, /CASH_SELECTED_CARD_UNAVAILABLE/);
  assert.match(card, /CASH_AGREEMENT_REQUIRED_MESSAGE/);
  assert.doesNotMatch(card, /Cash payment selected/);
  assert.doesNotMatch(card, /Our drivers don't accept cards/);
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
  assert.match(card, /setPaymentError\(CASH_AGREEMENT_REQUIRED_MESSAGE\)/);
});

check("switching to Full Online drops the cash acknowledgement requirement", () => {
  const card = read("src/components/QuoteCard.tsx");
  const fullOnlineClick = card.indexOf("setPaymentMethod(PAYMENT_METHOD_FULL_ONLINE)");
  const resetAgreement = card.indexOf("setCashAgreementAccepted(false)", fullOnlineClick);
  assert.ok(fullOnlineClick > 0, "Full Online switch missing");
  assert.ok(resetAgreement > fullOnlineClick, "Switching to Full Online must clear the cash tick");
  assert.match(card, /selectedDepositCash \? \(/);
  assert.match(card, /\{cashAgreementLabel\(depositCashOffer\.cashDueGbp\)\}/);
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
  assert.equal(remainingRefundableBalance(15.1, 0), 15.1);
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
  assert.ok(
    DEPOSIT_CASH_POLICY_PARAGRAPHS.some((line) =>
      line.includes("Card payment is not available for the remaining balance"),
    ),
  );
  const policy = read("shared/cancellation-policy.ts");
  assert.match(policy, /DEPOSIT_CASH_POLICY_TITLE/);
  const terms = read("src/lib/terms.ts");
  assert.match(terms, /DEPOSIT_CASH_POLICY_TITLE/);
  assert.match(terms, /Deposit \+ Cash is not available on Personal Quotes/);
  assert.match(terms, /the amount charged online is a deposit towards the total fare/);
  assert.match(terms, /Card payment is not available for the remaining balance/);
  assert.doesNotMatch(terms, /Our drivers don't accept cards/);
});

console.log("\n=== Confirmation reminders only; WhatsApp operational messages unchanged ===");
check("confirmation page and email mention cash due", () => {
  const confirmed = read("src/app/booking-confirmed/BookingConfirmedClient.tsx");
  assert.match(confirmed, /cashDueOnTheDayCopy/);
  assert.match(confirmed, /PAYMENT_DETAILS_HEADING/);
  assert.match(confirmed, /depositPaidOnlineLabel/);
  assert.match(confirmed, /REMAINING_BALANCE_CASH_ONLY/);
  assert.doesNotMatch(confirmed, /Our drivers don't accept cards/);
  const email = read("shared/booking-notifications.ts");
  assert.match(email, /cash balance due/);
  assert.match(email, /Deposit paid online/);
  assert.match(email, /REMAINING_BALANCE_CASH_ONLY/);
  assert.doesNotMatch(email, /Paid in full[\s\S]{0,80}depositCashReceiptDetails/);
});

check("Driver on Way / Arrived WhatsApp messages stay operational-only", () => {
  const whatsapp = read("shared/arrival-whatsapp.ts");
  assert.doesNotMatch(whatsapp, /deposit|cash due|cash balance|total fare/i);
  const companyVoice = read("scripts/check-company-voice-journey-messages.ts");
  assert.match(companyVoice, /Driver on the way|on the way/i);
});

console.log("\n=== Whole-pound cash balance (central calculator) ===");
const defaultOnSettings = { enabled: true, percent: 20, minimumGbp: 15 };

check("£45.10 → £15.10 online / £30.00 cash", () => {
  const quote = assertWholePoundDepositCash(45.1, 15.1, 30);
  assert.equal(quote.eligible, true);
  assert.equal(quote.percentUsed, 20);
  assert.equal(quote.minimumUsed, 15);
});

check("£50.10 → £15.10 online / £35.00 cash", () => {
  assert.equal(assertWholePoundDepositCash(50.1, 15.1, 35).eligible, true);
});

check("£63.75 → £15.75 online / £48.00 cash", () => {
  assert.equal(assertWholePoundDepositCash(63.75, 15.75, 48).eligible, true);
});

check("£100.00 stays £20.00 / £80.00 with no pence adjustment", () => {
  assert.equal(assertWholePoundDepositCash(100, 20, 80).eligible, true);
});

check("£190.40 → £38.40 online / £152.00 cash", () => {
  assert.equal(assertWholePoundDepositCash(190.4, 38.4, 152).eligible, true);
});

check("£190.99 → £38.99 online / £152.00 cash", () => {
  assert.equal(assertWholePoundDepositCash(190.99, 38.99, 152).eligible, true);
});

check("whole-pound adjustment happens after a higher configured minimum", () => {
  const quote = assertWholePoundDepositCash(45.1, 20.1, 25, {
    enabled: true,
    percent: 20,
    minimumGbp: 20,
  });
  assert.equal(quote.minimumUsed, 20);
  assert.equal(quote.eligible, true);
});

check("whole-pound adjustment happens after a higher configured percent", () => {
  const quote = assertWholePoundDepositCash(100.4, 25.4, 75, {
    enabled: true,
    percent: 25,
    minimumGbp: 15,
  });
  assert.equal(quote.percentUsed, 25);
  assert.equal(quote.eligible, true);
});

check("odd-pence move never changes the total fare or Full Online amount", () => {
  const quote = calculateDepositCashQuote(45.1, defaultOnSettings);
  assert.equal(quote.totalFare, 45.1);
  assert.equal(fullPayButtonLabel(quote.totalFare), "Pay £45.10 & Confirm Booking");
  assert.equal(todayPayLabel(quote.totalFare), "£45.10 today");
});

check("Worker charges the adjusted deposit and snapshots the same figures", () => {
  const payments = read("workers/addresses/src/index.ts");
  assert.match(payments, /const quote = calculateDepositCashQuote\(amount, settings\.depositCash\)/);
  assert.match(payments, /depositSnapshot = snapshotDepositCash\(quote\)/);
  assert.match(payments, /amount = quote\.depositGbp/);
  assert.match(payments, /onlineAmountPaid: depositSnapshot\.onlineAmountPaid/);
  assert.match(payments, /cashBalanceDue: depositSnapshot\.cashBalanceDue/);
  assert.doesNotMatch(payments, /body\.depositGbp|body\.cashBalanceDue|body\.oddPence/);
  const quote = calculateDepositCashQuote(45.1, defaultOnSettings);
  const snapshot = snapshotDepositCash(quote);
  assert.equal(snapshot.totalFare, 45.1);
  assert.equal(snapshot.onlineAmountPaid, 15.1);
  assert.equal(snapshot.cashBalanceDue, 30);
  assert.equal(snapshot.depositMinimumUsed, 15);
});

check("confirmation page and email display stored amounts, not a fresh calculator", () => {
  assert.doesNotMatch(read("src/app/booking-confirmed/BookingConfirmedClient.tsx"), /calculateDepositCashQuote/);
  assert.doesNotMatch(read("shared/booking-notifications.ts"), /calculateDepositCashQuote/);
  assert.doesNotMatch(read("src/components/OwnerPaidBookingsPanel.tsx"), /calculateDepositCashQuote/);
  assert.doesNotMatch(read("src/app/driver/DriverPageClient.tsx"), /calculateDepositCashQuote/);
});

console.log("\n=== Customer UX polish (display only) ===");
const caseASettings = { enabled: true, percent: 20, minimumGbp: 15 };
const caseA = calculateDepositCashQuote(50.1, caseASettings);
const caseB = calculateDepositCashQuote(100, caseASettings);

check("CASE A — £50.10 shows £15.10 deposit / £35.00 cash with two decimals", () => {
  assert.equal(caseA.eligible, true);
  assert.equal(caseA.depositGbp, 15.1);
  assert.equal(caseA.cashDueGbp, 35);
  assert.equal(todayPayLabel(caseA.depositGbp), "£15.10 today");
  assert.equal(cashOnTheDayCardLabel(caseA.cashDueGbp), "£35.00 CASH on the day");
  assert.equal(paymentSummaryTotalFareLabel(caseA.totalFare), "Total fare: £50.10");
  assert.equal(paymentSummaryPayTodayDepositLabel(caseA.depositGbp), "Pay today (deposit): £15.10");
  assert.equal(paymentSummaryCashDueLabel(caseA.cashDueGbp), "Cash due on the day: £35.00");
  assert.equal(depositPayButtonLabel(caseA.depositGbp), "Pay £15.10 Deposit & Confirm Booking");
  assert.equal(
    cashSelectedRemainingSentence(caseA.cashDueGbp),
    "The remaining £35.00 must be paid in cash to your driver on the day.",
  );
  assert.equal(
    cashAgreementLabel(caseA.cashDueGbp),
    "I understand that the remaining £35.00 must be paid in cash to my driver on the day and cannot be paid by card.",
  );
  assert.equal(DEPOSIT_CASH_SELECTED_HEADING, "Deposit + Cash selected");
  assert.equal(formatGbpAmount(15), "£15");
  assert.equal(formatDepositCashGbp(15.1), "£15.10");
});

check("CASE B — £100.00 shows £20.00 deposit / £80.00 cash", () => {
  assert.equal(caseB.depositGbp, 20);
  assert.equal(caseB.cashDueGbp, 80);
  assert.equal(todayPayLabel(caseB.depositGbp), "£20.00 today");
  assert.equal(cashOnTheDayCardLabel(caseB.cashDueGbp), "£80.00 CASH on the day");
  assert.equal(paymentSummaryTotalFareLabel(caseB.totalFare), "Total fare: £100.00");
  assert.equal(paymentSummaryPayTodayDepositLabel(caseB.depositGbp), "Pay today (deposit): £20.00");
  assert.equal(paymentSummaryCashDueLabel(caseB.cashDueGbp), "Cash due on the day: £80.00");
  assert.equal(depositPayButtonLabel(caseB.depositGbp), "Pay £20.00 Deposit & Confirm Booking");
  assert.equal(fullPayButtonLabel(caseB.totalFare), "Pay £100.00 & Confirm Booking");
  assert.match(cashSelectedBody(caseB.cashDueGbp), /£80\.00 must be paid in cash/);
  assert.match(cashSelectedBody(caseB.cashDueGbp), new RegExp(CASH_SELECTED_CARD_UNAVAILABLE));
  assert.equal(
    cashDueOnTheDayCopy(caseB.cashDueGbp),
    "Please have £80.00 in cash available for your driver on the day.",
  );
});

check("CASE C — Full Online £50.10 shows today + nothing on the day", () => {
  assert.equal(todayPayLabel(caseA.totalFare), "£50.10 today");
  assert.equal(nothingToPayOnTheDayLabel(), "Nothing to pay on the day");
  assert.equal(fullPayButtonLabel(caseA.totalFare), "Pay £50.10 & Confirm Booking");
  const card = read("src/components/QuoteCard.tsx");
  assert.match(card, /\{selectedDepositCash \? \(/);
  assert.match(card, /FULL_ONLINE_SUPPORTING/);
});

check("CASE D — cash acknowledgement stays required and unchecked", () => {
  const card = read("src/components/QuoteCard.tsx");
  assert.match(card, /useState\(false\)/);
  assert.match(card, /!cashAgreementAccepted/);
  assert.equal(
    CASH_AGREEMENT_REQUIRED_MESSAGE,
    "Please confirm you understand the remaining balance must be paid in cash and cannot be paid by card.",
  );
});

check("CASE E — Full Online does not require the cash acknowledgement", () => {
  const card = read("src/components/QuoteCard.tsx");
  assert.match(
    card,
    /showDepositCashChoice &&\s*\n\s+paymentMethod === PAYMENT_METHOD_DEPOSIT_CASH &&\s*\n\s+!cashAgreementAccepted/,
  );
  assert.match(card, /setPaymentMethod\(PAYMENT_METHOD_FULL_ONLINE\);\s*\n\s+setCashAgreementAccepted\(false\)/);
});

check("CASE F — Deposit + Cash disabled keeps the existing full-online checkout", () => {
  const offer = publicDepositCashOffer(50.1, defaultDepositCashSettings());
  assert.equal(offer.enabled, false);
  assert.equal(offer.eligible, false);
  const card = read("src/components/QuoteCard.tsx");
  assert.match(
    card,
    /: `Confirm booking & pay securely — \$\{amountLabel \?\? formatQuote\(liveQuote\.amount\)\}`/,
  );
});

check("confirmation page and email use the cash-only payment details", () => {
  assert.equal(bookingTotalLabel(50.1), "Booking total: £50.10");
  assert.equal(depositPaidOnlineLabel(15), "Deposit paid online: £15.00");
  assert.equal(
    REMAINING_BALANCE_CASH_ONLY,
    "The remaining balance must be paid in cash. Card payment is not available for the remaining balance.",
  );
  const email = buildCustomerConfirmationEmail({
    customerName: "Alex Example",
    customerEmail: "alex@example.com",
    mobileNumber: "07123456789",
    tripLabel: "Ballyclare → Belfast International (BFS)",
    pickupLabel: "249 Rashee Road, Ballyclare",
    dropoffLabel: "Belfast International Airport (BFS)",
    returnJourney: false,
    tripDate: "2026-09-01",
    tripTime: "10:00",
    returnDate: "",
    returnTime: "",
    flightNumber: "EZY123",
    passengers: 2,
    suitcases: 2,
    vehicle: "Estate Car (1–4 passengers)",
    isAirportTrip: true,
    airportCode: "BFS",
    amountPaid: "£15.00",
    paymentReference: "T3TESTREF",
    checkoutReference: "matni-test-ref",
    paymentMethod: PAYMENT_METHOD_DEPOSIT_CASH,
    totalFare: 50.1,
    onlineAmountPaid: 15,
    cashBalanceDue: 35.1,
  });
  assert.match(email.text, /Booking total: £50\.10/);
  assert.match(email.text, /Deposit paid online: £15\.00/);
  assert.match(email.text, /Cash due on the day: £35\.10/);
  assert.match(email.text, /Please have £35\.10 in cash available for your driver on the day/);
  assert.match(email.text, /Card payment is not available for the remaining balance/);
  const newBookingEmail = buildCustomerConfirmationEmail({
    customerName: "Alex Example",
    customerEmail: "alex@example.com",
    mobileNumber: "07123456789",
    tripLabel: "Ballyclare → Belfast International (BFS)",
    pickupLabel: "249 Rashee Road, Ballyclare",
    dropoffLabel: "Belfast International Airport (BFS)",
    returnJourney: false,
    tripDate: "2026-09-01",
    tripTime: "10:00",
    returnDate: "",
    returnTime: "",
    flightNumber: "EZY123",
    passengers: 2,
    suitcases: 2,
    vehicle: "Estate Car (1–4 passengers)",
    isAirportTrip: true,
    airportCode: "BFS",
    amountPaid: "£15.10",
    paymentReference: "T3TESTREF",
    checkoutReference: "matni-test-ref",
    paymentMethod: PAYMENT_METHOD_DEPOSIT_CASH,
    totalFare: 45.1,
    onlineAmountPaid: 15.1,
    cashBalanceDue: 30,
  });
  assert.match(newBookingEmail.text, /Booking total: £45\.10/);
  assert.match(newBookingEmail.text, /Deposit paid online: £15\.10/);
  assert.match(newBookingEmail.text, /Cash due on the day: £30\.00/);
  assert.doesNotMatch(email.text, /Paid in full/);
  assert.doesNotMatch(email.html, /Paid in full/);
  assert.match(email.html, /Deposit paid online/);
  const fullOnline = buildCustomerConfirmationEmail({
    customerName: "Alex Example",
    customerEmail: "alex@example.com",
    mobileNumber: "07123456789",
    tripLabel: "Ballyclare → Belfast International (BFS)",
    pickupLabel: "249 Rashee Road, Ballyclare",
    dropoffLabel: "Belfast International Airport (BFS)",
    returnJourney: false,
    tripDate: "2026-09-01",
    tripTime: "10:00",
    returnDate: "",
    returnTime: "",
    flightNumber: "EZY123",
    passengers: 2,
    suitcases: 2,
    vehicle: "Estate Car (1–4 passengers)",
    isAirportTrip: true,
    airportCode: "BFS",
    amountPaid: "£50.10",
    paymentReference: "T3TESTREF",
    checkoutReference: "matni-test-ref",
  });
  assert.match(fullOnline.html, /Paid in full/);
  assert.doesNotMatch(fullOnline.text, /Cash due on the day/);
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
