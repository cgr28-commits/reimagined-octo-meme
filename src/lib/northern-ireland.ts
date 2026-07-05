const BT_POSTCODE_PATTERN = /\bBT\d{1,2}\s?\d[A-Z]{2}\b/i;

const NI_COUNTY_PATTERN =
  /\b(antrim|armagh|down|fermanagh|londonderry|derry|tyrone|belfast)\b/i;

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

const EIRCODE_PATTERN = /\b[A-Z]\d{2}\s?[A-Z0-9]{4}\b/i;

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
  if (isNorthernIrelandAddressParts(parts)) {
    return true;
  }

  if (airportCode === "DUB" && isRepublicOfIrelandAddressParts(parts)) {
    return true;
  }

  return false;
}

function isNorthernIrelandCoordinates(lat: number, lon: number): boolean {
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

export const GETADDRESS_NI_FILTER = "postcode:BT";
