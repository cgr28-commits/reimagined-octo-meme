/**
 * Quote error WhatsApp help + clearer Start New Quote controls.
 * Run: npx tsx scripts/check-quote-error-help-start-new.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { SITE } from "../src/lib/data";
import {
  BOOKING_HELP_WHATSAPP_MESSAGE,
  bookingHelpWhatsAppUrl,
} from "../src/lib/booking-help-whatsapp";
import { QUOTE_FUNNEL_EVENTS } from "../src/lib/quote-funnel-analytics";

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

check("WhatsApp help URL uses business number and fixed support message (no PII)", () => {
  assert.equal(
    BOOKING_HELP_WHATSAPP_MESSAGE,
    "Hi, I'm having trouble completing my online booking on the My Airport Taxi NI website. Can you help?",
  );
  const href = bookingHelpWhatsAppUrl();
  assert.match(href, new RegExp(`^https://wa\\.me/${SITE.whatsapp}\\?text=`));
  assert.match(href, /text=/);
  assert.doesNotMatch(BOOKING_HELP_WHATSAPP_MESSAGE, /@|BT\d|£|\d{10,}/);
  assert.doesNotMatch(href, /customerEmail|pickupAddress|mobileNumber/i);
});

check("QuoteCard shows WhatsApp help only for unresolved booking errors (single placement)", () => {
  const card = read("src/components/QuoteCard.tsx");
  const help = read("src/components/QuoteBookingHelpControls.tsx");
  assert.match(card, /showBookingErrorWhatsAppHelp/);
  assert.match(card, /errorHelpPlacement/);
  assert.match(card, /renderBookingErrorHelp/);
  assert.match(card, /BookingErrorHelpCluster/);
  assert.match(help, /Need help completing your booking\?/);
  assert.match(help, /Get Booking Help on WhatsApp/);
  assert.match(help, /Message us on WhatsApp and we/);
  assert.match(help, /bookingHelpWhatsAppUrl/);
  assert.match(help, /target="_blank"/);
  assert.match(help, /rel="noopener noreferrer"/);
  assert.match(help, /data-booking-error-whatsapp-help/);
  assert.match(card, /trackWhatsAppBookingHelpClick/);
  // Must gate on errors — not always visible.
  assert.match(card, /paymentError[\s\S]*showBookingErrorWhatsAppHelp|showBookingErrorWhatsAppHelp[\s\S]*paymentError/);
  assert.match(card, /if \(!showBookingErrorWhatsAppHelp\)/);
  // Single-placement API — call sites pass an explicit slot, never a bare invoke.
  assert.doesNotMatch(card, /renderBookingErrorHelp\(\s*\)/);
  assert.doesNotMatch(card, /renderStartNewQuoteControls\(\s*\)/);
  assert.doesNotMatch(card, /renderBookingErrorWhatsAppHelp/);
});

check("Start New Quote is a clear outlined control with confirm copy + unique dialog ids", () => {
  const card = read("src/components/QuoteCard.tsx");
  const help = read("src/components/QuoteBookingHelpControls.tsx");
  assert.match(help, /Clear Details &amp; Start a New Quote|Clear Details & Start a New Quote/);
  assert.match(help, /Need a quote for a different journey\?/);
  assert.match(
    help,
    /This will clear your current journey details and start a new quote\. Continue\?/,
  );
  assert.match(help, /Keep Current Quote/);
  assert.match(help, />\s*Start New Quote\s*</);
  assert.match(help, /useId/);
  assert.match(help, /data-start-new-quote-controls/);
  assert.match(card, /performStartNewQuote/);
  assert.match(card, /trackStartNewQuoteClick/);
  assert.match(card, /startNewQuotePlacement/);
  // Error help hides the normal results Start New Quote.
  assert.match(card, /if \(errorHelpPlacement\)[\s\S]*return null/);
  assert.match(card, /renderStartNewQuoteControls\("results"\)/);
  // Still uses the existing reset path — no parallel clear logic.
  assert.match(card, /clearAbandonedQuotePersistence/);
  assert.match(card, /matni-payment-confirmed|payment records|paid booking/i);
  // Hard-coded dialog ids must not be reintroduced (duplicate DOM id risk).
  assert.doesNotMatch(help, /id="start-new-quote-title"/);
  assert.doesNotMatch(help, /id="start-new-quote-desc"/);
  assert.doesNotMatch(card, /id="start-new-quote-title"/);
  assert.doesNotMatch(card, /id="start-new-quote-desc"/);
});

check("Analytics event names match product requirements", () => {
  assert.equal(QUOTE_FUNNEL_EVENTS.WHATSAPP_BOOKING_HELP_CLICK, "whatsapp_booking_help_click");
  assert.equal(QUOTE_FUNNEL_EVENTS.START_NEW_QUOTE_CLICK, "start_new_quote_click");
  const analytics = read("src/lib/quote-funnel-analytics.ts");
  assert.match(analytics, /trackWhatsAppBookingHelpClick/);
  assert.match(analytics, /trackStartNewQuoteClick/);
});

check("Does not change SumUp / fare / route validation wiring", () => {
  const card = read("src/components/QuoteCard.tsx");
  assert.match(card, /acceptedFinalAmountGbp/);
  assert.match(card, /routeValidationBlockingPayment/);
  assert.match(card, /resolveSumUpChargeAmountGbp|isPaymentFareMismatchError/);
  assert.match(card, /createPaymentCheckout/);
});

console.log("\nAll quote error-help / Start New Quote checks passed.");
