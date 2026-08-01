import { extractPostcode } from "./address-validation";

/** BT districts served for LDY (Derry Airport) → greater Belfast transfers. */
const GREATER_BELFAST_POSTCODE_DISTRICTS = new Set([
  "BT1",
  "BT2",
  "BT3",
  "BT4",
  "BT5",
  "BT6",
  "BT7",
  "BT8",
  "BT9",
  "BT10",
  "BT11",
  "BT12",
  "BT13",
  "BT14",
  "BT15",
  "BT16",
  "BT17",
  "BT18",
  "BT19",
  "BT20",
  "BT22",
  "BT23",
  "BT26",
  "BT27",
  "BT28",
  "BT29",
  "BT36",
  "BT37",
  "BT38",
  "BT39",
  "BT40",
  "BT41",
  "BT42",
  "BT43",
]);

const NORTH_WEST_NI_PATTERN =
  /\b(derry|londonderry|coleraine|omagh|eniskillen|cookstown|strabane|magherafelt|limavady|portrush|portstewart|castlerock|ballycastle|derry~londonderry)\b/i;

const GREATER_BELFAST_PATTERN =
  /\b(belfast|lisburn|newtownabbey|bangor|holywood|carrickfergus|newtownards|comber|dundonald|hillsborough|larne|ballyclare|antrim|ballymena|finaghy|malone|titanic quarter)\b/i;

function postcodeDistrict(postcode: string): string | null {
  const normalised = postcode.replace(/\s+/g, "").toUpperCase();
  const match = normalised.match(/^(BT\d{1,2})/);
  return match?.[1] ?? null;
}

export function isGreaterBelfastServiceAddress(address: string): boolean {
  const text = address.trim();
  if (!text) {
    return false;
  }

  if (NORTH_WEST_NI_PATTERN.test(text)) {
    return false;
  }

  const postcode = extractPostcode(text);
  if (postcode) {
    const district = postcodeDistrict(postcode);
    if (district && GREATER_BELFAST_POSTCODE_DISTRICTS.has(district)) {
      return true;
    }
    if (district) {
      return false;
    }
  }

  return GREATER_BELFAST_PATTERN.test(text);
}

/** Greater Belfast pickup/drop-off for LDY transfers (both directions). */
export function isLdyServiceAreaAddress(address: string): boolean {
  return isGreaterBelfastServiceAddress(address);
}

/** @deprecated Use isLdyServiceAreaAddress — kept for existing imports. */
export function isLdyDropOffAddress(address: string): boolean {
  return isLdyServiceAreaAddress(address);
}

export function getLdyLocationRestriction() {
  return {
    rectangle: {
      low: { latitude: 54.45, longitude: -6.35 },
      high: { latitude: 54.78, longitude: -5.55 },
    },
  };
}
