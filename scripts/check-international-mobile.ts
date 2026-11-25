/** International customers: mobile validation + WhatsApp normalisation. Run: npx tsx scripts/check-international-mobile.ts */
import assert from "node:assert/strict";
import { isValidMobileNumber } from "../src/lib/booking-message";
import { getPaymentBookingBlockers } from "../shared/paid-booking-gate";
import { toWhatsAppDigits } from "../shared/arrival-whatsapp";

const cases: Array<[string, string, string]> = [
  ["UK +44", "+44 7700 900123", "447700900123"],
  ["UK local", "07700 900123", "447700900123"],
  ["UK +44 (0)", "+44 (0)7700 900123", "447700900123"],
  ["UK 0044", "0044 7700 900123", "447700900123"],
  ["IE +353", "+353 87 123 4567", "353871234567"],
  ["IE local", "087 123 4567", "353871234567"],
  ["IE +353 (0)", "+353 (0)87 123 4567", "353871234567"],
  ["US +1", "+1 (212) 555-0147", "12125550147"],
  ["US 001", "001 212 555 0147", "12125550147"],
  ["US bare 10", "212 555 0147", "2125550147"],
  ["CA +1", "+1 416 555 0199", "14165550199"],
  ["AU +61", "+61 412 345 678", "61412345678"],
  ["DE +49", "+49 151 23456789", "4915123456789"],
  ["FR +33", "+33 6 12 34 56 78", "33612345678"],
  ["ES +34", "+34 612 345 678", "34612345678"],
  ["NL +31", "+31 6 12345678", "31612345678"],
];
for (const [label, input, wa] of cases) {
  assert.equal(isValidMobileNumber(input), true, `${label} should validate: ${input}`);
  assert.equal(toWhatsAppDigits(input), wa, `${label} WhatsApp digits`);
  console.log(`OK  ${label.padEnd(12)} ${input} -> wa.me/${wa}`);
}
for (const bad of ["12345", "abc", "+44 7700", ""]) assert.equal(isValidMobileNumber(bad), false, bad);
console.log("OK  junk numbers rejected");

// Payment gate: an international customer with a non-UK number passes with no UK-only phone/address rule.
const gate = getPaymentBookingBlockers({
  customerName: "Jane Doe", customerEmail: "jane@example.com", mobileNumber: "+1 212 555 0147",
  tripLabel: "Belfast Cruise Terminal to Belfast International", pickupLabel: "Belfast Cruise Terminal",
  dropoffLabel: "Belfast International Airport", tripDate: "2026-12-20", tripTime: "10:00", vehicle: "Standard",
} as never);
console.log("INFO gate blockers for US customer:", JSON.stringify(gate));
assert.ok(!gate.some((b) => /mobile|phone|postcode|address/i.test(b)), "no phone/postcode blocker");
console.log("OK  payment gate has no UK-specific phone/address restriction");
