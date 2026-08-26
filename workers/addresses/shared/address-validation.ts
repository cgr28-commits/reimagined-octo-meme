import {
  isGreaterBelfastServiceAddress,
  isLdyDropOffAddress,
} from "./ldy-service-area";
import {
  isDublinAirportCoordinates,
  isServedAirportLabel,
  matchServedAirportCode,
} from "./served-airports";

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

/** Common NI towns/cities that autocomplete often omits “Northern Ireland” / BT postcode.
 * Fallback only — prefer BT postcode, “Northern Ireland”, county, or coordinates.
 */
const NI_PLACE_NAME_PATTERN =
  /\b(belfast|newtownabbey|lisburn|bangor|holywood|carrickfergus|antrim|ballymena|larne|newtownards|comber|dundonald|hillsborough|ballyclare|downpatrick|newcastle|banbridge|newry|armagh|portadown|lurgan|cookstown|coleraine|portrush|portstewart|omagh|enniskillen|derry|londonderry|strabane|limavady|magherafelt|craigavon|aldergrove|donaghadee|groomsport|millisle|ballywalter|portaferry|greyabbey|kircubbin|ballygowan|moneyreagh|carryduff|saintfield|ballynahinch|greenisland|whiteabbey|jordanstown|warrenpoint|kilkeel|dungannon|ballymoney|ballycastle|castlederg|coalisland|ahoghill|broughshane)\b/i;

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
  country?: string;
  displayName?: string;
  lat?: number | null;
  lng?: number | null;
}): boolean {
  if (isNorthernIrelandPostcode(parts.postcode)) {
    return true;
  }

  const state = parts.state?.toLowerCase().trim() ?? "";
  if (state === "northern ireland" || state === "ni") {
    return true;
  }

  // Structured Google Places / geocode signal: GB/UK (or unspecified country) with
  // coordinates inside the NI bounding box — do not require town-name whitelist.
  if (
    typeof parts.lat === "number" &&
    typeof parts.lng === "number" &&
    Number.isFinite(parts.lat) &&
    Number.isFinite(parts.lng) &&
    isNorthernIrelandCoordinates(parts.lat, parts.lng)
  ) {
    const country = parts.country?.toLowerCase().trim() ?? "";
    const countryOk =
      !country ||
      country === "united kingdom" ||
      country === "uk" ||
      country === "gb" ||
      country === "great britain";
    const display = [parts.displayName, parts.city, parts.town, parts.county]
      .filter(Boolean)
      .join(", ");
    if (countryOk && !isGreatBritainMainlandText(display)) {
      return true;
    }
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
    lat?: number | null;
    lng?: number | null;
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

  // Served airports (esp. Dublin) must resolve even when search mode is BFS/BHD.
  const display = [parts.displayName, parts.city, parts.town, parts.county]
    .filter(Boolean)
    .join(" ");
  if (isServedAirportLabel(display) || matchServedAirportCode(display)) {
    if (code === "LDY") {
      return isLdyDropOffAddress(display);
    }
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
 *
 * City names that are also common street names (e.g. York Street, Hull Road)
 * must not match when followed by a thoroughfare type.
 */
const GB_MAINLAND_STREET_TYPE =
  "st\\.?|street|rd\\.?|road|ave\\.?|avenue|ln\\.?|lane|close|court|crescent|park|way|terrace|drive|place|gardens|grove|hill|row|square|mews|walk|gate|circus|parade";

/** York / Hull / Derby / Reading as GB cities — not “York Street”, “Hull Road”, etc. */
const GB_MAINLAND_AMBIGUOUS_CITY_PATTERN = new RegExp(
  String.raw`\b(york|hull|derby|reading)\b(?!\s+(?:${GB_MAINLAND_STREET_TYPE})\b)`,
  "i",
);

const GB_MAINLAND_REGION_PATTERN =
  /\b(england|scotland|wales|london|manchester|liverpool|birmingham|leeds|sheffield|bristol|glasgow|edinburgh|cardiff|swansea|newport|oxford|cambridge|nottingham|leicester|coventry|southampton|portsmouth|brighton|milton keynes|newcastle upon tyne|sunderland|middlesbrough|preston|blackpool|bolton|wigan|stockport|oldham|bradford|wakefield|huddersfield|stoke|wolverhampton|plymouth|exeter|bournemouth|essex|kent|surrey|yorkshire|lancashire|cheshire|devon|cornwall|somerset|norfolk|suffolk|hampshire|dorset|wiltshire|berkshire|buckinghamshire|hertfordshire|bedfordshire|northamptonshire|warwickshire|worcestershire|gloucestershire|herefordshire|shropshire|staffordshire|derbyshire|nottinghamshire|lincolnshire|cumbria|northumberland|durham|tyne and wear|merseyside|greater manchester|west midlands|south yorkshire|west yorkshire|east sussex|west sussex|east anglia|highland|aberdeenshire|fife|lothian|strathclyde|gwent|dyfed|powys|clwyd|gwynedd)\b/i;

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

  // Explicit England / Scotland / Wales always win (before NI place-name short-circuit).
  // Prevents “Newcastle upon Tyne, England” matching NI town Newcastle.
  if (/\b(england|scotland|wales)\b/i.test(text)) {
    return true;
  }

  // Multi-word / unambiguous mainland cities & counties (includes “newcastle upon tyne”).
  if (GB_MAINLAND_REGION_PATTERN.test(text)) {
    return true;
  }

  if (NON_NI_UK_POSTCODE_PATTERN.test(text)) {
    return true;
  }

  // NI / ROI service-area labels are never mainland GB.
  // This prevents false positives like “York Street, Belfast” matching city York.
  if (
    lower.includes("northern ireland") ||
    Boolean(extractPostcode(text)) ||
    isNorthernIrelandPostcodeOutcode(text) ||
    isNorthernIrelandText(text) ||
    isRepublicOfIrelandText(text)
  ) {
    return false;
  }

  // Ambiguous single-token cities (York / Hull / Derby / Reading) when not a street name.
  if (GB_MAINLAND_AMBIGUOUS_CITY_PATTERN.test(text)) {
    return true;
  }

  return false;
}

/**
 * Filter autocomplete labels before place details are loaded.
 * Allowed service area: Northern Ireland + Republic of Ireland only.
 * Never allow England / Scotland / Wales (GB region codes alone are insufficient).
 *
 * Labels without an explicit NI/ROI marker (common when Google omits “Northern
 * Ireland” / BT postcode) are provisionally allowed when they are not clear
 * mainland-GB matches — Place Details (components + coordinates) is the
 * authoritative gate after selection.
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

  // Always allow the site’s served airports (BFS / BHD / DUB) regardless of search mode.
  if (isServedAirportLabel(text)) {
    if (code === "LDY") {
      return isGreaterBelfastServiceAddress(text);
    }
    return true;
  }

  if (code === "A2A" || code === "DUB") {
    if (isNi || isRoi) {
      return true;
    }
    // Provisional UK/local labels (e.g. “Clifton Cove, Donaghadee, UK”) — details confirm.
    return isProvisionalServiceAreaAutocompleteLabel(text, code);
  }

  // BFS / BHD / other NI airport modes — Northern Ireland only (airports handled above).
  if (isNi) {
    return true;
  }

  // Do not soft-pass clear ROI labels into NI-airport modes.
  if (isRoi) {
    return false;
  }

  return isProvisionalServiceAreaAutocompleteLabel(text, code);
}

/**
 * Soft autocomplete pass for UK/local labels that lack an explicit NI town/BT
 * marker. Still blocks mainland GB. Place Details must confirm NI (or ROI when
 * the mode allows it) via components / coordinates before booking.
 */
export function isProvisionalServiceAreaAutocompleteLabel(
  label: string,
  airportCode: string,
): boolean {
  const text = label.trim();
  if (!text || isGreatBritainMainlandText(text)) {
    return false;
  }

  const code = normaliseAirportCode(airportCode);
  const lower = text.toLowerCase();

  // Clear non-UK / non-Ireland foreign countries are out of service area.
  if (
    /\b(france|spain|germany|usa|united states|canada|australia|netherlands|belgium|italy|portugal)\b/i.test(
      text,
    )
  ) {
    return false;
  }

  // ROI-looking labels only provisionally pass in ROI-capable modes.
  if (isRepublicOfIrelandText(text) && code !== "A2A" && code !== "DUB") {
    return false;
  }

  // Explicit UK / GB suffix (Google often returns “Town, UK” without “Northern Ireland”).
  if (/\b(uk|u\.k\.|united kingdom|great britain|gb)\b/i.test(text)) {
    return true;
  }

  // ROI modes: Ireland-suffixed labels without a known city whitelist hit.
  if ((code === "A2A" || code === "DUB") && /\b(ireland|éire|eire)\b/i.test(lower)) {
    return true;
  }

  // Multi-part local labels (“Clifton Cove, Donaghadee”) — not bare street-only text.
  // Place Details confirms NI via components / coordinates after selection.
  const segments = text
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (segments.length >= 2) {
    return true;
  }

  return false;
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

  // Dublin Airport must resolve when changing a BFS/BHD booking destination.
  if (isDublinAirportCoordinates(lat, lon)) {
    return true;
  }

  const code = normaliseAirportCode(airportCode);
  if (code !== "DUB" && code !== "A2A") {
    return false;
  }

  return lat >= 51.4 && lat <= 55.5 && lon >= -10.8 && lon <= -5.4;
}
