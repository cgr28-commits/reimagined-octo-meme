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

check("QuoteCard shows WhatsApp help only for unresolved booking errors", () => {
  const card = read("src/components/QuoteCard.tsx");
  assert.match(card, /showBookingErrorWhatsAppHelp/);
  assert.match(card, /renderBookingErrorWhatsAppHelp/);
  assert.match(card, /Need help completing your booking\?/);
  assert.match(card, /Get Booking Help on WhatsApp/);
  assert.match(card, /Message us on WhatsApp and we/);
  assert.match(card, /bookingHelpWhatsAppUrl/);
  assert.match(card, /target="_blank"/);
  assert.match(card, /rel="noopener noreferrer"/);
  assert.match(card, /trackWhatsAppBookingHelpClick/);
  assert.match(card, /data-booking-error-whatsapp-help/);
  // Must gate on errors — not always visible.
  assert.match(card, /paymentError[\s\S]*showBookingErrorWhatsAppHelp|showBookingErrorWhatsAppHelp[\s\S]*paymentError/);
  assert.match(card, /if \(!showBookingErrorWhatsAppHelp\)/);
});

check("Start New Quote is a clear outlined control with confirm copy", () => {
  const card = read("src/components/QuoteCard.tsx");
  assert.match(card, /Clear Details &amp; Start a New Quote|Clear Details & Start a New Quote/);
  assert.match(card, /Need a quote for a different journey\?/);
  assert.match(
    card,
    /This will clear your current journey details and start a new quote\. Continue\?/,
  );
  assert.match(card, /Keep Current Quote/);
  assert.match(card, />\s*Start New Quote\s*</);
  assert.match(card, /performStartNewQuote/);
  assert.match(card, /trackStartNewQuoteClick/);
  assert.match(card, /data-start-new-quote-controls/);
  // Still uses the existing reset path — no parallel clear logic.
  assert.match(card, /clearAbandonedQuotePersistence/);
  assert.match(card, /matni-payment-confirmed|payment records|paid booking/i);
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
