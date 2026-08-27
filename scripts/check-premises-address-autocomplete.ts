/**
 * Premises-level address autocomplete helpers.
 */
import assert from "node:assert/strict";
import {
  extractLeadingStreetNumber,
  hasLeadingStreetNumber,
  isNumberedAddressQuery,
  isStreetOnlyQuery,
  withStreetNumber,
} from "../shared/google-places";
import { shouldUseGetAddress } from "../shared/getaddress";

assert.equal(extractLeadingStreetNumber("7 Glen Manor Road"), "7");
assert.equal(extractLeadingStreetNumber("7a Glen Manor Road, Bangor"), "7a");
assert.equal(extractLeadingStreetNumber("Glen Manor Road"), null);
assert.equal(isNumberedAddressQuery("7 Glen Manor Road"), true);
assert.equal(isStreetOnlyQuery("7 Glen Manor Road"), false);
assert.equal(isStreetOnlyQuery("Glen Manor Road"), true);
assert.equal(hasLeadingStreetNumber("7 Glen Manor Road, Bangor BT20"), true);
assert.equal(hasLeadingStreetNumber("1-11 May St, Belfast BT1 4NA, UK"), true);
assert.equal(hasLeadingStreetNumber("1–11 May St, Belfast BT1 4NA, UK"), true);
assert.equal(hasLeadingStreetNumber("May St, Belfast"), false);
assert.equal(withStreetNumber("7", "Glen Manor Road, Bangor"), "7 Glen Manor Road, Bangor");
assert.equal(withStreetNumber("7", "7 Glen Manor Road, Bangor"), "7 Glen Manor Road, Bangor");
assert.equal(
  withStreetNumber("11", "1-11 May St, Belfast BT1 4NA, UK"),
  "1-11 May St, Belfast BT1 4NA, UK",
  "must not prepend typed number onto an existing building range",
);

assert.equal(shouldUseGetAddress("BFS", "7 Glen Manor Road"), true);
assert.equal(shouldUseGetAddress("A2A", "7 Glen Manor Road"), true);
assert.equal(shouldUseGetAddress("DUB", "7 Glen Manor Road"), false);
assert.equal(shouldUseGetAddress("LDY", "7 Glen Manor Road"), true);
assert.equal(shouldUseGetAddress("LDY", "Donegall Square"), false);

console.log("check-premises-address-autocomplete: ok");
