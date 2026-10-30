/**
 * WhatsApp quotes (owner, 30 Oct 2026):
 * - Airport pickups show the 60-minute waiting time; other pickups show 10 minutes.
 *   Returns with one of each show both, labelled.
 * - Pickups less than 24 hours away get a 2-hour booking link; otherwise 24 hours.
 *
 * Run: tsx scripts/check-whatsapp-waiting-and-short-notice.ts
 */
import assert from "node:assert/strict";
import {
  buildWhatsAppBookingBenefits,
  buildWhatsAppDiscountOfferReply,
  buildWhatsAppPriceValueReply,
  buildWhatsAppQuoteReply,
  whatsAppDraftToQuoteBody,
  whatsAppPickupWaiting,
  whatsAppQuoteLinkHours,
} from "../shared/whatsapp-quote-bot";
import { buildWhatsAppFollowUpDiscountText } from "../workers/addresses/src/whatsapp-follow-up";
import { resolveQuickQuoteTtlSeconds } from "../shared/quick-quote";

const fromAirport = { airportCode: "BFS" as const, fromAirport: true, returnJourney: false };
const toAirport = { airportCode: "BFS" as const, fromAirport: false, returnJourney: false };
const returnTrip = { airportCode: "BHD" as const, fromAirport: false, returnJourney: true };
const addressOnly = { airportCode: null, returnJourney: false };

console.log("=== Waiting time matches the pickup ===");
assert.equal(whatsAppPickupWaiting(fromAirport), "airport");
assert.equal(whatsAppPickupWaiting(toAirport), "address");
assert.equal(whatsAppPickupWaiting(addressOnly), "address");
assert.equal(whatsAppPickupWaiting(returnTrip), "both");

const airportBenefits = buildWhatsAppBookingBenefits(fromAirport);
assert.match(airportBenefits, /60 minutes/);
assert.doesNotMatch(airportBenefits, /10 minutes/, "airport pickup: no 10-minute line");

for (const journey of [toAirport, addressOnly]) {
  const benefits = buildWhatsAppBookingBenefits(journey);
  assert.match(benefits, /10 minutes' complimentary waiting/);
  assert.doesNotMatch(benefits, /60 minutes|monitor your flight/, "non-airport pickup: no 60-minute line");
}
const both = buildWhatsAppBookingBenefits(returnTrip);
assert.match(both, /Airport pickup: .*60 minutes/);
assert.match(both, /Address pickup: 10 minutes/);

for (const text of [
  buildWhatsAppQuoteReply({ amountLabel: "£40", bookingUrl: "https://x", journey: toAirport }),
  buildWhatsAppDiscountOfferReply({ amountLabel: "£38", bookingUrl: "https://x", journey: toAirport }),
  buildWhatsAppPriceValueReply(toAirport),
  buildWhatsAppFollowUpDiscountText(
    { phone: "1", quoteId: "q", amountLabel: "£40", bookingUrl: "https://x", dueAt: "", lastCustomerAt: "" },
    { amountLabel: "£38", bookingUrl: "https://x", journey: toAirport },
  ),
]) {
  assert.doesNotMatch(text, /60 minutes/, `drop-off at the airport never shows 60 minutes:\n${text}`);
  assert.match(text, /10 minutes/);
}
for (const text of [
  buildWhatsAppQuoteReply({ amountLabel: "£40", bookingUrl: "https://x", journey: fromAirport }),
  buildWhatsAppDiscountOfferReply({ amountLabel: "£38", bookingUrl: "https://x", journey: fromAirport }),
  buildWhatsAppPriceValueReply(fromAirport),
  buildWhatsAppFollowUpDiscountText(
    { phone: "1", quoteId: "q", amountLabel: "£40", bookingUrl: "https://x", dueAt: "", lastCustomerAt: "" },
    { amountLabel: "£38", bookingUrl: "https://x", journey: fromAirport },
  ),
]) {
  assert.match(text, /60 minutes/);
  assert.doesNotMatch(text, /10 minutes/, `airport pickup never shows 10 minutes:\n${text}`);
}

console.log("=== 2-hour link for pickups under 24 hours away ===");
const now = new Date("2026-10-30T18:00:00Z"); // 18:00 London (GMT)
const soon = { ...toAirport, outboundDate: "2026-10-31", outboundTime: "06:00" }; // 12h away
const later = { ...toAirport, outboundDate: "2026-11-02", outboundTime: "06:00" };
const edge = { ...toAirport, outboundDate: "2026-10-31", outboundTime: "18:30" }; // 24.5h away
assert.equal(whatsAppQuoteLinkHours(soon, now), 2);
assert.equal(whatsAppQuoteLinkHours(later, now), 24);
assert.equal(whatsAppQuoteLinkHours(edge, now), 24);
assert.equal(whatsAppQuoteLinkHours({ ...toAirport }, now), 24, "no date yet: default 24");

const soonBody = whatsAppDraftToQuoteBody(soon, now);
assert.equal(resolveQuickQuoteTtlSeconds(soonBody), 2 * 60 * 60, "short-notice link expires after 2 hours");
const laterBody = whatsAppDraftToQuoteBody(later, now);
assert.equal(resolveQuickQuoteTtlSeconds(laterBody), 24 * 60 * 60);

const soonReply = buildWhatsAppQuoteReply({ amountLabel: "£40", bookingUrl: "https://x", journey: soon, linkHours: 2 });
assert.match(soonReply, /link valid for 2 hours/);
assert.match(soonReply, /less than 24 hours away/);
const laterReply = buildWhatsAppQuoteReply({ amountLabel: "£40", bookingUrl: "https://x", journey: later, linkHours: 24 });
assert.match(laterReply, /link valid for 24 hours/);
assert.doesNotMatch(laterReply, /less than 24 hours away/);
assert.match(
  buildWhatsAppQuoteReply({ amountLabel: "£40", bookingUrl: "https://x", journey: soon, linkHours: 2, requestOnly: true }),
  /request only[\s\S]*link valid for 2 hours/,
);
assert.match(
  buildWhatsAppDiscountOfferReply({ amountLabel: "£38", bookingUrl: "https://x", journey: soon, linkHours: 2 }),
  /link valid for 2 hours/,
);

console.log("PASS");
