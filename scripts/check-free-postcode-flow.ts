/**
 * Smoke-test free postcode + house-number helpers (no paid PAF provider).
 * Run: npx tsx scripts/check-free-postcode-flow.ts
 */
import {
  extractPremisePrefixFromPostcodeQuery,
  isPureFullNorthernIrelandPostcodeQuery,
} from "../shared/address-validation";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(isPureFullNorthernIrelandPostcodeQuery("BT36 7FU"), "BT36 7FU should be pure");
assert(isPureFullNorthernIrelandPostcodeQuery("bt36 7fu"), "case-insensitive pure");
assert(!isPureFullNorthernIrelandPostcodeQuery("7 BT36 7FU"), "number+postcode is not pure");
assert(extractPremisePrefixFromPostcodeQuery("7 BT36 7FU") === "7", "prefix 7");
assert(extractPremisePrefixFromPostcodeQuery("Flat 2, BT20 3BB") === "Flat 2", "prefix Flat 2");
assert(extractPremisePrefixFromPostcodeQuery("BT36 7FU") === null, "pure has no prefix");

console.log("Free postcode + house-number helper checks passed.");
console.log("Live UX: enter BT36 7FU → type house number → Google Places resolves the property.");
