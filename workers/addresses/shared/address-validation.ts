import {
  isGreaterBelfastServiceAddress,
  isLdyDropOffAddress,
} from "./ldy-service-area";

const BT_POSTCODE_PATTERN = /\bBT\d{1,2}\s?\d[A-Z]{2}\b/i;
const NI_COUNTY_PATTERN =
  /\b(antrim|armagh|down|fermanagh|londonderry|derry|tyrone|belfast)\b/i;
const EIRCODE_PATTERN = /\b[A-Z]\d{2}\s?[A-Z0-9]{4}\b/i;

export function extractPostcode(value: string): string | null {
  const match = value.match(BT_POSTCODE_PATTERN);
  return match ? match[0].replace(/\s+/g, " ").toUpperCase() : null;
}

export function isNorthernIrelandPostcode(postcode?: string | null): boolean {
  if (!postcode) return false;
  return /^BT\d/i.test(postcode.trim());
}

export function isNorthernIrelandText(value: string): boolean {
  const normalised = value.toLowerCase();

  if (extractPostcode(value)) {
    return true;
  }

  if (normalised.includes("northern ireland")) {
    return true;
  }

  return NI_COUNTY_PATTERN.test(normalised);
}

export function isNorthernIrelandAddressParts(parts: {
  postcode?: string;
  county?: string;
  state?: string;
  city?: string;
  town?: string;
  displayName?: string;
}): boolean {
  if (isNorthernIrelandPostcode(parts.postcode)) {
    return true;
  }

  if (parts.state?.toLowerCase() === "northern ireland") {
    return true;
  }

  const combined = [parts.county, parts.city, parts.town, parts.displayName]
    .filter(Boolean)
    .join(" ");

  return isNorthernIrelandText(combined);
}

export function isRepublicOfIrelandPostcode(postcode?: string | null): boolean {
  if (!postcode || isNorthernIrelandPostcode(postcode)) return false;
  return EIRCODE_PATTERN.test(postcode.trim());
}

export function isRepublicOfIrelandText(value: string): boolean {
  const normalised = value.toLowerCase();

  if (normalised.includes("northern ireland")) {
    return false;
  }

  if (normalised.includes("ireland") || normalised.includes("dublin")) {
    return true;
  }

  return EIRCODE_PATTERN.test(value);
}

export function isRepublicOfIrelandAddressParts(parts: {
  postcode?: string;
  county?: string;
  state?: string;
  city?: string;
  town?: string;
  country?: string;
  displayName?: string;
}): boolean {
  if (parts.state?.toLowerCase() === "northern ireland") {
    return false;
  }

  if (isRepublicOfIrelandPostcode(parts.postcode)) {
    return true;
  }

  if (parts.country?.toLowerCase() === "ireland") {
    return true;
  }

  const combined = [parts.county, parts.city, parts.town, parts.displayName]
    .filter(Boolean)
    .join(" ");

  return isRepublicOfIrelandText(combined);
}

export function isAddressAllowedForAirport(
  airportCode: string,
  parts: {
    postcode?: string;
    county?: string;
    state?: string;
    city?: string;
    town?: string;
    country?: string;
    displayName?: string;
  },
): boolean {
  const code = normaliseAirportCode(airportCode);

  if (code === "LDY") {
    const combined = [parts.postcode, parts.county, parts.city, parts.town, parts.displayName]
      .filter(Boolean)
      .join(", ");
    return isLdyDropOffAddress(combined);
  }

  if (isNorthernIrelandAddressParts(parts)) {
    return true;
  }

  if (code === "DUB" && isRepublicOfIrelandAddressParts(parts)) {
    return true;
  }

  return false;
}

export function normaliseAirportCode(value: string): string {
  return value.trim().toUpperCase();
}

const NON_NI_UK_POSTCODE_PATTERN = /\b(?!BT)([A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2})\b/i;

const NON_NI_UK_REGION_PATTERN =
  /\b(england|scotland|wales|london|manchester|liverpool|birmingham|leeds|sheffield|bristol|glasgow|edinburgh|cardiff|essex|kent|surrey|yorkshire|lancashire|cheshire|devon|cornwall|somerset|norfolk|suffolk|hampshire|west midlands|east sussex|west sussex|newcastle upon tyne)\b/i;

/** Filter Google autocomplete labels before place details are loaded. */
export function isAllowedAutocompleteLabel(label: string, airportCode: string): boolean {
  const text = label.trim();
  if (!text) {
    return false;
  }

  const code = normaliseAirportCode(airportCode);

  if (code === "LDY") {
    return isGreaterBelfastServiceAddress(text);
  }

  if (NON_NI_UK_REGION_PATTERN.test(text)) {
    return false;
  }

  const postcodeMatch = text.match(NON_NI_UK_POSTCODE_PATTERN);
  if (postcodeMatch) {
    const postcode = postcodeMatch[1] ?? postcodeMatch[0];
    if (code === "DUB" && isRepublicOfIrelandPostcode(postcode)) {
      return true;
    }
    return false;
  }

  if (isNorthernIrelandText(text)) {
    return true;
  }

  if (code === "DUB" && isRepublicOfIrelandText(text)) {
    return true;
  }

  // With locationRestriction, allow NI place names that omit county/postcode (e.g. Lisburn).
  return code !== "DUB";
}

export function hasLeadingStreetNumber(text: string): boolean {
  return /^\d+[a-zA-Z]?\s/.test(text.trim());
}

export function sortSuggestionsByStreetNumber<T extends { mainText: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aHasNumber = hasLeadingStreetNumber(a.mainText);
    const bHasNumber = hasLeadingStreetNumber(b.mainText);
    if (aHasNumber && !bHasNumber) {
      return -1;
    }
    if (!aHasNumber && bHasNumber) {
      return 1;
    }
    return 0;
  });
}

export function isNorthernIrelandCoordinates(lat: number, lon: number): boolean {
  return lat >= 54.0 && lat <= 55.5 && lon >= -8.2 && lon <= -5.4;
}

export function isAllowedCoordinates(airportCode: string, lat: number, lon: number): boolean {
  if (isNorthernIrelandCoordinates(lat, lon)) {
    return true;
  }

  if (airportCode !== "DUB") {
    return false;
  }

  return lat >= 51.4 && lat <= 55.5 && lon >= -10.8 && lon <= -5.4;
}
