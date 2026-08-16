import {
  isGreaterBelfastServiceAddress,
  isLdyDropOffAddress,
} from "./ldy-service-area";

const BT_POSTCODE_PATTERN = /\bBT\d{1,2}\s?\d[A-Z]{2}\b/i;
const BT_OUTCODE_PATTERN = /\bBT\d{1,2}\b/i;
const BT_POSTCODE_QUERY_PATTERN = /\bBT\d{1,2}(?:\s?\d[A-Z]{2})?\b/i;
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

export function isNorthernIrelandPostcodeOutcode(value: string): boolean {
  return BT_OUTCODE_PATTERN.test(value.trim());
}

export function isNorthernIrelandPostcodeQuery(query: string): boolean {
  return BT_POSTCODE_QUERY_PATTERN.test(query.trim());
}

export function isFullNorthernIrelandPostcode(postcode: string): boolean {
  return /^BT\d{1,2}\s?\d[A-Z]{2}$/i.test(postcode.trim());
}

/** True when the query is essentially only a full NI postcode (no house/street yet). */
export function isPureFullNorthernIrelandPostcodeQuery(query: string): boolean {
  const extracted = extractNorthernIrelandPostcode(query);
  if (!extracted || !isFullNorthernIrelandPostcode(extracted)) {
    return false;
  }

  const leftover = query
    .replace(/\s+/g, "")
    .toUpperCase()
    .replace(extracted.replace(/\s+/g, "").toUpperCase(), "")
    .replace(/[^A-Z0-9]/g, "");

  return leftover.length === 0;
}

/**
 * House number / building name typed alongside a full NI postcode
 * (e.g. "7 BT36 7FU", "Flat 2, BT20 3BB").
 */
export function extractPremisePrefixFromPostcodeQuery(query: string): string | null {
  const extracted = extractNorthernIrelandPostcode(query);
  if (!extracted || !isFullNorthernIrelandPostcode(extracted)) {
    return null;
  }

  const escaped = extracted.replace(/\s+/g, "\\s*");
  const withoutPostcode = query
    .replace(new RegExp(escaped, "i"), " ")
    .replace(/[,\s]+/g, " ")
    .trim();

  if (!withoutPostcode || isPureFullNorthernIrelandPostcodeQuery(query)) {
    return null;
  }

  return withoutPostcode;
}

export function extractNorthernIrelandPostcode(query: string): string | null {
  const match = query.trim().match(/\b(BT\d{1,2}(?:\s?\d[A-Z]{2})?)\b/i);
  if (!match?.[1]) {
    return null;
  }

  const raw = match[1].replace(/\s+/g, "").toUpperCase();
  const fullMatch = raw.match(/^(BT\d{1,2})(\d[A-Z]{2})$/);
  if (fullMatch) {
    return `${fullMatch[1]} ${fullMatch[2]}`;
  }

  return raw;
}

export function normaliseNorthernIrelandPostcode(postcode: string): string {
  const extracted = extractNorthernIrelandPostcode(postcode);
  if (extracted) {
    return extracted;
  }

  return postcode.trim().toUpperCase();
}

/** Common NI towns/cities that autocomplete often omits “Northern Ireland” / BT postcode. */
const NI_PLACE_NAME_PATTERN =
  /\b(belfast|newtownabbey|lisburn|bangor|holywood|carrickfergus|antrim|ballymena|larne|newtownards|comber|dundonald|hillsborough|ballyclare|downpatrick|newcastle|banbridge|newry|armagh|portadown|lurgan|cookstown|coleraine|portrush|portstewart|omagh|enniskillen|derry|londonderry|strabane|limavady|magherafelt|craigavon|aldergrove)\b/i;

export function isNorthernIrelandPlaceName(value: string): boolean {
  return NI_PLACE_NAME_PATTERN.test(value);
}

export function isNorthernIrelandText(value: string): boolean {
  const normalised = value.toLowerCase();

  if (extractPostcode(value)) {
    return true;
  }

  if (isNorthernIrelandPostcodeOutcode(value)) {
    return true;
  }

  if (normalised.includes("northern ireland")) {
    return true;
  }

  if (NI_COUNTY_PATTERN.test(normalised)) {
    return true;
  }

  return isNorthernIrelandPlaceName(normalised);
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

/** ROI cities/airports commonly returned without “Ireland” in the autocomplete label. */
const ROI_PLACE_NAME_PATTERN =
  /\b(dublin|cork|galway|limerick|waterford|kilkenny|wexford|wicklow|kildare|meath|louth|drogheda|dundalk|sligo|donegal|letterkenny|athlone|killarney|tralee|shannon|cork airport|dublin airport|shannon airport)\b/i;

export function isRepublicOfIrelandPlaceName(value: string): boolean {
  if (/\bnorthern ireland\b/i.test(value)) {
    return false;
  }
  return ROI_PLACE_NAME_PATTERN.test(value);
}

export function isRepublicOfIrelandText(value: string): boolean {
  const normalised = value.toLowerCase();

  if (normalised.includes("northern ireland")) {
    return false;
  }

  if (
    normalised.includes("ireland") ||
    normalised.includes("éire") ||
    normalised.includes("eire") ||
    normalised.includes("republic of ireland")
  ) {
    return true;
  }

  if (isRepublicOfIrelandPlaceName(normalised)) {
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

/** True when Google/admin text clearly points at England, Scotland or Wales. */
export function isGreatBritainMainlandParts(parts: {
  postcode?: string;
  county?: string;
  state?: string;
  city?: string;
  town?: string;
  country?: string;
  displayName?: string;
}): boolean {
  const admin = [parts.state, parts.county].filter(Boolean).join(" ").toLowerCase();
  if (/\b(england|scotland|wales)\b/.test(admin)) {
    return true;
  }

  const combined = [parts.postcode, parts.county, parts.state, parts.city, parts.town, parts.displayName]
    .filter(Boolean)
    .join(", ");

  return isGreatBritainMainlandText(combined);
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

  // Never accept England / Scotland / Wales — even when country is “GB”/“UK”.
  if (isGreatBritainMainlandParts(parts)) {
    return false;
  }

  // Universal address-to-address / ROI mode — NI + Republic of Ireland.
  if (code === "A2A") {
    if (isNorthernIrelandAddressParts(parts)) {
      return true;
    }
    if (isRepublicOfIrelandAddressParts(parts)) {
      return true;
    }
    // Allow GB country label when the text still looks NI (Places sometimes omits NI).
    const country = parts.country?.toLowerCase() ?? "";
    if ((country === "united kingdom" || country === "uk" || country === "gb") &&
      isNorthernIrelandText(
        [parts.postcode, parts.county, parts.city, parts.town, parts.displayName]
          .filter(Boolean)
          .join(" "),
      )
    ) {
      return true;
    }
    return false;
  }

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

/**
 * England / Scotland / Wales markers. Word boundaries avoid matching
 * “Londonderry”. Do not treat whole-GB country codes as enough on their own —
 * NI addresses are also “United Kingdom”.
 */
const GB_MAINLAND_REGION_PATTERN =
  /\b(england|scotland|wales|london|manchester|liverpool|birmingham|leeds|sheffield|bristol|glasgow|edinburgh|cardiff|swansea|newport|oxford|cambridge|nottingham|leicester|coventry|southampton|portsmouth|brighton|reading|milton keynes|newcastle upon tyne|sunderland|middlesbrough|hull|york|preston|blackpool|bolton|wigan|stockport|oldham|bradford|wakefield|huddersfield|derby|stoke|wolverhampton|plymouth|exeter|bournemouth|essex|kent|surrey|yorkshire|lancashire|cheshire|devon|cornwall|somerset|norfolk|suffolk|hampshire|dorset|wiltshire|berkshire|buckinghamshire|hertfordshire|bedfordshire|northamptonshire|warwickshire|worcestershire|gloucestershire|herefordshire|shropshire|staffordshire|derbyshire|nottinghamshire|lincolnshire|cumbria|northumberland|durham|tyne and wear|merseyside|greater manchester|west midlands|south yorkshire|west yorkshire|east sussex|west sussex|east anglia|highland|aberdeenshire|fife|lothian|strathclyde|gwent|dyfed|powys|clwyd|gwynedd)\b/i;

/**
 * True when a suggestion label is clearly in England, Scotland or Wales.
 * Northern Ireland (BT / NI place names) and Republic of Ireland are not mainland.
 */
export function isGreatBritainMainlandText(value: string): boolean {
  const text = value.trim();
  if (!text) {
    return false;
  }

  const lower = text.toLowerCase();

  // Explicit Northern Ireland always stays allowed.
  if (
    lower.includes("northern ireland") ||
    Boolean(extractPostcode(text)) ||
    isNorthernIrelandPostcodeOutcode(text)
  ) {
    return false;
  }

  if (/\b(england|scotland|wales)\b/i.test(text)) {
    return true;
  }

  if (GB_MAINLAND_REGION_PATTERN.test(text)) {
    return true;
  }

  if (NON_NI_UK_POSTCODE_PATTERN.test(text)) {
    return true;
  }

  return false;
}

/**
 * Filter autocomplete labels before place details are loaded.
 * Allowed service area: Northern Ireland + Republic of Ireland only.
 * Never allow England / Scotland / Wales (GB region codes alone are insufficient).
 */
export function isAllowedAutocompleteLabel(label: string, airportCode: string): boolean {
  const text = label.trim();
  if (!text) {
    return false;
  }

  const code = normaliseAirportCode(airportCode);

  if (isGreatBritainMainlandText(text)) {
    return false;
  }

  if (code === "LDY") {
    return isGreaterBelfastServiceAddress(text);
  }

  const isNi = isNorthernIrelandText(text);
  const isRoi = isRepublicOfIrelandText(text);

  if (code === "A2A" || code === "DUB") {
    // Require a positive NI or ROI signal — do not pass ambiguous GB mainland labels.
    return isNi || isRoi;
  }

  // BFS / BHD / other NI airport modes — Northern Ireland only.
  return isNi;
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

  const code = normaliseAirportCode(airportCode);
  if (code !== "DUB" && code !== "A2A") {
    return false;
  }

  return lat >= 51.4 && lat <= 55.5 && lon >= -10.8 && lon <= -5.4;
}
