var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-4q5i8b/strip-cf-connecting-ip-header.js
function stripCfConnectingIPHeader(input, init) {
  const request = new Request(input, init);
  request.headers.delete("CF-Connecting-IP");
  return request;
}
__name(stripCfConnectingIPHeader, "stripCfConnectingIPHeader");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    return Reflect.apply(target, thisArg, [
      stripCfConnectingIPHeader.apply(null, argArray)
    ]);
  }
});

// shared/quote-lead.ts
var UK_TIME_ZONE = "Europe/London";
function formatUkDate(date) {
  if (!date) {
    return "";
  }
  return (/* @__PURE__ */ new Date(`${date}T12:00:00`)).toLocaleDateString("en-GB", {
    timeZone: UK_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}
__name(formatUkDate, "formatUkDate");
function formatUkTime(time) {
  if (!time) {
    return "";
  }
  const [hours, minutes] = time.split(":");
  const parsed = /* @__PURE__ */ new Date();
  parsed.setHours(Number(hours), Number(minutes), 0, 0);
  return parsed.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit"
  });
}
__name(formatUkTime, "formatUkTime");
function formatUkDateTime(date, time) {
  const formattedDate = formatUkDate(date);
  const formattedTime = formatUkTime(time);
  if (!formattedDate || !formattedTime) {
    return "";
  }
  return `${formattedDate} at ${formattedTime}`;
}
__name(formatUkDateTime, "formatUkDateTime");
function formatUkSubmissionTime(date = /* @__PURE__ */ new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: UK_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(date);
}
__name(formatUkSubmissionTime, "formatUkSubmissionTime");
function buildQuoteLeadSubject(details) {
  const route = `${details.pickupLabel} \u2192 ${details.dropoffLabel}`;
  const trimmedRoute = route.length > 72 ? `${route.slice(0, 69)}\u2026` : route;
  return `Quote viewed \u2014 ${details.estimatedPrice} \u2014 ${trimmedRoute}`;
}
__name(buildQuoteLeadSubject, "buildQuoteLeadSubject");
function buildQuoteLeadMessage(details) {
  const lines = [
    "Someone viewed a live quote on the My Airport Taxi NI website.",
    "",
    "TRIP",
    "=".repeat(40),
    `Trip: ${details.tripLabel}`,
    `Pickup: ${details.pickupLabel}`,
    `Drop-off: ${details.dropoffLabel}`,
    `Return journey: ${details.returnJourney ? "Yes" : "No"}`,
    `${details.returnJourney ? "Outbound date & time" : "Date & time"}: ${formatUkDateTime(details.tripDate, details.tripTime)}`
  ];
  if (details.returnJourney && details.returnDate && details.returnTime) {
    lines.push(
      `Return date & time: ${formatUkDateTime(details.returnDate, details.returnTime)}`
    );
  }
  lines.push(
    `Passengers: ${details.passengers}`,
    `Suitcases: ${details.suitcases}`,
    `Vehicle: ${details.vehicle}`,
    `Estimated price: ${details.estimatedPrice}`
  );
  if (details.journeyDistance && details.journeyDuration) {
    lines.push(`Journey: ${details.journeyDistance} \xB7 ${details.journeyDuration}`);
  }
  lines.push(
    "",
    "Note: No contact details yet \u2014 they have not clicked Book.",
    "",
    `Viewed at: ${formatUkSubmissionTime()}`
  );
  return lines.join("\n");
}
__name(buildQuoteLeadMessage, "buildQuoteLeadMessage");

// shared/ldy-service-area.ts
var GREATER_BELFAST_POSTCODE_DISTRICTS = /* @__PURE__ */ new Set([
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
  "BT43"
]);
var NORTH_WEST_NI_PATTERN = /\b(derry|londonderry|coleraine|omagh|eniskillen|cookstown|strabane|magherafelt|limavady|portrush|portstewart|castlerock|ballycastle|derry~londonderry)\b/i;
var GREATER_BELFAST_PATTERN = /\b(belfast|lisburn|newtownabbey|bangor|holywood|carrickfergus|newtownards|comber|dundonald|hillsborough|larne|ballyclare|antrim|ballymena|finaghy|malone|titanic quarter)\b/i;
function postcodeDistrict(postcode) {
  const normalised = postcode.replace(/\s+/g, "").toUpperCase();
  const match = normalised.match(/^(BT\d{1,2})/);
  return match?.[1] ?? null;
}
__name(postcodeDistrict, "postcodeDistrict");
function isGreaterBelfastServiceAddress(address) {
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
__name(isGreaterBelfastServiceAddress, "isGreaterBelfastServiceAddress");
function isLdyServiceAreaAddress(address) {
  return isGreaterBelfastServiceAddress(address);
}
__name(isLdyServiceAreaAddress, "isLdyServiceAreaAddress");
function isLdyDropOffAddress(address) {
  return isLdyServiceAreaAddress(address);
}
__name(isLdyDropOffAddress, "isLdyDropOffAddress");
function getLdyLocationRestriction() {
  return {
    rectangle: {
      low: { latitude: 54.45, longitude: -6.35 },
      high: { latitude: 54.78, longitude: -5.55 }
    }
  };
}
__name(getLdyLocationRestriction, "getLdyLocationRestriction");

// shared/address-validation.ts
var BT_POSTCODE_PATTERN = /\bBT\d{1,2}\s?\d[A-Z]{2}\b/i;
var BT_OUTCODE_PATTERN = /\bBT\d{1,2}\b/i;
var BT_POSTCODE_QUERY_PATTERN = /\bBT\d{1,2}(?:\s?\d[A-Z]{2})?\b/i;
var NI_COUNTY_PATTERN = /\b(antrim|armagh|down|fermanagh|londonderry|derry|tyrone|belfast)\b/i;
var EIRCODE_PATTERN = /\b[A-Z]\d{2}\s?[A-Z0-9]{4}\b/i;
function extractPostcode(value) {
  const match = value.match(BT_POSTCODE_PATTERN);
  return match ? match[0].replace(/\s+/g, " ").toUpperCase() : null;
}
__name(extractPostcode, "extractPostcode");
function isNorthernIrelandPostcode(postcode) {
  if (!postcode)
    return false;
  return /^BT\d/i.test(postcode.trim());
}
__name(isNorthernIrelandPostcode, "isNorthernIrelandPostcode");
function isNorthernIrelandPostcodeOutcode(value) {
  return BT_OUTCODE_PATTERN.test(value.trim());
}
__name(isNorthernIrelandPostcodeOutcode, "isNorthernIrelandPostcodeOutcode");
function isNorthernIrelandPostcodeQuery(query) {
  return BT_POSTCODE_QUERY_PATTERN.test(query.trim());
}
__name(isNorthernIrelandPostcodeQuery, "isNorthernIrelandPostcodeQuery");
function isFullNorthernIrelandPostcode(postcode) {
  return /^BT\d{1,2}\s?\d[A-Z]{2}$/i.test(postcode.trim());
}
__name(isFullNorthernIrelandPostcode, "isFullNorthernIrelandPostcode");
function extractNorthernIrelandPostcode(query) {
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
__name(extractNorthernIrelandPostcode, "extractNorthernIrelandPostcode");
function normaliseNorthernIrelandPostcode(postcode) {
  const extracted = extractNorthernIrelandPostcode(postcode);
  if (extracted) {
    return extracted;
  }
  return postcode.trim().toUpperCase();
}
__name(normaliseNorthernIrelandPostcode, "normaliseNorthernIrelandPostcode");
function isNorthernIrelandText(value) {
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
  return NI_COUNTY_PATTERN.test(normalised);
}
__name(isNorthernIrelandText, "isNorthernIrelandText");
function isNorthernIrelandAddressParts(parts) {
  if (isNorthernIrelandPostcode(parts.postcode)) {
    return true;
  }
  if (parts.state?.toLowerCase() === "northern ireland") {
    return true;
  }
  const combined = [parts.county, parts.city, parts.town, parts.displayName].filter(Boolean).join(" ");
  return isNorthernIrelandText(combined);
}
__name(isNorthernIrelandAddressParts, "isNorthernIrelandAddressParts");
function isRepublicOfIrelandPostcode(postcode) {
  if (!postcode || isNorthernIrelandPostcode(postcode))
    return false;
  return EIRCODE_PATTERN.test(postcode.trim());
}
__name(isRepublicOfIrelandPostcode, "isRepublicOfIrelandPostcode");
function isRepublicOfIrelandText(value) {
  const normalised = value.toLowerCase();
  if (normalised.includes("northern ireland")) {
    return false;
  }
  if (normalised.includes("ireland") || normalised.includes("dublin")) {
    return true;
  }
  return EIRCODE_PATTERN.test(value);
}
__name(isRepublicOfIrelandText, "isRepublicOfIrelandText");
function isRepublicOfIrelandAddressParts(parts) {
  if (parts.state?.toLowerCase() === "northern ireland") {
    return false;
  }
  if (isRepublicOfIrelandPostcode(parts.postcode)) {
    return true;
  }
  if (parts.country?.toLowerCase() === "ireland") {
    return true;
  }
  const combined = [parts.county, parts.city, parts.town, parts.displayName].filter(Boolean).join(" ");
  return isRepublicOfIrelandText(combined);
}
__name(isRepublicOfIrelandAddressParts, "isRepublicOfIrelandAddressParts");
function isAddressAllowedForAirport(airportCode, parts) {
  const code = normaliseAirportCode(airportCode);
  if (code === "LDY") {
    const combined = [parts.postcode, parts.county, parts.city, parts.town, parts.displayName].filter(Boolean).join(", ");
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
__name(isAddressAllowedForAirport, "isAddressAllowedForAirport");
function normaliseAirportCode(value) {
  return value.trim().toUpperCase();
}
__name(normaliseAirportCode, "normaliseAirportCode");
var NON_NI_UK_POSTCODE_PATTERN = /\b(?!BT)([A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2})\b/i;
var NON_NI_UK_REGION_PATTERN = /\b(england|scotland|wales|london|manchester|liverpool|birmingham|leeds|sheffield|bristol|glasgow|edinburgh|cardiff|essex|kent|surrey|yorkshire|lancashire|cheshire|devon|cornwall|somerset|norfolk|suffolk|hampshire|west midlands|east sussex|west sussex|newcastle upon tyne)\b/i;
function isAllowedAutocompleteLabel(label, airportCode) {
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
  return code !== "DUB";
}
__name(isAllowedAutocompleteLabel, "isAllowedAutocompleteLabel");
function hasLeadingStreetNumber(text) {
  return /^\d+[a-zA-Z]?\s/.test(text.trim());
}
__name(hasLeadingStreetNumber, "hasLeadingStreetNumber");
function sortSuggestionsByStreetNumber(items) {
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
__name(sortSuggestionsByStreetNumber, "sortSuggestionsByStreetNumber");
function isNorthernIrelandCoordinates(lat, lon) {
  return lat >= 54 && lat <= 55.5 && lon >= -8.2 && lon <= -5.4;
}
__name(isNorthernIrelandCoordinates, "isNorthernIrelandCoordinates");
function isAllowedCoordinates(airportCode, lat, lon) {
  if (isNorthernIrelandCoordinates(lat, lon)) {
    return true;
  }
  if (airportCode !== "DUB") {
    return false;
  }
  return lat >= 51.4 && lat <= 55.5 && lon >= -10.8 && lon <= -5.4;
}
__name(isAllowedCoordinates, "isAllowedCoordinates");

// shared/google-places.ts
function getRegionCodes(airportCode) {
  return airportCode === "DUB" ? ["gb", "ie"] : ["gb"];
}
__name(getRegionCodes, "getRegionCodes");
function getLocationRestriction(airportCode) {
  const code = normaliseAirportCode(airportCode);
  if (code === "LDY") {
    return getLdyLocationRestriction();
  }
  if (code === "DUB") {
    return {
      rectangle: {
        low: { latitude: 51.4, longitude: -10.8 },
        high: { latitude: 55.5, longitude: -5.4 }
      }
    };
  }
  return {
    rectangle: {
      low: { latitude: 54, longitude: -8.2 },
      high: { latitude: 55.4, longitude: -5.4 }
    }
  };
}
__name(getLocationRestriction, "getLocationRestriction");
function getAddressComponent(components, type) {
  return components?.find((component) => component.types?.includes(type))?.longText;
}
__name(getAddressComponent, "getAddressComponent");
function parseGoogleAddressComponents(components) {
  return {
    postcode: getAddressComponent(components, "postal_code"),
    county: getAddressComponent(components, "administrative_area_level_2") ?? getAddressComponent(components, "administrative_area_level_1"),
    state: getAddressComponent(components, "administrative_area_level_1"),
    city: getAddressComponent(components, "postal_town") ?? getAddressComponent(components, "locality"),
    town: getAddressComponent(components, "locality") ?? getAddressComponent(components, "postal_town"),
    country: getAddressComponent(components, "country")
  };
}
__name(parseGoogleAddressComponents, "parseGoogleAddressComponents");
function parseLegacyGeocodeComponents(components) {
  const get = /* @__PURE__ */ __name((type) => components?.find((component) => component.types?.includes(type))?.long_name, "get");
  return {
    postcode: get("postal_code"),
    county: get("administrative_area_level_2") ?? get("administrative_area_level_1"),
    state: get("administrative_area_level_1"),
    city: get("postal_town") ?? get("locality"),
    town: get("locality") ?? get("postal_town"),
    country: get("country")
  };
}
__name(parseLegacyGeocodeComponents, "parseLegacyGeocodeComponents");
function extractLeadingStreetNumber(input) {
  const match = input.trim().match(/^(\d+[a-zA-Z]?)\s+/);
  return match ? match[1] : null;
}
__name(extractLeadingStreetNumber, "extractLeadingStreetNumber");
function hasLeadingStreetNumber2(text) {
  return /^\d+[a-zA-Z]?\s/.test(text.trim());
}
__name(hasLeadingStreetNumber2, "hasLeadingStreetNumber");
function isStreetOnlyQuery(query) {
  if (isNorthernIrelandPostcodeQuery(query)) {
    return false;
  }
  return !extractLeadingStreetNumber(query) && query.trim().length >= 3;
}
__name(isStreetOnlyQuery, "isStreetOnlyQuery");
function withStreetNumber(number, addressLine) {
  const trimmed = addressLine.trim();
  if (!trimmed || hasLeadingStreetNumber2(trimmed)) {
    return trimmed;
  }
  return `${number} ${trimmed}`;
}
__name(withStreetNumber, "withStreetNumber");
function formatSuggestion(prediction, userNumber) {
  if (!prediction?.placeId) {
    return null;
  }
  const mainText = prediction.structuredFormat?.mainText?.text ?? prediction.text?.text ?? "";
  const secondaryText = prediction.structuredFormat?.secondaryText?.text ?? "";
  if (!mainText) {
    return null;
  }
  const displayMain = userNumber && !hasLeadingStreetNumber2(mainText) ? withStreetNumber(userNumber, mainText) : mainText;
  const label = secondaryText ? `${displayMain}, ${secondaryText}` : displayMain;
  return {
    id: prediction.placeId,
    label,
    address: label,
    mainText: displayMain,
    secondaryText
  };
}
__name(formatSuggestion, "formatSuggestion");
async function searchGooglePlaces(apiKey, query, airportCode, sessionToken) {
  const body = {
    input: query,
    includedRegionCodes: getRegionCodes(normaliseAirportCode(airportCode)),
    regionCode: airportCode === "DUB" ? "ie" : "gb",
    languageCode: "en-GB",
    locationRestriction: getLocationRestriction(airportCode)
  };
  if (sessionToken) {
    body.sessionToken = sessionToken;
  }
  if (isStreetOnlyQuery(query)) {
    body.includedPrimaryTypes = ["street_address", "premise", "subpremise"];
  }
  const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    return [];
  }
  const data = await response.json();
  const userNumber = extractLeadingStreetNumber(query);
  const code = normaliseAirportCode(airportCode);
  const suggestions = (data.suggestions ?? []).map((item) => formatSuggestion(item.placePrediction, userNumber)).filter((suggestion) => suggestion !== null).filter((suggestion) => isAllowedAutocompleteLabel(suggestion.label, code));
  return sortSuggestionsByStreetNumber(suggestions).slice(0, 8);
}
__name(searchGooglePlaces, "searchGooglePlaces");
async function searchGoogleStreetAddresses(apiKey, query, airportCode) {
  const trimmed = query.trim();
  if (trimmed.length < 3 || !isStreetOnlyQuery(trimmed)) {
    return [];
  }
  const scopedQuery = airportCode === "DUB" ? trimmed : /northern ireland|,\s*bt/i.test(trimmed) ? trimmed : `${trimmed}, Northern Ireland`;
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.id,places.formattedAddress,places.addressComponents"
    },
    body: JSON.stringify({
      textQuery: scopedQuery,
      includedType: "street_address",
      regionCode: airportCode === "DUB" ? "ie" : "gb",
      languageCode: "en-GB",
      pageSize: 15
    })
  });
  if (!response.ok) {
    return [];
  }
  const data = await response.json();
  const suggestions = [];
  for (const place of data.places ?? []) {
    if (!place.id || !place.formattedAddress) {
      continue;
    }
    const formatted = place.formattedAddress.trim();
    if (!hasLeadingStreetNumber2(formatted)) {
      continue;
    }
    const parts = parseGoogleAddressComponents(place.addressComponents);
    if (!isAddressAllowedForAirport(normaliseAirportCode(airportCode), {
      ...parts,
      displayName: formatted
    })) {
      continue;
    }
    const commaIndex = formatted.indexOf(",");
    const mainText = commaIndex === -1 ? formatted : formatted.slice(0, commaIndex);
    const secondaryText = commaIndex === -1 ? "" : formatted.slice(commaIndex + 1).trim();
    suggestions.push({
      id: place.id,
      label: formatted,
      address: formatted,
      mainText,
      secondaryText
    });
  }
  return sortSuggestionsByStreetNumber(suggestions).slice(0, 8);
}
__name(searchGoogleStreetAddresses, "searchGoogleStreetAddresses");
var ESTABLISHMENT_PRIMARY_TYPES = [
  "establishment",
  "point_of_interest",
  "lodging",
  "store",
  "restaurant"
];
async function searchGoogleEstablishments(apiKey, query, airportCode, sessionToken) {
  const trimmed = query.trim();
  if (trimmed.length < 3 || extractLeadingStreetNumber(trimmed)) {
    return [];
  }
  const body = {
    input: trimmed,
    includedRegionCodes: getRegionCodes(normaliseAirportCode(airportCode)),
    regionCode: airportCode === "DUB" ? "ie" : "gb",
    languageCode: "en-GB",
    locationRestriction: getLocationRestriction(airportCode),
    includedPrimaryTypes: [...ESTABLISHMENT_PRIMARY_TYPES]
  };
  if (sessionToken) {
    body.sessionToken = sessionToken;
  }
  const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    return [];
  }
  const data = await response.json();
  const code = normaliseAirportCode(airportCode);
  const suggestions = (data.suggestions ?? []).map((item) => formatSuggestion(item.placePrediction, null)).filter((suggestion) => suggestion !== null).filter((suggestion) => isAllowedAutocompleteLabel(suggestion.label, code));
  return suggestions.slice(0, 6);
}
__name(searchGoogleEstablishments, "searchGoogleEstablishments");
async function resolveGooglePlace(apiKey, placeId, airportCode, sessionToken, userInput) {
  const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`);
  if (sessionToken) {
    url.searchParams.set("sessionToken", sessionToken);
  }
  const response = await fetch(url, {
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "formattedAddress,addressComponents"
    }
  });
  if (!response.ok) {
    return null;
  }
  const data = await response.json();
  const parts = parseGoogleAddressComponents(data.addressComponents);
  if (!isAddressAllowedForAirport(normaliseAirportCode(airportCode), {
    ...parts,
    displayName: data.formattedAddress
  })) {
    return null;
  }
  let formatted = data.formattedAddress?.trim() || null;
  if (formatted && userInput) {
    const userNumber = extractLeadingStreetNumber(userInput);
    if (userNumber && !hasLeadingStreetNumber2(formatted)) {
      formatted = withStreetNumber(userNumber, formatted);
    }
  }
  return formatted;
}
__name(resolveGooglePlace, "resolveGooglePlace");
async function reverseGeocodeGoogle(apiKey, lat, lon, airportCode) {
  if (!isAllowedCoordinates(normaliseAirportCode(airportCode), lat, lon)) {
    return null;
  }
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("latlng", `${lat},${lon}`);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("language", "en-GB");
  url.searchParams.set(
    "result_type",
    "street_address|premise|subpremise|route|neighborhood|locality"
  );
  const response = await fetch(url);
  if (!response.ok) {
    return null;
  }
  const data = await response.json();
  if (data.status !== "OK" || !data.results?.length) {
    return null;
  }
  for (const result of data.results) {
    const parts = parseLegacyGeocodeComponents(result.address_components);
    const formatted = result.formatted_address?.trim();
    if (formatted && isAddressAllowedForAirport(normaliseAirportCode(airportCode), {
      ...parts,
      displayName: formatted
    })) {
      return formatted;
    }
  }
  return null;
}
__name(reverseGeocodeGoogle, "reverseGeocodeGoogle");
var ALLOWED_ORIGINS = [
  "https://www.myairporttaxini.co.uk",
  "https://myairporttaxini.co.uk",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
];
function corsHeaders(origin) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Driver-Key, X-Owner-Key"
  };
}
__name(corsHeaders, "corsHeaders");

// shared/getaddress.ts
var GETADDRESS_NI_FILTER = "postcode:BT";
function formatGetAddressDetail(detail) {
  return [detail.line_1, detail.line_2, detail.line_3, detail.town_or_city, detail.county, detail.postcode].filter(Boolean).join(", ");
}
__name(formatGetAddressDetail, "formatGetAddressDetail");
function formatGetAddressString(address, postcode) {
  const cleaned = address.split(",").map((part) => part.trim()).filter(Boolean).join(", ");
  if (!cleaned) {
    return postcode?.trim() ?? "";
  }
  if (postcode && !cleaned.toUpperCase().includes(postcode.trim().toUpperCase())) {
    return `${cleaned}, ${postcode.trim()}`;
  }
  return cleaned;
}
__name(formatGetAddressString, "formatGetAddressString");
function splitAddressLabel(label) {
  const parts = label.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length <= 1) {
    return { mainText: label, secondaryText: "" };
  }
  return {
    mainText: parts[0] ?? label,
    secondaryText: parts.slice(1).join(", ")
  };
}
__name(splitAddressLabel, "splitAddressLabel");
function toGetAddressSuggestion(item) {
  const { mainText, secondaryText } = splitAddressLabel(item.address);
  return {
    id: `ga:${item.id}`,
    label: item.address,
    address: item.address,
    mainText,
    secondaryText
  };
}
__name(toGetAddressSuggestion, "toGetAddressSuggestion");
function toStaticGetAddressSuggestion(formatted) {
  const { mainText, secondaryText } = splitAddressLabel(formatted);
  return {
    id: `ga:static:${encodeURIComponent(formatted)}`,
    label: formatted,
    address: formatted,
    mainText,
    secondaryText
  };
}
__name(toStaticGetAddressSuggestion, "toStaticGetAddressSuggestion");
function shouldUseGetAddress(airportCode, query) {
  const code = airportCode.trim().toUpperCase();
  if (code === "DUB") {
    return false;
  }
  if (code !== "LDY") {
    return true;
  }
  return isNorthernIrelandPostcodeQuery(query);
}
__name(shouldUseGetAddress, "shouldUseGetAddress");
async function searchGetAddressAutocomplete(apiKey, query, airportCode) {
  const url = new URL(
    `https://api.getAddress.io/autocomplete/${encodeURIComponent(query.trim())}`
  );
  url.searchParams.set("api-key", apiKey);
  url.searchParams.set("all", "true");
  url.searchParams.set("top", "6");
  url.searchParams.set("show-postcode", "true");
  if (airportCode !== "DUB" && !isNorthernIrelandPostcodeQuery(query)) {
    url.searchParams.set("filter", GETADDRESS_NI_FILTER);
  }
  const response = await fetch(url.toString());
  if (!response.ok) {
    return [];
  }
  const data = await response.json();
  return sortSuggestionsByStreetNumber(
    (data.suggestions ?? []).filter((item) => isNorthernIrelandText(item.address)).map(toGetAddressSuggestion)
  ).slice(0, 6);
}
__name(searchGetAddressAutocomplete, "searchGetAddressAutocomplete");
async function searchGetAddressFind(apiKey, postcode, airportCode) {
  const normalised = normaliseNorthernIrelandPostcode(postcode);
  if (!isFullNorthernIrelandPostcode(normalised)) {
    return [];
  }
  const compactPostcode = normalised.replace(/\s+/g, "");
  const response = await fetch(
    `https://api.getAddress.io/find/${encodeURIComponent(compactPostcode)}?api-key=${encodeURIComponent(apiKey)}&expand=true&sort=true`
  );
  if (!response.ok) {
    return [];
  }
  const data = await response.json();
  const suggestions = [];
  for (const entry of data.addresses ?? []) {
    const detail = typeof entry === "string" ? {
      line_1: entry.split(",")[0]?.trim(),
      town_or_city: entry.split(",")[5]?.trim(),
      county: entry.split(",")[6]?.trim(),
      postcode: data.postcode
    } : {
      ...entry,
      postcode: entry.postcode ?? data.postcode
    };
    const formatted = typeof entry === "string" ? formatGetAddressString(entry, data.postcode) : formatGetAddressDetail(detail);
    if (!formatted || !isAddressAllowedForAirport(airportCode.trim().toUpperCase(), {
      postcode: detail.postcode,
      county: detail.county,
      city: detail.town_or_city,
      displayName: formatted
    })) {
      continue;
    }
    suggestions.push(toStaticGetAddressSuggestion(formatted));
  }
  return sortSuggestionsByStreetNumber(suggestions).slice(0, 8);
}
__name(searchGetAddressFind, "searchGetAddressFind");
async function searchGetAddress(apiKey, query, airportCode) {
  const trimmed = query.trim();
  if (trimmed.length < 3 || !shouldUseGetAddress(airportCode, trimmed)) {
    return [];
  }
  if (isNorthernIrelandPostcodeQuery(trimmed)) {
    const extracted = extractNorthernIrelandPostcode(trimmed);
    if (extracted && isFullNorthernIrelandPostcode(extracted)) {
      const findResults = await searchGetAddressFind(apiKey, extracted, airportCode);
      if (findResults.length > 0) {
        return findResults;
      }
    }
  }
  return searchGetAddressAutocomplete(apiKey, trimmed, airportCode);
}
__name(searchGetAddress, "searchGetAddress");
async function resolveGetAddress(apiKey, placeId, airportCode) {
  if (placeId.startsWith("ga:static:")) {
    const formatted2 = decodeURIComponent(placeId.slice("ga:static:".length));
    if (!formatted2 || !isAddressAllowedForAirport(airportCode.trim().toUpperCase(), {
      displayName: formatted2,
      postcode: extractNorthernIrelandPostcode(formatted2) ?? void 0
    })) {
      return null;
    }
    return formatted2;
  }
  const id = placeId.startsWith("ga:") ? placeId.slice(3) : placeId;
  const response = await fetch(
    `https://api.getAddress.io/get/${encodeURIComponent(id)}?api-key=${encodeURIComponent(apiKey)}`
  );
  if (!response.ok) {
    return null;
  }
  const detail = await response.json();
  const formatted = formatGetAddressDetail(detail);
  if (!formatted || !isAddressAllowedForAirport(airportCode.trim().toUpperCase(), {
    postcode: detail.postcode,
    county: detail.county,
    city: detail.town_or_city,
    displayName: formatted
  })) {
    return null;
  }
  return formatted;
}
__name(resolveGetAddress, "resolveGetAddress");

// shared/booking-reference.ts
var STARTING_BOOKING_REF = 1001;
function formatBookingReference(refNumber) {
  return `MATNI-${refNumber}`;
}
__name(formatBookingReference, "formatBookingReference");
function prependBookingReference(message, bookingReference) {
  return `Booking reference: ${bookingReference}

${message}`;
}
__name(prependBookingReference, "prependBookingReference");

// shared/booking-notifications.ts
var BUSINESS_WEBSITE = "https://www.myairporttaxini.co.uk";
var BUSINESS_EMAIL = "bookings@myairporttaxini.co.uk";
var LOGO_URL = `${BUSINESS_WEBSITE}/google-business-logo.png`;
function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
__name(escapeHtml, "escapeHtml");
function formatTripScheduleLines(details) {
  const lines = [
    `Trip: ${details.tripLabel}`,
    `Pickup: ${details.pickupLabel}`,
    `Drop-off: ${details.dropoffLabel}`,
    `Return journey: ${details.returnJourney ? "Yes" : "No"}`,
    `${details.returnJourney ? "Outbound date" : "Date"}: ${details.tripDate}`,
    `${details.returnJourney ? "Outbound time" : "Time"}: ${details.tripTime}`
  ];
  if (details.returnJourney) {
    lines.push(`Return date: ${details.returnDate}`, `Return time: ${details.returnTime}`);
  }
  if (details.isAirportTrip && details.flightNumber) {
    lines.push(`Flight number for going: ${details.flightNumber}`);
  }
  if (details.isAirportTrip && details.returnFlightNumber) {
    lines.push(`Flight number for collection: ${details.returnFlightNumber}`);
  }
  lines.push(
    `Passengers: ${details.passengers}`,
    `Suitcases: ${details.suitcases}`,
    `Vehicle: ${details.vehicle}`
  );
  if (details.journeyDistance && details.journeyDuration) {
    lines.push(`Journey: ${details.journeyDistance} \xB7 ${details.journeyDuration}`);
  }
  return lines;
}
__name(formatTripScheduleLines, "formatTripScheduleLines");
function formatTripSchedule(details) {
  return formatTripScheduleLines(details).join("\n");
}
__name(formatTripSchedule, "formatTripSchedule");
function invoiceRows(details) {
  const rows = [
    { label: "Trip", value: details.tripLabel },
    { label: "Pickup", value: details.pickupLabel },
    { label: "Drop-off", value: details.dropoffLabel },
    {
      label: details.returnJourney ? "Outbound date" : "Date",
      value: details.tripDate
    },
    {
      label: details.returnJourney ? "Outbound time" : "Time",
      value: details.tripTime
    }
  ];
  if (details.returnJourney) {
    rows.push({ label: "Return date", value: details.returnDate });
    rows.push({ label: "Return time", value: details.returnTime });
  }
  if (details.isAirportTrip && details.flightNumber) {
    rows.push({ label: "Flight for going", value: details.flightNumber });
  }
  if (details.isAirportTrip && details.returnFlightNumber) {
    rows.push({ label: "Flight for collection", value: details.returnFlightNumber });
  }
  rows.push(
    { label: "Passengers", value: String(details.passengers) },
    { label: "Suitcases", value: String(details.suitcases) },
    { label: "Vehicle", value: details.vehicle }
  );
  if (details.journeyDistance && details.journeyDuration) {
    rows.push({
      label: "Journey",
      value: `${details.journeyDistance} \xB7 ${details.journeyDuration}`
    });
  }
  return rows;
}
__name(invoiceRows, "invoiceRows");
function buildInvoiceHtml(details, businessName, trackUrl) {
  const invoiceNumber = escapeHtml(details.paymentReference);
  const customerName = escapeHtml(details.customerName);
  const rowsHtml = invoiceRows(details).map(
    (row) => `<tr><td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:14px;width:38%;vertical-align:top;">${escapeHtml(row.label)}</td><td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#0b1f33;font-size:14px;font-weight:600;vertical-align:top;">${escapeHtml(row.value)}</td></tr>`
  ).join("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Invoice \u2014 ${escapeHtml(businessName)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1a2b3c;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:#0b1f33;padding:28px 32px;text-align:center;">
              <img src="${LOGO_URL}" alt="${escapeHtml(businessName)}" height="72" style="display:block;margin:0 auto;height:72px;width:auto;max-width:100%;" />
              <div style="margin-top:16px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#c9a227;font-weight:bold;">Invoice &amp; booking confirmation</div>
              <div style="margin-top:8px;font-size:22px;line-height:1.35;color:#ffffff;font-weight:bold;">Thank you, ${customerName}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 8px;font-size:15px;line-height:1.7;color:#334155;">
              <p style="margin:0 0 16px;">Your card payment has been received and your airport transfer is confirmed. Please keep this invoice for your records.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 8px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <div style="font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:#c9a227;font-weight:bold;margin-bottom:12px;">Payment summary</div>
                    <div style="font-size:28px;font-weight:bold;color:#0b1f33;line-height:1.2;margin-bottom:12px;">${escapeHtml(details.amountPaid)}</div>
                    <div style="font-size:14px;line-height:1.8;color:#475569;">
                      <strong>Invoice / reference:</strong> ${invoiceNumber}<br />
                      <strong>Payment method:</strong> Card (SumUp)<br />
                      ${details.transactionCode ? `<strong>Transaction code:</strong> ${escapeHtml(details.transactionCode)}<br />` : ""}
                      <strong>Status:</strong> Paid in full
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 8px;">
              <div style="font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:#c9a227;font-weight:bold;margin-bottom:12px;">Booking details</div>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rowsHtml}</table>
            </td>
          </tr>
          ${trackUrl ? `<tr>
            <td style="padding:8px 32px 8px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <div style="font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:#15803d;font-weight:bold;margin-bottom:12px;">Live driver tracking</div>
                    <div style="font-size:14px;line-height:1.8;color:#475569;">
                      On the day of travel, your driver can share their live location around pickup time.
                      Save this link \u2014 it activates about 2 hours before your scheduled pickup.
                    </div>
                    <div style="margin-top:12px;">
                      <a href="${escapeHtml(trackUrl)}" style="display:inline-block;background:#0b1f33;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;padding:12px 20px;border-radius:8px;">Open tracking page</a>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>` : ""}
          <tr>
            <td style="padding:8px 32px 8px;">
              <div style="font-size:13px;line-height:1.7;color:#64748b;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px 20px;">
                <strong style="color:#92400e;">Cancellation policy:</strong>
                Free cancellation more than 24 hours before pickup. Bookings cancelled within 24 hours of pickup are non-refundable.
                See our <a href="${BUSINESS_WEBSITE}/terms/" style="color:#0b1f33;">Terms &amp; Conditions</a> for full details.
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 28px;font-size:14px;line-height:1.7;color:#475569;">
              <p style="margin:0 0 12px;">We will contact you if we need any further information before your journey.</p>
              <p style="margin:0;">Questions? Reply to this email or contact us at <a href="mailto:${BUSINESS_EMAIL}" style="color:#0b1f33;">${BUSINESS_EMAIL}</a>.</p>
            </td>
          </tr>
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 32px;font-size:13px;line-height:1.7;color:#64748b;">
              <strong style="color:#0b1f33;">${escapeHtml(businessName)}</strong><br />
              <a href="${BUSINESS_WEBSITE}" style="color:#0b1f33;">${BUSINESS_WEBSITE.replace("https://", "")}</a> \xB7
              <a href="${BUSINESS_WEBSITE}/terms/" style="color:#0b1f33;">Terms &amp; Conditions</a> \xB7
              <a href="${BUSINESS_WEBSITE}/privacy/" style="color:#0b1f33;">Privacy Policy</a><br />
              Business address available on request \u2014 ${BUSINESS_EMAIL}
            </td>
          </tr>
          <tr>
            <td style="background:#0b1f33;padding:16px 32px;text-align:center;font-size:12px;line-height:1.6;color:#94a3b8;">
              Premium airport transfers across Northern Ireland \xB7 Belfast \xB7 Dublin \xB7 Derry
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
__name(buildInvoiceHtml, "buildInvoiceHtml");
function buildCustomerConfirmationEmail(details, businessName = "My Airport Taxi NI", options) {
  const trackUrl = options?.trackUrl?.trim();
  const subject = `Invoice & booking confirmed \u2014 ${businessName}`;
  const text = `Dear ${details.customerName},

Thank you for your booking with ${businessName}. Your card payment has been received and your transfer is confirmed.

Logo: ${LOGO_URL}
${BUSINESS_WEBSITE}

Please find your invoice details below.

BOOKING DETAILS
${"=".repeat(40)}
${formatTripSchedule(details)}

PAYMENT / INVOICE
${"=".repeat(40)}
Amount paid: ${details.amountPaid}
Invoice / reference: ${details.paymentReference}
` + (details.transactionCode ? `Transaction code: ${details.transactionCode}
` : "") + `Payment method: Card (SumUp)
Status: Paid in full
` + (trackUrl ? `
LIVE DRIVER TRACKING
${"=".repeat(40)}
On the day of travel, your driver can share their live location around pickup time.
Save this link \u2014 it activates about 2 hours before your scheduled pickup:
${trackUrl}
` : "") + `
We will contact you if we need any further information before your journey.

If you have questions, reply to this email or contact us at ${BUSINESS_EMAIL}.

${businessName}
${BUSINESS_WEBSITE}`;
  const html = buildInvoiceHtml(details, businessName, trackUrl);
  return { subject, text, html };
}
__name(buildCustomerConfirmationEmail, "buildCustomerConfirmationEmail");
function buildOwnerPaidBookingEmail(details, businessName = "My Airport Taxi NI", options) {
  const trackUrl = options?.trackUrl?.trim();
  const subject = `Paid booking \u2014 ${details.customerName} \u2014 ${details.amountPaid}`;
  const body = `New paid booking via ${businessName} website.

CUSTOMER
${"=".repeat(40)}
Name: ${details.customerName}
Email: ${details.customerEmail}
Mobile: ${details.mobileNumber || "Not provided"}

TRIP
${"=".repeat(40)}
${formatTripSchedule(details)}

PAYMENT
${"=".repeat(40)}
Amount paid: ${details.amountPaid}
Payment reference: ${details.paymentReference}
` + (details.transactionCode ? `Transaction code: ${details.transactionCode}
` : "") + (details.checkoutReference ? `Checkout reference: ${details.checkoutReference}
` : "") + `Status: PAID (verified via SumUp)` + (details.termsAcceptedAt ? `
Terms accepted: ${details.termsAcceptedAt}${details.termsVersion ? ` (${details.termsVersion})` : ""}` : "") + (trackUrl ? `

DRIVER TRACK LINK
${"=".repeat(40)}
${trackUrl}` : "");
  return { subject, body };
}
__name(buildOwnerPaidBookingEmail, "buildOwnerPaidBookingEmail");
function formatPaidAmount(amount, currency = "GBP") {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount);
}
__name(formatPaidAmount, "formatPaidAmount");
function formatTripDateTime(tripDate, tripTime) {
  if (!tripDate || !tripTime) {
    return "";
  }
  return (/* @__PURE__ */ new Date(`${tripDate}T${tripTime}:00`)).toLocaleString("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}
__name(formatTripDateTime, "formatTripDateTime");
function buildTrackingReminderHtml(details, trackUrl, businessName) {
  const customerName = escapeHtml(details.customerName);
  const pickup = escapeHtml(details.pickupLabel);
  const dropoff = escapeHtml(details.dropoffLabel);
  const when = escapeHtml(formatTripDateTime(details.tripDate, details.tripTime));
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Live tracking \u2014 ${escapeHtml(businessName)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1a2b3c;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:#0b1f33;padding:28px 32px;text-align:center;">
              <img src="${LOGO_URL}" alt="${escapeHtml(businessName)}" height="72" style="display:block;margin:0 auto;height:72px;width:auto;max-width:100%;" />
              <div style="margin-top:16px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#c9a227;font-weight:bold;">Live driver tracking</div>
              <div style="margin-top:8px;font-size:22px;line-height:1.35;color:#ffffff;font-weight:bold;">Your driver is on the way</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 8px;font-size:15px;line-height:1.7;color:#334155;">
              <p style="margin:0 0 16px;">Hi ${customerName}, your driver has started sharing their live location. Open the link below to follow them on the map.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 8px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
                <tr>
                  <td style="padding:20px 24px;font-size:14px;line-height:1.8;color:#475569;">
                    ${when ? `<strong>Pickup time:</strong> ${when}<br />` : ""}
                    <strong>Pickup:</strong> ${pickup}<br />
                    <strong>Drop-off:</strong> ${dropoff}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 28px;text-align:center;">
              <a href="${escapeHtml(trackUrl)}" style="display:inline-block;background:#0b1f33;color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;padding:14px 28px;border-radius:8px;">Follow your driver live</a>
              <p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#64748b;">Or copy this link:<br /><a href="${escapeHtml(trackUrl)}" style="color:#0b1f33;word-break:break-all;">${escapeHtml(trackUrl)}</a></p>
            </td>
          </tr>
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 32px;font-size:13px;line-height:1.7;color:#64748b;">
              <strong style="color:#0b1f33;">${escapeHtml(businessName)}</strong><br />
              Questions? <a href="mailto:${BUSINESS_EMAIL}" style="color:#0b1f33;">${BUSINESS_EMAIL}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
__name(buildTrackingReminderHtml, "buildTrackingReminderHtml");
function buildTrackingReminderEmail(details, trackUrl, businessName = "My Airport Taxi NI") {
  const when = formatTripDateTime(details.tripDate, details.tripTime);
  const subject = `Your driver is on the way \u2014 follow live | ${businessName}`;
  const text = `Hi ${details.customerName},

Your driver has started sharing their live location for your transfer today.

` + (when ? `Pickup time: ${when}
` : "") + `Pickup: ${details.pickupLabel}
Drop-off: ${details.dropoffLabel}

Follow your driver live:
${trackUrl}

${businessName}
${BUSINESS_WEBSITE}`;
  const html = buildTrackingReminderHtml(details, trackUrl, businessName);
  return { subject, text, html };
}
__name(buildTrackingReminderEmail, "buildTrackingReminderEmail");
function buildRefundConfirmationHtml(details, businessName) {
  const customerName = escapeHtml(details.customerName);
  const when = escapeHtml(formatTripDateTime(details.tripDate, details.tripTime));
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Refund confirmation \u2014 ${escapeHtml(businessName)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1a2b3c;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:#0b1f33;padding:28px 32px;text-align:center;">
              <img src="${LOGO_URL}" alt="${escapeHtml(businessName)}" height="72" style="display:block;margin:0 auto;height:72px;width:auto;max-width:100%;" />
              <div style="margin-top:16px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#c9a227;font-weight:bold;">Refund confirmation</div>
              <div style="margin-top:8px;font-size:22px;line-height:1.35;color:#ffffff;font-weight:bold;">Your refund is on its way, ${customerName}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 8px;font-size:15px;line-height:1.7;color:#334155;">
              <p style="margin:0 0 16px;">We've processed a refund of <strong style="color:#0b1f33;font-size:17px;">${escapeHtml(details.refundAmount)}</strong> for your booking with ${escapeHtml(businessName)}. The amount should return to your original payment method within <strong>5&ndash;7 working days</strong>, depending on your bank or card provider.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 8px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <div style="font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:#c9a227;font-weight:bold;margin-bottom:12px;">Refund summary</div>
                    <div style="font-size:28px;font-weight:bold;color:#0b1f33;line-height:1.2;margin-bottom:12px;">${escapeHtml(details.refundAmount)}</div>
                    <div style="font-size:14px;line-height:1.8;color:#475569;">
                      <strong>Original reference:</strong> ${escapeHtml(details.paymentReference)}<br />
                      <strong>Trip:</strong> ${escapeHtml(details.tripLabel)}<br />
                      ${when ? `<strong>Journey:</strong> ${when}<br />` : ""}
                      <strong>Pickup:</strong> ${escapeHtml(details.pickupLabel)}<br />
                      <strong>Drop-off:</strong> ${escapeHtml(details.dropoffLabel)}<br />
                      <strong>Status:</strong> Cancelled and refunded
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 28px;font-size:14px;line-height:1.7;color:#475569;">
              <p style="margin:0;">If you have any questions about this refund, reply to this email or contact us at <a href="mailto:${BUSINESS_EMAIL}" style="color:#0b1f33;">${BUSINESS_EMAIL}</a>.</p>
            </td>
          </tr>
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 32px;font-size:13px;line-height:1.7;color:#64748b;">
              <strong style="color:#0b1f33;">${escapeHtml(businessName)}</strong><br />
              <a href="${BUSINESS_WEBSITE}" style="color:#0b1f33;">${BUSINESS_WEBSITE.replace(/^https:\/\//, "")}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
__name(buildRefundConfirmationHtml, "buildRefundConfirmationHtml");
function buildCustomerRefundConfirmationEmail(details, businessName = "My Airport Taxi NI") {
  const when = formatTripDateTime(details.tripDate, details.tripTime);
  const subject = `Refund confirmation \u2014 ${details.refundAmount} \u2014 ${businessName}`;
  const text = `Hi ${details.customerName},

Refund amount: ${details.refundAmount}

We've processed a refund of ${details.refundAmount} for your booking with ${businessName}.

Original reference: ${details.paymentReference}
Trip: ${details.tripLabel}
` + (when ? `Journey: ${when}
` : "") + `Pickup: ${details.pickupLabel}
Drop-off: ${details.dropoffLabel}

The refund should appear on your original payment method within 5-7 working days.

Questions? Contact us at ${BUSINESS_EMAIL}.

${businessName}
${BUSINESS_WEBSITE}`;
  const html = buildRefundConfirmationHtml(details, businessName);
  return { subject, text, html };
}
__name(buildCustomerRefundConfirmationEmail, "buildCustomerRefundConfirmationEmail");
function buildOwnerRefundConfirmationEmail(details, businessName = "My Airport Taxi NI") {
  const when = formatTripDateTime(details.tripDate, details.tripTime);
  const subject = `Refund issued \u2014 ${details.customerName} \u2014 ${details.refundAmount}`;
  const body = `A refund was issued via ${businessName}.

CUSTOMER
${"=".repeat(40)}
Name: ${details.customerName}

REFUND
${"=".repeat(40)}
Amount refunded: ${details.refundAmount}
Original reference: ${details.paymentReference}

TRIP
${"=".repeat(40)}
Trip: ${details.tripLabel}
` + (when ? `Journey: ${when}
` : "") + `Pickup: ${details.pickupLabel}
Drop-off: ${details.dropoffLabel}

Calendar events marked as cancelled and the booking marked as refunded on the driver dashboard.`;
  return { subject, body };
}
__name(buildOwnerRefundConfirmationEmail, "buildOwnerRefundConfirmationEmail");
function buildGoogleReviewRequestHtml(details, reviewUrl, businessName) {
  const customerName = escapeHtml(details.customerName);
  const pickup = escapeHtml(details.pickupLabel);
  const dropoff = escapeHtml(details.dropoffLabel);
  const when = escapeHtml(formatTripDateTime(details.tripDate, details.tripTime));
  const safeReviewUrl = escapeHtml(reviewUrl);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Thank you \u2014 ${escapeHtml(businessName)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1a2b3c;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:#0b1f33;padding:28px 32px;text-align:center;">
              <img src="${LOGO_URL}" alt="${escapeHtml(businessName)}" height="72" style="display:block;margin:0 auto;height:72px;width:auto;max-width:100%;" />
              <div style="margin-top:16px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#c9a227;font-weight:bold;">Thank you for travelling with us</div>
              <div style="margin-top:8px;font-size:22px;line-height:1.35;color:#ffffff;font-weight:bold;">We hope you enjoyed your journey, ${customerName}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 8px;font-size:15px;line-height:1.7;color:#334155;">
              <p style="margin:0 0 16px;">Thank you for choosing ${escapeHtml(businessName)}. We hope your transfer went smoothly and we'd really appreciate hearing how we did.</p>
              <p style="margin:0;">If you have a moment, please leave us a Google review \u2014 it helps other travellers find a reliable airport taxi and means a lot to our small team.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 8px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
                <tr>
                  <td style="padding:20px 24px;font-size:14px;line-height:1.8;color:#475569;">
                    ${when ? `<strong>Journey date:</strong> ${when}<br />` : ""}
                    <strong>Pickup:</strong> ${pickup}<br />
                    <strong>Drop-off:</strong> ${dropoff}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 28px;text-align:center;">
              <a href="${safeReviewUrl}" style="display:inline-block;background:#34a853;color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;padding:14px 28px;border-radius:8px;">Leave a Google review</a>
              <p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#64748b;">Or copy this link:<br /><a href="${safeReviewUrl}" style="color:#0b1f33;word-break:break-all;">${safeReviewUrl}</a></p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 24px;font-size:14px;line-height:1.7;color:#475569;text-align:center;">
              <p style="margin:0;">Had an issue with your journey? Reply to this email or contact us at <a href="mailto:${BUSINESS_EMAIL}" style="color:#0b1f33;">${BUSINESS_EMAIL}</a> \u2014 we'll put it right.</p>
            </td>
          </tr>
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 32px;font-size:13px;line-height:1.7;color:#64748b;">
              <strong style="color:#0b1f33;">${escapeHtml(businessName)}</strong><br />
              <a href="${BUSINESS_WEBSITE}" style="color:#0b1f33;">${BUSINESS_WEBSITE.replace(/^https:\/\//, "")}</a> \xB7
              <a href="tel:+442896022952" style="color:#0b1f33;">028 9602 2952</a>
            </td>
          </tr>
          <tr>
            <td style="background:#0b1f33;padding:16px 32px;text-align:center;font-size:12px;line-height:1.6;color:#94a3b8;">
              Premium airport transfers across Northern Ireland \xB7 Belfast \xB7 Dublin \xB7 Derry
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
__name(buildGoogleReviewRequestHtml, "buildGoogleReviewRequestHtml");
function buildGoogleReviewRequestEmail(details, reviewUrl, businessName = "My Airport Taxi NI") {
  const when = formatTripDateTime(details.tripDate, details.tripTime);
  const subject = `Thank you for travelling with us \u2014 ${businessName}`;
  const text = `Hi ${details.customerName},

Thank you for choosing ${businessName}. We hope your transfer went smoothly.

` + (when ? `Journey: ${when}
` : "") + `Pickup: ${details.pickupLabel}
Drop-off: ${details.dropoffLabel}

If you have a moment, we'd really appreciate a Google review:
${reviewUrl}

Had an issue? Reply to this email or contact us at ${BUSINESS_EMAIL}.

${businessName}
${BUSINESS_WEBSITE}`;
  const html = buildGoogleReviewRequestHtml(details, reviewUrl, businessName);
  return { subject, text, html };
}
__name(buildGoogleReviewRequestEmail, "buildGoogleReviewRequestEmail");

// shared/flight-lookup.ts
var SERVED_AIRPORT_IATA = {
  BFS: ["BFS"],
  BHD: ["BHD"],
  DUB: ["DUB"],
  LDY: ["LDY"]
};
var FLIGHT_NUMBER_PATTERN = /^([A-Z0-9]{2,3})\s*(\d{1,4}[A-Z]?)$/i;
function normalizeFlightNumber(value) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}
__name(normalizeFlightNumber, "normalizeFlightNumber");
function isValidFlightNumberFormat(value) {
  const normalised = normalizeFlightNumber(value);
  if (normalised.length < 3) {
    return false;
  }
  return FLIGHT_NUMBER_PATTERN.test(normalised);
}
__name(isValidFlightNumberFormat, "isValidFlightNumberFormat");
function formatFlightNumberForDisplay(value) {
  const normalised = normalizeFlightNumber(value);
  const match = normalised.match(/^([A-Z0-9]{2,3})(\d{1,4}[A-Z]?)$/i);
  if (!match) {
    return normalised;
  }
  return `${match[1]} ${match[2]}`;
}
__name(formatFlightNumberForDisplay, "formatFlightNumberForDisplay");
function airportMatches(code, servedCode) {
  if (!code) {
    return false;
  }
  const upper = code.trim().toUpperCase();
  const allowed = SERVED_AIRPORT_IATA[servedCode] ?? [servedCode];
  return allowed.includes(upper);
}
__name(airportMatches, "airportMatches");
function readScheduledLocal(scheduled) {
  if (scheduled?.local) {
    return scheduled.local;
  }
  if (scheduled?.utc) {
    return scheduled.utc;
  }
  return null;
}
__name(readScheduledLocal, "readScheduledLocal");
function formatLocalTime(isoLocal) {
  const match = isoLocal.match(/T(\d{2}:\d{2})/);
  if (match) {
    return match[1];
  }
  const parsed = new Date(isoLocal);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
  }
  return isoLocal;
}
__name(formatLocalTime, "formatLocalTime");
function formatIsoDate(isoLocal) {
  const match = isoLocal.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? isoLocal.slice(0, 10);
}
__name(formatIsoDate, "formatIsoDate");
function readAirlineName(flight) {
  return flight.airline?.name?.trim() || flight.airline?.iata?.trim() || "Airline";
}
__name(readAirlineName, "readAirlineName");
function flightMatchesAirport(flight, airportCode, direction) {
  const dep = flight.departure?.airport?.iata;
  const arr = flight.arrival?.airport?.iata;
  if (direction === "from-airport") {
    return airportMatches(arr, airportCode);
  }
  return airportMatches(dep, airportCode);
}
__name(flightMatchesAirport, "flightMatchesAirport");
function flightMatchesTripDate(flight, tripDate, direction) {
  const leg = direction === "from-airport" ? flight.arrival?.scheduledTime : flight.departure?.scheduledTime;
  const scheduledRaw = readScheduledLocal(leg);
  if (!scheduledRaw) {
    return false;
  }
  return formatIsoDate(scheduledRaw) === tripDate;
}
__name(flightMatchesTripDate, "flightMatchesTripDate");
function pickMatchingFlight(flights, airportCode, direction, tripDate) {
  const airportMatches2 = flights.filter(
    (flight) => flightMatchesAirport(flight, airportCode, direction)
  );
  const pool = airportMatches2.length > 0 ? airportMatches2 : flights;
  for (const flight of pool) {
    if (flightMatchesTripDate(flight, tripDate, direction)) {
      return flight;
    }
  }
  return pool[0] ?? null;
}
__name(pickMatchingFlight, "pickMatchingFlight");
function mapAeroFlight(flight, params) {
  const depAirport = flight.departure?.airport;
  const arrAirport = flight.arrival?.airport;
  const leg = params.direction === "from-airport" ? flight.arrival?.scheduledTime : flight.departure?.scheduledTime;
  const scheduledRaw = readScheduledLocal(leg);
  if (!scheduledRaw) {
    return null;
  }
  const relevantAirport = params.direction === "from-airport" ? arrAirport?.name ?? params.airportName : depAirport?.name ?? params.airportName;
  return {
    flightNumber: formatFlightNumberForDisplay(flight.number ?? params.flightNumber),
    airline: readAirlineName(flight),
    date: formatIsoDate(scheduledRaw) || params.fallbackDate,
    scheduledTime: formatLocalTime(scheduledRaw),
    scheduledTimeLabel: params.direction === "from-airport" ? "Arrives" : "Departs",
    airportCode: params.airportCode,
    airportName: relevantAirport,
    departureAirport: [depAirport?.iata, depAirport?.name].filter(Boolean).join(" \xB7 ") || "\u2014",
    arrivalAirport: [arrAirport?.iata, arrAirport?.name].filter(Boolean).join(" \xB7 ") || "\u2014",
    status: flight.status
  };
}
__name(mapAeroFlight, "mapAeroFlight");
async function fetchAeroDataBoxFlights(apiKey, flightNumber, tripDate, attempt = 0) {
  const encoded = encodeURIComponent(flightNumber);
  const query = "withAircraftImage=false&withLocation=false&withFlightPlan=false&dateLocalRole=Both";
  const url = tripDate ? `https://aerodatabox.p.rapidapi.com/flights/number/${encoded}/${tripDate}?${query}` : `https://aerodatabox.p.rapidapi.com/flights/number/${encoded}?${query}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-RapidAPI-Key": apiKey,
      "X-RapidAPI-Host": "aerodatabox.p.rapidapi.com"
    }
  });
  if (response.status === 429 && attempt < 1) {
    await new Promise((resolve) => setTimeout(resolve, 2e3));
    return fetchAeroDataBoxFlights(apiKey, flightNumber, tripDate, attempt + 1);
  }
  if (response.status === 404) {
    return { status: 404, flights: [] };
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    return {
      status: response.status,
      flights: [],
      message: body?.message ?? response.statusText
    };
  }
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    return { status: 502, flights: [], message: "Invalid flight lookup response" };
  }
  if (Array.isArray(payload)) {
    return { status: 200, flights: payload };
  }
  return {
    status: 200,
    flights: [],
    message: payload?.message ?? payload?.error
  };
}
__name(fetchAeroDataBoxFlights, "fetchAeroDataBoxFlights");
async function lookupFlightViaAeroDataBox(apiKey, params) {
  const flightNumber = normalizeFlightNumber(params.flightNumber);
  if (!isValidFlightNumberFormat(flightNumber)) {
    return {
      ok: false,
      error: "Enter a valid flight number (e.g. BA1234 or EZY456).",
      code: "invalid_format"
    };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.tripDate)) {
    return {
      ok: false,
      error: "Select your trip date before entering a flight number.",
      code: "invalid_format"
    };
  }
  let result = await fetchAeroDataBoxFlights(apiKey, flightNumber, params.tripDate);
  if (result.status === 401 || result.status === 403) {
    return {
      ok: false,
      error: "Flight lookup API key was rejected. Check your RapidAPI AeroDataBox subscription and secret.",
      code: "upstream_error"
    };
  }
  if (result.status === 429) {
    return {
      ok: false,
      error: "Flight verification is temporarily busy. You can still enter your flight number and continue.",
      code: "rate_limited"
    };
  }
  if (result.flights.length === 0 && (result.status === 404 || result.status === 200)) {
    result = await fetchAeroDataBoxFlights(apiKey, flightNumber);
    if (result.status === 429) {
      return {
        ok: false,
        error: "Flight verification is temporarily busy. You can still enter your flight number and continue.",
        code: "rate_limited"
      };
    }
  }
  if (result.status !== 200 && result.status !== 404) {
    return {
      ok: false,
      error: "Flight verification is temporarily unavailable. You can still enter your flight number and continue.",
      code: "upstream_error"
    };
  }
  if (result.flights.length === 0) {
    return {
      ok: false,
      error: "No flight found for that number on your selected date. Check the flight number, airport, and date match your ticket.",
      code: "not_found"
    };
  }
  const matched = pickMatchingFlight(
    result.flights,
    params.airportCode,
    params.direction,
    params.tripDate
  );
  if (!matched) {
    return {
      ok: false,
      error: `That flight does not ${params.direction === "from-airport" ? "arrive at" : "depart from"} ${params.airportName} on this date.`,
      code: "airport_mismatch"
    };
  }
  if (!flightMatchesAirport(matched, params.airportCode, params.direction)) {
    return {
      ok: false,
      error: `That flight does not ${params.direction === "from-airport" ? "arrive at" : "depart from"} ${params.airportName} on this date.`,
      code: "airport_mismatch"
    };
  }
  if (!flightMatchesTripDate(matched, params.tripDate, params.direction)) {
    const leg = params.direction === "from-airport" ? matched.arrival?.scheduledTime : matched.departure?.scheduledTime;
    const actualDate = readScheduledLocal(leg);
    const formatted = actualDate ? (/* @__PURE__ */ new Date(`${formatIsoDate(actualDate)}T12:00:00`)).toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short"
    }) : "another date";
    return {
      ok: false,
      error: `That flight operates on ${formatted}, not your selected trip date. Please update your trip date.`,
      code: "not_found"
    };
  }
  const mapped = mapAeroFlight(matched, {
    flightNumber,
    airportCode: params.airportCode,
    airportName: params.airportName,
    direction: params.direction,
    fallbackDate: params.tripDate
  });
  if (!mapped) {
    return {
      ok: false,
      error: "Flight found but schedule time was unavailable. Please double-check your flight details.",
      code: "upstream_error"
    };
  }
  return { ok: true, flight: mapped };
}
__name(lookupFlightViaAeroDataBox, "lookupFlightViaAeroDataBox");
async function lookupFlight(apiKey, params) {
  if (!apiKey?.trim()) {
    return {
      ok: false,
      error: "Flight verification is not configured yet.",
      code: "api_unavailable"
    };
  }
  return lookupFlightViaAeroDataBox(apiKey.trim(), params);
}
__name(lookupFlight, "lookupFlight");

// shared/sumup-checkout.ts
async function createSumUpHostedCheckout(apiKey, merchantCode, request) {
  const response = await fetch("https://api.sumup.com/v0.1/checkouts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      amount: request.amount,
      currency: "GBP",
      merchant_code: merchantCode,
      checkout_reference: request.checkoutReference,
      description: request.description.slice(0, 140),
      redirect_url: request.redirectUrl,
      hosted_checkout: {
        enabled: true
      }
    })
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.hosted_checkout_url || !payload.id) {
    const message = payload && typeof payload === "object" && "error_message" in payload ? String(payload.error_message) : "SumUp checkout creation failed";
    throw new Error(message);
  }
  return {
    checkoutId: payload.id,
    paymentUrl: payload.hosted_checkout_url,
    checkoutReference: request.checkoutReference
  };
}
__name(createSumUpHostedCheckout, "createSumUpHostedCheckout");
async function getSumUpCheckout(apiKey, checkoutId) {
  const response = await fetch(
    `https://api.sumup.com/v0.1/checkouts/${encodeURIComponent(checkoutId)}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`
      }
    }
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.id) {
    throw new Error("Could not retrieve SumUp checkout");
  }
  return payload;
}
__name(getSumUpCheckout, "getSumUpCheckout");
function isSumUpCheckoutPaid(checkout) {
  if (checkout.status === "PAID") {
    return true;
  }
  return checkout.transactions?.some((transaction) => transaction.status === "SUCCESSFUL") ?? false;
}
__name(isSumUpCheckoutPaid, "isSumUpCheckoutPaid");
function getSuccessfulTransactionCode(checkout) {
  return checkout.transactions?.find((transaction) => transaction.status === "SUCCESSFUL")?.transaction_code;
}
__name(getSuccessfulTransactionCode, "getSuccessfulTransactionCode");
function getSuccessfulTransactionId(checkout) {
  return checkout.transactions?.find((transaction) => transaction.status === "SUCCESSFUL")?.id;
}
__name(getSuccessfulTransactionId, "getSuccessfulTransactionId");
function mapHistoryItem(item) {
  const id = item.transaction_id?.trim();
  if (!id) {
    return null;
  }
  return {
    id,
    transaction_code: item.transaction_code,
    amount: item.amount,
    currency: item.currency,
    status: item.status
  };
}
__name(mapHistoryItem, "mapHistoryItem");
async function findSumUpTransactionByCode(apiKey, merchantCode, transactionCode) {
  const trimmed = transactionCode.trim();
  if (!trimmed) {
    return null;
  }
  const url = new URL(
    `https://api.sumup.com/v2.1/merchants/${encodeURIComponent(merchantCode)}/transactions/history`
  );
  url.searchParams.set("transaction_code", trimmed);
  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload && typeof payload === "object" && (payload.error_message || payload.message) ? String(payload.error_message ?? payload.message) : `Could not look up SumUp transaction (${response.status})`;
    throw new Error(message);
  }
  const match = payload?.items?.map(mapHistoryItem).find(
    (item) => Boolean(item) && (item.transaction_code?.trim() === trimmed || item.id.trim() === trimmed)
  ) ?? payload?.items?.map(mapHistoryItem).find((item) => Boolean(item));
  return match ?? null;
}
__name(findSumUpTransactionByCode, "findSumUpTransactionByCode");
async function listSumUpCheckoutsByReference(apiKey, checkoutReference) {
  const trimmed = checkoutReference.trim();
  if (!trimmed) {
    return [];
  }
  const url = new URL("https://api.sumup.com/v0.1/checkouts");
  url.searchParams.set("checkout_reference", trimmed);
  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(payload)) {
    return [];
  }
  return payload.filter((checkout) => Boolean(checkout?.id));
}
__name(listSumUpCheckoutsByReference, "listSumUpCheckoutsByReference");
function transactionFromCheckout(checkout) {
  const transactionId = getSuccessfulTransactionId(checkout);
  if (!transactionId) {
    return null;
  }
  return {
    id: transactionId,
    transaction_code: getSuccessfulTransactionCode(checkout),
    amount: checkout.amount,
    currency: checkout.currency,
    status: "SUCCESSFUL"
  };
}
__name(transactionFromCheckout, "transactionFromCheckout");
async function resolveSumUpTransactionForRefund(apiKey, merchantCode, paymentReference, checkoutId) {
  const trimmed = paymentReference.trim();
  if (!trimmed) {
    return null;
  }
  if (checkoutId?.trim()) {
    try {
      const checkout = await getSumUpCheckout(apiKey, checkoutId.trim());
      const fromCheckout = transactionFromCheckout(checkout);
      if (fromCheckout) {
        return fromCheckout;
      }
    } catch {
    }
  }
  if (merchantCode.trim()) {
    try {
      const byCode = await findSumUpTransactionByCode(apiKey, merchantCode.trim(), trimmed);
      if (byCode) {
        return byCode;
      }
    } catch {
    }
  }
  const checkouts = await listSumUpCheckoutsByReference(apiKey, trimmed);
  for (const checkout of checkouts) {
    const fromCheckout = transactionFromCheckout(checkout);
    if (fromCheckout) {
      return fromCheckout;
    }
  }
  return null;
}
__name(resolveSumUpTransactionForRefund, "resolveSumUpTransactionForRefund");
async function refundSumUpTransaction(apiKey, transactionId, amount, merchantCode) {
  const body = JSON.stringify(amount !== void 0 ? { amount } : {});
  if (merchantCode?.trim()) {
    const modernResponse = await fetch(
      `https://api.sumup.com/v1.0/merchants/${encodeURIComponent(merchantCode.trim())}/payments/${encodeURIComponent(transactionId)}/refunds`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body
      }
    );
    if (modernResponse.ok) {
      const modernPayload = await modernResponse.json().catch(() => null);
      return {
        refundedAmount: modernPayload?.amount ?? amount,
        currency: modernPayload?.currency
      };
    }
  }
  const response = await fetch(
    `https://api.sumup.com/v0.1/me/refund/${encodeURIComponent(transactionId)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body
    }
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload && typeof payload === "object" && payload.error_message ? String(payload.error_message) : `SumUp refund failed (${response.status})`;
    throw new Error(message);
  }
  return {
    refundedAmount: payload?.amount,
    currency: payload?.currency
  };
}
__name(refundSumUpTransaction, "refundSumUpTransaction");
function buildCheckoutReference(prefix = "matni") {
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return `${prefix}-${Date.now()}-${random}`;
}
__name(buildCheckoutReference, "buildCheckoutReference");

// src/google-calendar.ts
var CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";
var TOKEN_URL = "https://oauth2.googleapis.com/token";
var TIME_ZONE = "Europe/London";
var DEFAULT_TRANSFER_DURATION_MINUTES = 90;
var DEFAULT_TOUR_DURATION_HOURS = 8;
var BUSINESS_NAME = "My Airport Taxi NI";
var BUSINESS_WEBSITE2 = "https://www.myairporttaxini.co.uk";
var BUSINESS_LOGO_URL = `${BUSINESS_WEBSITE2}/google-business-logo.png`;
function base64UrlEncode(input) {
  let bytes;
  if (typeof input === "string") {
    bytes = new TextEncoder().encode(input);
  } else if (input instanceof ArrayBuffer) {
    bytes = new Uint8Array(input);
  } else {
    bytes = input;
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
__name(base64UrlEncode, "base64UrlEncode");
function pemToArrayBuffer(pem) {
  const normalized = pem.includes("\\n") ? pem.replace(/\\n/g, "\n") : pem;
  const b64 = normalized.replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
__name(pemToArrayBuffer, "pemToArrayBuffer");
async function importPrivateKey(pem) {
  return crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(pem),
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );
}
__name(importPrivateKey, "importPrivateKey");
function parseServiceAccountJson(raw) {
  let cleaned = raw.trim().replace(/^\uFEFF/, "");
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }
  const envPrefix = cleaned.match(/^GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON\s*=\s*/i);
  if (envPrefix) {
    cleaned = cleaned.slice(envPrefix[0].length).trim();
  }
  if (cleaned.startsWith('"') && cleaned.endsWith('"') || cleaned.startsWith("'") && cleaned.endsWith("'")) {
    try {
      const unquoted = JSON.parse(cleaned);
      if (typeof unquoted === "string") {
        cleaned = unquoted.trim();
      }
    } catch {
    }
  }
  cleaned = cleaned.replace(/^(?:false|null|true)\s*/i, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (firstError) {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      parsed = JSON.parse(cleaned.slice(start, end + 1));
    } else {
      throw firstError;
    }
  }
  if (!parsed.client_email?.trim() || !parsed.private_key?.trim()) {
    throw new Error("Invalid Google service account JSON");
  }
  return {
    client_email: parsed.client_email.trim(),
    private_key: parsed.private_key
  };
}
__name(parseServiceAccountJson, "parseServiceAccountJson");
async function getGoogleAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1e3);
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64UrlEncode(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: CALENDAR_SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600
    })
  );
  const unsigned = `${header}.${claim}`;
  const key = await importPrivateKey(serviceAccount.private_key);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned)
  );
  const jwt = `${unsigned}.${base64UrlEncode(signature)}`;
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    })
  });
  if (!response.ok) {
    throw new Error(`Google token exchange failed (${response.status})`);
  }
  const payload = await response.json();
  if (!payload.access_token) {
    throw new Error("Google token response missing access_token");
  }
  return payload.access_token;
}
__name(getGoogleAccessToken, "getGoogleAccessToken");
function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
__name(isValidDate, "isValidDate");
function isValidTime(value) {
  return /^\d{2}:\d{2}$/.test(value);
}
__name(isValidTime, "isValidTime");
function addMinutes(dateTimeLocal, minutes) {
  const [datePart, timePart] = dateTimeLocal.split("T");
  if (!datePart || !timePart) {
    throw new Error(`Invalid datetime: ${dateTimeLocal}`);
  }
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  if ([year, month, day, hour, minute].some((part) => !Number.isFinite(part))) {
    throw new Error(`Invalid datetime: ${dateTimeLocal}`);
  }
  const totalMinutes = hour * 60 + minute + minutes;
  const date = new Date(Date.UTC(year, month - 1, day, 0, totalMinutes));
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid datetime: ${dateTimeLocal}`);
  }
  const pad = /* @__PURE__ */ __name((n) => String(n).padStart(2, "0"), "pad");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}
__name(addMinutes, "addMinutes");
function buildTransferDescription(booking, message) {
  const header = [
    BUSINESS_NAME,
    BUSINESS_WEBSITE2,
    `Logo: ${BUSINESS_LOGO_URL}`,
    ""
  ];
  if (message?.trim()) {
    return [...header, message.trim()].join("\n");
  }
  const lines = [
    ...header,
    `Trip: ${booking.tripLabel}`,
    `Pickup: ${booking.pickupLabel}`,
    `Drop-off: ${booking.dropoffLabel}`,
    booking.customerEmail ? `Email: ${booking.customerEmail}` : "",
    booking.mobileNumber ? `Mobile: ${booking.mobileNumber}` : "",
    booking.flightNumber ? `Flight for going: ${booking.flightNumber}` : "",
    booking.returnFlightNumber ? `Flight for collection: ${booking.returnFlightNumber}` : "",
    typeof booking.passengers === "number" ? `Passengers: ${booking.passengers}` : "",
    typeof booking.suitcases === "number" ? `Suitcases: ${booking.suitcases}` : "",
    booking.vehicle ? `Vehicle: ${booking.vehicle}` : "",
    booking.estimatedPrice ? `Estimated price: ${booking.estimatedPrice}` : "",
    booking.paid && booking.amountPaid ? `Amount paid: ${booking.amountPaid}` : "",
    booking.paid && booking.paymentReference ? `Payment reference: ${booking.paymentReference}` : "",
    booking.paid ? "Status: PAID (SumUp)" : "",
    "",
    `Source: ${BUSINESS_NAME} website booking`
  ];
  return lines.filter(Boolean).join("\n");
}
__name(buildTransferDescription, "buildTransferDescription");
function buildTourDescription(tour, message) {
  const header = [
    BUSINESS_NAME,
    BUSINESS_WEBSITE2,
    `Logo: ${BUSINESS_LOGO_URL}`,
    ""
  ];
  if (message?.trim()) {
    return [...header, message.trim()].join("\n");
  }
  const lines = [
    ...header,
    `Day trip: ${tour.tourTitle}`,
    tour.pickupLocation ? `Pickup: ${tour.pickupLocation}` : "",
    typeof tour.groupSize === "number" ? `Group size: ${tour.groupSize}` : "",
    tour.customerEmail ? `Email: ${tour.customerEmail}` : "",
    tour.mobileNumber ? `Mobile: ${tour.mobileNumber}` : "",
    tour.notes ? `Notes: ${tour.notes}` : "",
    "",
    `Source: ${BUSINESS_NAME} website booking`
  ];
  return lines.filter(Boolean).join("\n");
}
__name(buildTourDescription, "buildTourDescription");
function buildTransferSummary(booking, suffix = "") {
  const paidTag = booking.paid && booking.amountPaid ? ` [PAID ${booking.amountPaid}]` : "";
  return `${BUSINESS_NAME} \u2014 ${booking.tripLabel} \u2014 ${booking.customerName}${paidTag}${suffix}`;
}
__name(buildTransferSummary, "buildTransferSummary");
function buildTransferCalendarEvents(booking, message) {
  const description = buildTransferDescription(booking, message);
  if (!isValidDate(booking.tripDate) || !isValidTime(booking.tripTime)) {
    const startDateTime = formatLondonDateTime(new Date(Date.now() + 60 * 60 * 1e3));
    return [
      {
        summary: buildTransferSummary(booking, " (Confirm date/time)"),
        description,
        location: booking.pickupLabel || void 0,
        startDateTime,
        endDateTime: addMinutes(startDateTime, DEFAULT_TRANSFER_DURATION_MINUTES),
        attendeeEmail: booking.customerEmail?.trim() || void 0
      }
    ];
  }
  const outboundStart = `${booking.tripDate}T${booking.tripTime}`;
  const events = [
    {
      summary: buildTransferSummary(booking),
      description,
      location: booking.pickupLabel,
      startDateTime: outboundStart,
      endDateTime: addMinutes(outboundStart, DEFAULT_TRANSFER_DURATION_MINUTES),
      attendeeEmail: booking.customerEmail?.trim() || void 0
    }
  ];
  if (booking.returnJourney && booking.returnDate && booking.returnTime && isValidDate(booking.returnDate) && isValidTime(booking.returnTime)) {
    const returnStart = `${booking.returnDate}T${booking.returnTime}`;
    events.push({
      summary: buildTransferSummary(booking, " (Return)"),
      description,
      location: booking.dropoffLabel,
      startDateTime: returnStart,
      endDateTime: addMinutes(returnStart, DEFAULT_TRANSFER_DURATION_MINUTES),
      attendeeEmail: booking.customerEmail?.trim() || void 0
    });
  }
  return events;
}
__name(buildTransferCalendarEvents, "buildTransferCalendarEvents");
function buildTourCalendarEvents(tour, message) {
  if (!isValidDate(tour.travelDate)) {
    throw new Error("Tour booking is missing a valid travel date");
  }
  const startDateTime = `${tour.travelDate}T09:00`;
  return [
    {
      summary: `${BUSINESS_NAME} \u2014 ${tour.tourTitle} \u2014 ${tour.customerName}`,
      description: buildTourDescription(tour, message),
      location: tour.pickupLocation?.trim() || void 0,
      startDateTime,
      endDateTime: addMinutes(startDateTime, DEFAULT_TOUR_DURATION_HOURS * 60),
      attendeeEmail: tour.customerEmail?.trim() || void 0
    }
  ];
}
__name(buildTourCalendarEvents, "buildTourCalendarEvents");
function formatLondonDateTime(date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const get = /* @__PURE__ */ __name((type) => parts.find((part) => part.type === type)?.value ?? "00", "get");
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
__name(formatLondonDateTime, "formatLondonDateTime");
function buildEventsFromBookingMessage(customerName, message) {
  const tripMatch = message.match(/^Trip:\s*(.+)$/m);
  const tourMatch = message.match(/^Day trip:\s*(.+)$/m);
  const pickupMatch = message.match(/^Pickup(?: location)?:\s*(.+)$/m);
  const dropoffMatch = message.match(/^Drop-off:\s*(.+)$/m);
  const outboundDate = message.match(/^(?:Outbound date|Date|Preferred date):\s*(\d{4}-\d{2}-\d{2})$/m)?.[1] ?? "";
  const outboundTime = message.match(/^(?:Outbound time|Time):\s*(\d{2}:\d{2})$/m)?.[1] ?? "";
  const returnDate = message.match(/^Return date:\s*(\d{4}-\d{2}-\d{2})$/m)?.[1] ?? "";
  const returnTime = message.match(/^Return time:\s*(\d{2}:\d{2})$/m)?.[1] ?? "";
  const flightNumber = message.match(/^Flight number:\s*(.+)$/m)?.[1]?.trim() ?? "";
  if (tourMatch && isValidDate(outboundDate)) {
    return buildTourCalendarEvents(
      {
        customerName,
        tourTitle: tourMatch[1].trim(),
        travelDate: outboundDate,
        pickupLocation: pickupMatch?.[1]?.trim()
      },
      message
    );
  }
  if (isValidDate(outboundDate) && isValidTime(outboundTime)) {
    return buildTransferCalendarEvents(
      {
        customerName,
        tripLabel: tripMatch?.[1]?.trim() || "Transfer booking",
        pickupLabel: pickupMatch?.[1]?.trim() || "",
        dropoffLabel: dropoffMatch?.[1]?.trim() || "",
        returnJourney: Boolean(returnDate && returnTime),
        tripDate: outboundDate,
        tripTime: outboundTime,
        returnDate,
        returnTime,
        flightNumber
      },
      message
    );
  }
  const startDateTime = formatLondonDateTime(new Date(Date.now() + 60 * 60 * 1e3));
  return [
    {
      summary: `${BUSINESS_NAME} \u2014 Website booking \u2014 ${customerName}`,
      description: message,
      startDateTime,
      endDateTime: addMinutes(startDateTime, DEFAULT_TRANSFER_DURATION_MINUTES)
    }
  ];
}
__name(buildEventsFromBookingMessage, "buildEventsFromBookingMessage");
async function createCalendarEvent(accessToken, calendarId, event) {
  const body = {
    summary: event.summary,
    description: event.description,
    location: event.location,
    start: {
      dateTime: `${event.startDateTime}:00`,
      timeZone: TIME_ZONE
    },
    end: {
      dateTime: `${event.endDateTime}:00`,
      timeZone: TIME_ZONE
    },
    source: {
      title: BUSINESS_NAME,
      url: BUSINESS_WEBSITE2
    },
    colorId: "9"
  };
  void event.attendeeEmail;
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    }
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Calendar create failed (${response.status}): ${detail.slice(0, 200)}`);
  }
  const payload = await response.json();
  if (!payload.id) {
    throw new Error("Calendar create returned no event id");
  }
  return payload.id;
}
__name(createCalendarEvent, "createCalendarEvent");
var CANCELLED_SUMMARY_PREFIX = "CANCELLED \u2014 ";
function buildCancelledEventPatch(event, refundNote) {
  const summary = event.summary?.startsWith(CANCELLED_SUMMARY_PREFIX) ? event.summary : `${CANCELLED_SUMMARY_PREFIX}${event.summary ?? "Booking"}`;
  const refundSection = refundNote?.trim() ? `

--- REFUND ---
${refundNote.trim()}` : "";
  const description = `${event.description ?? ""}${refundSection}`.trim();
  return {
    status: "cancelled",
    summary,
    ...description ? { description } : {},
    colorId: "11"
  };
}
__name(buildCancelledEventPatch, "buildCancelledEventPatch");
async function cancelCalendarEvent(accessToken, calendarId, eventId, options) {
  const eventUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
  const getResponse = await fetch(eventUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  if (getResponse.status === 404 || getResponse.status === 410) {
    return;
  }
  if (!getResponse.ok) {
    const detail = await getResponse.text().catch(() => "");
    throw new Error(`Calendar fetch failed (${getResponse.status}): ${detail.slice(0, 200)}`);
  }
  const event = await getResponse.json();
  if (event.status === "cancelled") {
    return;
  }
  const response = await fetch(eventUrl, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(buildCancelledEventPatch(event, options?.refundNote))
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Calendar cancel failed (${response.status}): ${detail.slice(0, 200)}`);
  }
}
__name(cancelCalendarEvent, "cancelCalendarEvent");
async function cancelCalendarEvents(accessToken, calendarId, eventIds, options) {
  let cancelled = 0;
  const errors = [];
  for (const eventId of eventIds) {
    try {
      await cancelCalendarEvent(accessToken, calendarId, eventId, options);
      cancelled += 1;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Unknown calendar cancel error");
    }
  }
  return { cancelled, errors };
}
__name(cancelCalendarEvents, "cancelCalendarEvents");
async function rescheduleCalendarEvent(accessToken, calendarId, eventId, options) {
  const eventUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
  const getResponse = await fetch(eventUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  if (getResponse.status === 404 || getResponse.status === 410) {
    return;
  }
  if (!getResponse.ok) {
    const detail = await getResponse.text().catch(() => "");
    throw new Error(`Calendar fetch failed (${getResponse.status}): ${detail.slice(0, 200)}`);
  }
  const event = await getResponse.json();
  if (event.status === "cancelled") {
    return;
  }
  const updateSection = options.updateNote?.trim() ? `

--- UPDATED ---
${options.updateNote.trim()}` : "";
  const description = `${event.description ?? ""}${updateSection}`.trim();
  const body = {
    start: {
      dateTime: `${options.startDateTime}:00`,
      timeZone: TIME_ZONE
    },
    end: {
      dateTime: `${options.endDateTime}:00`,
      timeZone: TIME_ZONE
    },
    ...options.location ? { location: options.location } : {},
    ...description ? { description } : {}
  };
  const response = await fetch(eventUrl, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Calendar reschedule failed (${response.status}): ${detail.slice(0, 200)}`);
  }
}
__name(rescheduleCalendarEvent, "rescheduleCalendarEvent");
async function rescheduleCalendarEvents(accessToken, calendarId, eventIds, options) {
  let updated = 0;
  const errors = [];
  for (const eventId of eventIds) {
    try {
      await rescheduleCalendarEvent(accessToken, calendarId, eventId, options);
      updated += 1;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Unknown calendar update error");
    }
  }
  return { updated, errors };
}
__name(rescheduleCalendarEvents, "rescheduleCalendarEvents");
function transferEventEndDateTime(startDateTime) {
  return addMinutes(startDateTime, DEFAULT_TRANSFER_DURATION_MINUTES);
}
__name(transferEventEndDateTime, "transferEventEndDateTime");
async function logBookingsToGoogleCalendar(options) {
  const serviceAccount = parseServiceAccountJson(options.serviceAccountJson);
  const accessToken = await getGoogleAccessToken(serviceAccount);
  let events;
  if (options.booking) {
    events = buildTransferCalendarEvents(options.booking, options.message);
  } else if (options.tour) {
    events = buildTourCalendarEvents(options.tour, options.message);
  } else {
    events = buildEventsFromBookingMessage(options.customerName, options.message);
  }
  const eventIds = [];
  for (const event of events) {
    const eventId = await createCalendarEvent(accessToken, options.calendarId, event);
    eventIds.push(eventId);
  }
  return eventIds;
}
__name(logBookingsToGoogleCalendar, "logBookingsToGoogleCalendar");

// shared/tracking.ts
var LOCATION_STALE_MS = 5 * 60 * 1e3;
function isLocationFresh(updatedAt, now = Date.now(), maxAgeMs = LOCATION_STALE_MS) {
  if (!updatedAt) {
    return false;
  }
  const updated = new Date(updatedAt).getTime();
  if (Number.isNaN(updated)) {
    return false;
  }
  return now - updated < maxAgeMs;
}
__name(isLocationFresh, "isLocationFresh");
var TIME_ZONE2 = "Europe/London";
var OPEN_BEFORE_MS = 2 * 60 * 60 * 1e3;
var CLOSE_AFTER_MS = 90 * 60 * 1e3;
var REVIEW_REQUEST_DELAY_MS = 24 * 60 * 60 * 1e3;
function buildPickupDateTimeLocal(tripDate, tripTime) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tripDate) || !/^\d{2}:\d{2}$/.test(tripTime)) {
    return null;
  }
  return `${tripDate}T${tripTime}`;
}
__name(buildPickupDateTimeLocal, "buildPickupDateTimeLocal");
function parseLondonLocal(isoLocal) {
  const match = isoLocal.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) {
    return null;
  }
  const [, year, month, day, hour, minute] = match;
  const utcGuess = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute)
  );
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE2,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });
  for (let offsetMinutes = -90; offsetMinutes <= 90; offsetMinutes += 15) {
    const candidate = new Date(utcGuess + offsetMinutes * 60 * 1e3);
    const parts = formatter.formatToParts(candidate);
    const get = /* @__PURE__ */ __name((type) => parts.find((part) => part.type === type)?.value ?? "", "get");
    const formatted = `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
    if (formatted === isoLocal) {
      return candidate;
    }
  }
  return new Date(utcGuess);
}
__name(parseLondonLocal, "parseLondonLocal");
function getJobCompletionAt(pickupAt) {
  const pickup = parseLondonLocal(pickupAt);
  if (!pickup) {
    return null;
  }
  return new Date(pickup.getTime() + CLOSE_AFTER_MS);
}
__name(getJobCompletionAt, "getJobCompletionAt");
function getReviewRequestEligibleAt(pickupAt) {
  const completedAt = getJobCompletionAt(pickupAt);
  if (!completedAt) {
    return null;
  }
  return new Date(completedAt.getTime() + REVIEW_REQUEST_DELAY_MS);
}
__name(getReviewRequestEligibleAt, "getReviewRequestEligibleAt");
function isReviewRequestDue(pickupAt, now = Date.now()) {
  const eligibleAt = getReviewRequestEligibleAt(pickupAt);
  return eligibleAt !== null && now >= eligibleAt.getTime();
}
__name(isReviewRequestDue, "isReviewRequestDue");
function getTrackingWindow(pickupAt, now = /* @__PURE__ */ new Date()) {
  const pickup = parseLondonLocal(pickupAt);
  if (!pickup) {
    return {
      open: false,
      opensAt: pickupAt,
      closesAt: pickupAt,
      pickupAt,
      reason: "too_early"
    };
  }
  const opensAt = new Date(pickup.getTime() - OPEN_BEFORE_MS);
  const closesAt = new Date(pickup.getTime() + CLOSE_AFTER_MS);
  const open = now >= opensAt && now <= closesAt;
  return {
    open,
    opensAt: opensAt.toISOString(),
    closesAt: closesAt.toISOString(),
    pickupAt,
    reason: now < opensAt ? "too_early" : now > closesAt ? "too_late" : "open"
  };
}
__name(getTrackingWindow, "getTrackingWindow");
function formatLondonDateTime2(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString("en-GB", {
    timeZone: TIME_ZONE2,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}
__name(formatLondonDateTime2, "formatLondonDateTime");
function buildPublicTrackUrl(token, siteUrl = "https://www.myairporttaxini.co.uk") {
  return `${siteUrl.replace(/\/$/, "")}/track/?id=${encodeURIComponent(token)}`;
}
__name(buildPublicTrackUrl, "buildPublicTrackUrl");
function generateTrackingToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
__name(generateTrackingToken, "generateTrackingToken");

// src/tracking-store.ts
var JOB_PREFIX = "track:job:";
var DAY_INDEX_PREFIX = "track:day:";
var REF_INDEX_PREFIX = "track:ref:";
var DAY_INDEX_TTL = 60 * 60 * 24 * 45;
var PAYMENT_REF_SEARCH_DAYS_BACK = 45;
var PAYMENT_REF_SEARCH_DAYS_AHEAD = 60;
function jobKey(token) {
  return `${JOB_PREFIX}${token}`;
}
__name(jobKey, "jobKey");
function dayIndexKey(tripDate) {
  return `${DAY_INDEX_PREFIX}${tripDate}`;
}
__name(dayIndexKey, "dayIndexKey");
function refIndexKey(paymentReference) {
  return `${REF_INDEX_PREFIX}${paymentReference.trim()}`;
}
__name(refIndexKey, "refIndexKey");
async function indexTrackingJobPaymentReference(store, paymentReference, token) {
  const trimmed = paymentReference.trim();
  if (!trimmed) {
    return;
  }
  await store.put(refIndexKey(trimmed), token, {
    expirationTtl: DAY_INDEX_TTL
  });
}
__name(indexTrackingJobPaymentReference, "indexTrackingJobPaymentReference");
function trackingStoreConfigured(store) {
  return Boolean(store);
}
__name(trackingStoreConfigured, "trackingStoreConfigured");
async function createTrackingJobFromBooking(store, booking, paymentReference) {
  const pickupAt = buildPickupDateTimeLocal(booking.tripDate, booking.tripTime);
  if (!pickupAt) {
    return null;
  }
  const token = generateTrackingToken();
  const record = {
    token,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    customerName: booking.customerName,
    customerEmail: booking.customerEmail,
    customerMobile: booking.mobileNumber,
    pickupLabel: booking.pickupLabel,
    dropoffLabel: booking.dropoffLabel,
    tripDate: booking.tripDate,
    tripTime: booking.tripTime,
    pickupAt,
    paymentReference,
    sharingActive: false
  };
  if (booking.isAirportTrip) {
    record.isAirportTrip = true;
    if (booking.airportCode?.trim()) {
      record.airportCode = booking.airportCode.trim().toUpperCase();
    }
    if (typeof booking.isFromAirport === "boolean") {
      record.isFromAirport = booking.isFromAirport;
    }
    if (booking.flightNumber?.trim()) {
      record.flightNumber = booking.flightNumber.trim().toUpperCase();
    }
  }
  if (booking.termsAcceptedAt?.trim()) {
    record.termsAcceptedAt = booking.termsAcceptedAt.trim();
  }
  if (booking.termsVersion?.trim()) {
    record.termsVersion = booking.termsVersion.trim();
  }
  await store.put(jobKey(token), JSON.stringify(record), {
    expirationTtl: DAY_INDEX_TTL
  });
  const indexKey = dayIndexKey(booking.tripDate);
  const existing = await store.get(indexKey, "json");
  const tokens = Array.isArray(existing) ? existing : [];
  if (!tokens.includes(token)) {
    tokens.push(token);
    await store.put(indexKey, JSON.stringify(tokens), {
      expirationTtl: DAY_INDEX_TTL
    });
  }
  if (paymentReference?.trim()) {
    await indexTrackingJobPaymentReference(store, paymentReference, token);
  }
  return record;
}
__name(createTrackingJobFromBooking, "createTrackingJobFromBooking");
async function getTrackingJob(store, token) {
  const record = await store.get(jobKey(token), "json");
  if (!record?.token) {
    return null;
  }
  return record;
}
__name(getTrackingJob, "getTrackingJob");
async function saveTrackingJob(store, record) {
  await store.put(jobKey(record.token), JSON.stringify(record), {
    expirationTtl: DAY_INDEX_TTL
  });
  if (record.paymentReference?.trim()) {
    await indexTrackingJobPaymentReference(store, record.paymentReference, record.token);
  }
}
__name(saveTrackingJob, "saveTrackingJob");
async function reindexTrackingJobDate(store, token, oldDate, newDate) {
  if (oldDate === newDate) {
    return;
  }
  const oldTokens = await store.get(dayIndexKey(oldDate), "json");
  if (Array.isArray(oldTokens)) {
    const filtered = oldTokens.filter((entry) => entry !== token);
    if (filtered.length === 0) {
      await store.delete(dayIndexKey(oldDate));
    } else {
      await store.put(dayIndexKey(oldDate), JSON.stringify(filtered), {
        expirationTtl: DAY_INDEX_TTL
      });
    }
  }
  const newTokens = await store.get(dayIndexKey(newDate), "json");
  const merged = Array.isArray(newTokens) ? newTokens : [];
  if (!merged.includes(token)) {
    merged.push(token);
    await store.put(dayIndexKey(newDate), JSON.stringify(merged), {
      expirationTtl: DAY_INDEX_TTL
    });
  }
}
__name(reindexTrackingJobDate, "reindexTrackingJobDate");
async function listTrackingJobsForDate(store, tripDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tripDate)) {
    return [];
  }
  const tokens = await store.get(dayIndexKey(tripDate), "json");
  if (!Array.isArray(tokens) || tokens.length === 0) {
    return [];
  }
  const jobs = await Promise.all(tokens.map((token) => getTrackingJob(store, token)));
  return jobs.filter((job) => Boolean(job)).sort((a, b) => a.pickupAt.localeCompare(b.pickupAt));
}
__name(listTrackingJobsForDate, "listTrackingJobsForDate");
function londonDateString(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}
__name(londonDateString, "londonDateString");
function shiftDateString(dateStr, days) {
  const base = /* @__PURE__ */ new Date(`${dateStr}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}
__name(shiftDateString, "shiftDateString");
async function listTrackingJobsForDateRange(store, fromDate, toDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
    return [];
  }
  if (fromDate > toDate) {
    return [];
  }
  const jobs = [];
  let cursor = fromDate;
  while (cursor <= toDate) {
    const dayJobs = await listTrackingJobsForDate(store, cursor);
    jobs.push(...dayJobs);
    cursor = shiftDateString(cursor, 1);
  }
  return jobs.sort((a, b) => a.pickupAt.localeCompare(b.pickupAt));
}
__name(listTrackingJobsForDateRange, "listTrackingJobsForDateRange");
async function listUpcomingTrackingJobs(store, daysAhead = 60) {
  const today = londonDateString(/* @__PURE__ */ new Date());
  const end = shiftDateString(today, Math.max(0, daysAhead));
  return listTrackingJobsForDateRange(store, today, end);
}
__name(listUpcomingTrackingJobs, "listUpcomingTrackingJobs");
async function listTrackingJobsForRecentDays(store, daysBack) {
  const today = londonDateString(/* @__PURE__ */ new Date());
  const jobs = [];
  for (let offset = 0; offset <= daysBack; offset += 1) {
    const tripDate = shiftDateString(today, -offset);
    const dayJobs = await listTrackingJobsForDate(store, tripDate);
    jobs.push(...dayJobs);
  }
  return jobs;
}
__name(listTrackingJobsForRecentDays, "listTrackingJobsForRecentDays");
async function findTrackingJobByPaymentReference(store, paymentReference) {
  const trimmed = paymentReference.trim();
  if (!trimmed) {
    return null;
  }
  const indexedToken = await store.get(refIndexKey(trimmed));
  if (indexedToken) {
    const indexedJob = await getTrackingJob(store, indexedToken);
    if (indexedJob?.paymentReference?.trim() === trimmed) {
      return indexedJob;
    }
  }
  const today = londonDateString(/* @__PURE__ */ new Date());
  const fromDate = shiftDateString(today, -PAYMENT_REF_SEARCH_DAYS_BACK);
  const toDate = shiftDateString(today, PAYMENT_REF_SEARCH_DAYS_AHEAD);
  const jobs = await listTrackingJobsForDateRange(store, fromDate, toDate);
  const match = jobs.find((job) => job.paymentReference?.trim() === trimmed) ?? null;
  if (match) {
    await indexTrackingJobPaymentReference(store, trimmed, match.token);
  }
  return match;
}
__name(findTrackingJobByPaymentReference, "findTrackingJobByPaymentReference");
async function markTrackingJobRefunded(store, token, refundAmountLabel) {
  const record = await getTrackingJob(store, token);
  if (!record) {
    return false;
  }
  const updated = {
    ...record,
    sharingActive: false,
    customerSharingActive: false,
    refundedAt: (/* @__PURE__ */ new Date()).toISOString(),
    ...refundAmountLabel?.trim() ? { refundAmountLabel: refundAmountLabel.trim() } : {}
  };
  await saveTrackingJob(store, updated);
  return true;
}
__name(markTrackingJobRefunded, "markTrackingJobRefunded");

// shared/paid-booking-record.ts
function paidBookingRefKey(paymentReference) {
  return `booking:ref:${paymentReference.trim()}`;
}
__name(paidBookingRefKey, "paidBookingRefKey");

// src/paid-booking-store.ts
function paidBookingStoreConfigured(store) {
  return Boolean(store);
}
__name(paidBookingStoreConfigured, "paidBookingStoreConfigured");
async function savePaidBookingRecord(store, record) {
  await store.put(paidBookingRefKey(record.paymentReference), JSON.stringify(record), {
    expirationTtl: 60 * 60 * 24 * 400
  });
}
__name(savePaidBookingRecord, "savePaidBookingRecord");
async function getPaidBookingRecord(store, paymentReference) {
  const record = await store.get(paidBookingRefKey(paymentReference), "json");
  if (!record?.paymentReference) {
    return null;
  }
  return record;
}
__name(getPaidBookingRecord, "getPaidBookingRecord");
async function markPaidBookingRefunded(store, paymentReference, refundAmountLabel) {
  const record = await getPaidBookingRecord(store, paymentReference);
  if (!record) {
    return null;
  }
  const updated = {
    ...record,
    status: "refunded",
    refundedAt: (/* @__PURE__ */ new Date()).toISOString(),
    refundAmountLabel
  };
  await savePaidBookingRecord(store, updated);
  return updated;
}
__name(markPaidBookingRefunded, "markPaidBookingRefunded");
async function updatePaidBookingFields(store, paymentReference, fields) {
  const record = await getPaidBookingRecord(store, paymentReference);
  if (!record || record.status === "refunded") {
    return null;
  }
  const cleaned = Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== void 0)
  );
  if (Object.keys(cleaned).length === 0) {
    return record;
  }
  const updated = {
    ...record,
    ...cleaned
  };
  await savePaidBookingRecord(store, updated);
  return updated;
}
__name(updatePaidBookingFields, "updatePaidBookingFields");

// src/driver-auth.ts
function normalizeKey(value) {
  return value.replace(/^\uFEFF/, "").trim();
}
__name(normalizeKey, "normalizeKey");
function configuredKeys(env) {
  const keys = [env.DRIVER_ACCESS_KEY, env.OWNER_ACCESS_KEY].map((value) => value ? normalizeKey(value) : "").filter(Boolean);
  return [...new Set(keys)];
}
__name(configuredKeys, "configuredKeys");
function readProvidedDriverKey(request) {
  const headerKey = request.headers.get("X-Driver-Key") ?? "";
  const ownerKey = request.headers.get("X-Owner-Key") ?? "";
  const urlKey = new URL(request.url).searchParams.get("key") ?? "";
  return normalizeKey(headerKey || ownerKey || urlKey);
}
__name(readProvidedDriverKey, "readProvidedDriverKey");
function driverAuthStatus(env) {
  return {
    hasDriverKey: Boolean(env.DRIVER_ACCESS_KEY?.trim()),
    hasOwnerKey: Boolean(env.OWNER_ACCESS_KEY?.trim())
  };
}
__name(driverAuthStatus, "driverAuthStatus");
function driverAuthorized(request, env) {
  const keys = configuredKeys(env);
  if (keys.length === 0) {
    return false;
  }
  const provided = readProvidedDriverKey(request);
  if (!provided) {
    return false;
  }
  return keys.includes(provided);
}
__name(driverAuthorized, "driverAuthorized");
function isDriverAuthConfigured(env) {
  return configuredKeys(env).length > 0;
}
__name(isDriverAuthConfigured, "isDriverAuthConfigured");

// src/worker-email.ts
var DEFAULT_BOOKING_EMAIL = "bookings@myairporttaxini.co.uk";
var BUSINESS_NAME2 = "My Airport Taxi NI";
var WORKER_PUBLIC_HOST = "reimagined-octo-meme.cgr28.workers.dev";
async function sendViaCloudflareEmail(env, options) {
  if (!env.EMAIL) {
    throw new Error("Cloudflare Email Service is not configured");
  }
  const fromEmail = env.BOOKING_FROM_EMAIL?.trim() || DEFAULT_BOOKING_EMAIL;
  await env.EMAIL.send({
    to: options.to,
    from: { email: fromEmail, name: BUSINESS_NAME2 },
    replyTo: { email: fromEmail, name: BUSINESS_NAME2 },
    subject: options.subject,
    text: options.body,
    ...options.htmlBody ? { html: options.htmlBody } : {}
  });
}
__name(sendViaCloudflareEmail, "sendViaCloudflareEmail");
async function sendViaWeb3Forms(env, options) {
  const accessKey = env.WEB3FORMS_ACCESS_KEY?.trim() ?? "";
  if (!accessKey) {
    throw new Error("Web3Forms is not configured");
  }
  const ownerEmail = env.BOOKING_TO_EMAIL?.trim() || DEFAULT_BOOKING_EMAIL;
  const sendAutoresponse = options.to.toLowerCase() !== ownerEmail.toLowerCase();
  const payload = {
    access_key: accessKey,
    subject: sendAutoresponse ? `[Paid booking copy] ${options.subject}` : options.subject,
    name: options.toName ?? options.to,
    from_name: options.toName ?? BUSINESS_NAME2,
    message: options.body
  };
  if (sendAutoresponse) {
    payload.email = options.to;
    payload.autoresponse = {
      subject: options.subject,
      message: options.body,
      ...options.htmlBody?.trim() ? { html: options.htmlBody } : {}
    };
  }
  const response = await fetch("https://api.web3forms.com/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.success !== true) {
    throw new Error("Web3Forms request failed");
  }
}
__name(sendViaWeb3Forms, "sendViaWeb3Forms");
async function sendViaFormSubmit(options) {
  const response = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(options.to)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      _subject: options.subject,
      _captcha: "false",
      _template: "box",
      name: options.toName ?? BUSINESS_NAME2,
      message: options.htmlBody?.trim() || options.body
    })
  });
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error("FormSubmit returned an unexpected response");
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success !== "true" && payload?.success !== true) {
    throw new Error("FormSubmit request failed");
  }
}
__name(sendViaFormSubmit, "sendViaFormSubmit");
async function sendViaMailChannels(env, options) {
  const fromEmail = env.BOOKING_FROM_EMAIL?.trim() || DEFAULT_BOOKING_EMAIL;
  const response = await fetch("https://api.mailchannels.net/tx/v1/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "CF-Worker": WORKER_PUBLIC_HOST
    },
    body: JSON.stringify({
      personalizations: [
        {
          to: [{ email: options.to, name: options.toName ?? options.to }]
        }
      ],
      from: {
        email: fromEmail,
        name: BUSINESS_NAME2
      },
      reply_to: {
        email: fromEmail,
        name: BUSINESS_NAME2
      },
      subject: options.subject,
      content: [
        { type: "text/plain", value: options.body },
        ...options.htmlBody ? [{ type: "text/html", value: options.htmlBody }] : []
      ]
    })
  });
  if (!response.ok) {
    throw new Error("MailChannels request failed");
  }
}
__name(sendViaMailChannels, "sendViaMailChannels");
async function trySendEmail(env, options) {
  const providers = [];
  const wantsHtml = Boolean(options.htmlBody?.trim());
  if (env.EMAIL) {
    providers.push({ label: "cloudflare-email", run: () => sendViaCloudflareEmail(env, options) });
  }
  if (wantsHtml) {
    providers.push({ label: "formsubmit", run: () => sendViaFormSubmit(options) });
    providers.push({ label: "mailchannels", run: () => sendViaMailChannels(env, options) });
  }
  if (env.WEB3FORMS_ACCESS_KEY?.trim()) {
    providers.push({ label: "web3forms", run: () => sendViaWeb3Forms(env, options) });
  }
  if (!wantsHtml) {
    providers.push({ label: "formsubmit", run: () => sendViaFormSubmit(options) });
    providers.push({ label: "mailchannels", run: () => sendViaMailChannels(env, options) });
  }
  let lastError = null;
  for (const provider of providers) {
    try {
      await provider.run();
      return { sent: true };
    } catch (error) {
      lastError = error;
      console.error(`Email via ${provider.label} failed`, error);
    }
  }
  const detail = lastError instanceof Error ? lastError.message : "All email providers failed";
  return { sent: false, error: detail };
}
__name(trySendEmail, "trySendEmail");
async function sendEmail(env, options) {
  const result = await trySendEmail(env, options);
  if (!result.sent) {
    throw new Error(result.error ?? "All email providers failed");
  }
}
__name(sendEmail, "sendEmail");

// src/tracking-handlers.ts
var AIRPORT_NAMES = {
  BFS: "Belfast International",
  BHD: "George Best Belfast City",
  DUB: "Dublin Airport",
  LDY: "City of Derry"
};
async function resolveDriverFlight(record, env) {
  if (!record.isAirportTrip || !record.isFromAirport || !record.flightNumber?.trim() || !record.airportCode?.trim()) {
    return null;
  }
  const apiKey = env.AERODATABOX_RAPIDAPI_KEY?.trim();
  if (!apiKey) {
    return null;
  }
  try {
    const result = await lookupFlight(apiKey, {
      flightNumber: record.flightNumber,
      tripDate: record.tripDate,
      airportCode: record.airportCode,
      airportName: AIRPORT_NAMES[record.airportCode] ?? record.airportCode,
      direction: "from-airport"
    });
    return result.ok ? result.flight : null;
  } catch (error) {
    console.error("Driver flight lookup failed", error);
    return null;
  }
}
__name(resolveDriverFlight, "resolveDriverFlight");
function jsonResponse(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin)
    }
  });
}
__name(jsonResponse, "jsonResponse");
function liveDriverLocation(record, windowOpen) {
  if (!windowOpen || !record.sharingActive || typeof record.driverLat !== "number" || typeof record.driverLng !== "number" || !isLocationFresh(record.driverUpdatedAt)) {
    return null;
  }
  return {
    lat: record.driverLat,
    lng: record.driverLng,
    updatedAt: record.driverUpdatedAt
  };
}
__name(liveDriverLocation, "liveDriverLocation");
function liveCustomerLocation(record, windowOpen) {
  if (!windowOpen || !record.customerSharingActive || typeof record.customerLat !== "number" || typeof record.customerLng !== "number" || !isLocationFresh(record.customerUpdatedAt)) {
    return null;
  }
  return {
    lat: record.customerLat,
    lng: record.customerLng,
    updatedAt: record.customerUpdatedAt
  };
}
__name(liveCustomerLocation, "liveCustomerLocation");
function publicTrackPayload(record, origin, options = {}) {
  const window = getTrackingWindow(record.pickupAt);
  const driver = liveDriverLocation(record, window.open);
  const customer = options.includeCustomerLocation ? liveCustomerLocation(record, window.open) : null;
  return {
    ok: true,
    customerName: record.customerName,
    pickupLabel: record.pickupLabel,
    dropoffLabel: record.dropoffLabel,
    tripDate: record.tripDate,
    tripTime: record.tripTime,
    pickupAt: record.pickupAt,
    pickupDisplay: formatLondonDateTime2(record.pickupAt),
    trackingWindow: {
      ...window,
      opensAtDisplay: formatLondonDateTime2(window.opensAt),
      closesAtDisplay: formatLondonDateTime2(window.closesAt)
    },
    sharingActive: record.sharingActive,
    customerSharingActive: Boolean(record.customerSharingActive),
    driver,
    customer,
    trackUrl: buildPublicTrackUrl(record.token)
  };
}
__name(publicTrackPayload, "publicTrackPayload");
async function createTrackingJobForPaidBooking(env, booking, paymentReference) {
  if (!trackingStoreConfigured(env.TRACKING_STORE)) {
    return { created: false };
  }
  try {
    const record = await createTrackingJobFromBooking(
      env.TRACKING_STORE,
      booking,
      paymentReference
    );
    if (!record) {
      return { created: false };
    }
    return {
      created: true,
      token: record.token,
      trackUrl: buildPublicTrackUrl(record.token)
    };
  } catch (error) {
    console.error("Tracking job creation failed", error);
    return { created: false };
  }
}
__name(createTrackingJobForPaidBooking, "createTrackingJobForPaidBooking");
async function handlePublicTrackRequest(token, env, origin) {
  if (!trackingStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Live tracking is not configured" }, 503, origin);
  }
  const trimmed = token.trim();
  if (!trimmed) {
    return jsonResponse({ error: "Missing tracking id" }, 400, origin);
  }
  const record = await getTrackingJob(env.TRACKING_STORE, trimmed);
  if (!record) {
    return jsonResponse({ error: "Tracking link not found" }, 404, origin);
  }
  return jsonResponse(publicTrackPayload(record, origin), 200, origin);
}
__name(handlePublicTrackRequest, "handlePublicTrackRequest");
async function sendSharingReminderEmail(env, record, trackUrl) {
  const customerEmail = record.customerEmail?.trim() ?? "";
  if (!customerEmail) {
    return false;
  }
  const reminder = buildTrackingReminderEmail(
    {
      customerName: record.customerName,
      pickupLabel: record.pickupLabel,
      dropoffLabel: record.dropoffLabel,
      tripDate: record.tripDate,
      tripTime: record.tripTime
    },
    trackUrl
  );
  const result = await trySendEmail(env, {
    to: customerEmail,
    toName: record.customerName,
    subject: reminder.subject,
    body: reminder.text,
    htmlBody: reminder.html
  });
  if (!result.sent) {
    console.error("Sharing reminder email failed", result.error);
  }
  return result.sent;
}
__name(sendSharingReminderEmail, "sendSharingReminderEmail");
async function handleDriverJobsRequest(request, env, origin) {
  if (!trackingStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Live tracking is not configured" }, 503, origin);
  }
  if (!driverAuthorized(request, env)) {
    return jsonResponse(
      {
        error: "Unauthorized \u2014 check your driver access key. Sign out and enter the key from Cloudflare (DRIVER_ACCESS_KEY)."
      },
      401,
      origin
    );
  }
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope")?.trim().toLowerCase() ?? "date";
  const daysAhead = Math.min(
    90,
    Math.max(1, Number.parseInt(url.searchParams.get("days") ?? "60", 10) || 60)
  );
  const tripDate = url.searchParams.get("date")?.trim() ?? new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(/* @__PURE__ */ new Date());
  let jobs;
  let responseDate = tripDate;
  if (scope === "upcoming") {
    jobs = await listUpcomingTrackingJobs(env.TRACKING_STORE, daysAhead);
    responseDate = "upcoming";
  } else {
    jobs = await listTrackingJobsForDate(env.TRACKING_STORE, tripDate);
  }
  const enrichedJobs = await Promise.all(
    jobs.map(async (job) => {
      const flight = await resolveDriverFlight(job, env);
      let amountPaidLabel;
      let bookingStatus = "confirmed";
      let paidRecord = null;
      if (job.paymentReference && paidBookingStoreConfigured(env.TRACKING_STORE)) {
        paidRecord = await getPaidBookingRecord(env.TRACKING_STORE, job.paymentReference);
        if (paidRecord) {
          amountPaidLabel = paidRecord.amountPaidLabel;
          bookingStatus = paidRecord.status;
        }
      }
      if (bookingStatus !== "refunded" && job.refundedAt) {
        bookingStatus = "refunded";
      }
      const refundAmountLabel = paidRecord?.refundAmountLabel ?? job.refundAmountLabel;
      return {
        ...publicTrackPayload(job, origin, { includeCustomerLocation: true }),
        token: job.token,
        customerMobile: job.customerMobile,
        paymentReference: job.paymentReference,
        amountPaidLabel,
        bookingStatus,
        refundAmountLabel,
        isAirportPickup: Boolean(job.isAirportTrip && job.isFromAirport),
        flightNumber: job.flightNumber ?? null,
        airportCode: job.airportCode ?? null,
        flight
      };
    })
  );
  return jsonResponse(
    {
      ok: true,
      scope,
      date: responseDate,
      jobs: enrichedJobs
    },
    200,
    origin
  );
}
__name(handleDriverJobsRequest, "handleDriverJobsRequest");
async function handleDriverStatusRequest(request, env, origin) {
  const authConfigured = isDriverAuthConfigured(env);
  const authorized = driverAuthorized(request, env);
  const keys = driverAuthStatus(env);
  return jsonResponse(
    {
      ok: authorized,
      authConfigured,
      ...keys,
      worker: "reimagined-octo-meme",
      ...authorized ? {} : {
        error: authConfigured ? keys.hasDriverKey && keys.hasOwnerKey ? "Driver key did not match. Use the exact DRIVER_ACCESS_KEY or OWNER_ACCESS_KEY value from reimagined-octo-meme worker secrets." : keys.hasOwnerKey ? "Driver key did not match. Use the exact OWNER_ACCESS_KEY secret value from reimagined-octo-meme." : "Driver key did not match. Use the exact DRIVER_ACCESS_KEY secret value from reimagined-octo-meme." : "Driver access is not configured on reimagined-octo-meme. Add DRIVER_ACCESS_KEY under that worker's encrypted secrets (not my-airport-taxi-ni)."
      }
    },
    authorized ? 200 : authConfigured ? 401 : 503,
    origin
  );
}
__name(handleDriverStatusRequest, "handleDriverStatusRequest");
async function handleDriverSharingRequest(request, env, origin) {
  if (!trackingStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Live tracking is not configured" }, 503, origin);
  }
  if (!driverAuthorized(request, env)) {
    return jsonResponse({ error: "Unauthorized" }, 401, origin);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, origin);
  }
  const token = String(body.token ?? "").trim();
  const active = Boolean(body.active);
  if (!token) {
    return jsonResponse({ error: "Missing token" }, 400, origin);
  }
  const record = await getTrackingJob(env.TRACKING_STORE, token);
  if (!record) {
    return jsonResponse({ error: "Job not found" }, 404, origin);
  }
  const wasSharing = record.sharingActive;
  record.sharingActive = active;
  if (!active) {
    delete record.driverLat;
    delete record.driverLng;
    delete record.driverUpdatedAt;
  }
  await saveTrackingJob(env.TRACKING_STORE, record);
  const trackUrl = buildPublicTrackUrl(record.token);
  if (active && !wasSharing && !record.sharingReminderSentAt && record.customerEmail?.trim()) {
    const sent = await sendSharingReminderEmail(env, record, trackUrl);
    if (sent) {
      record.sharingReminderSentAt = (/* @__PURE__ */ new Date()).toISOString();
      await saveTrackingJob(env.TRACKING_STORE, record);
    }
  }
  return jsonResponse(
    {
      ok: true,
      token,
      sharingActive: record.sharingActive,
      trackUrl,
      sharingReminderSent: Boolean(record.sharingReminderSentAt)
    },
    200,
    origin
  );
}
__name(handleDriverSharingRequest, "handleDriverSharingRequest");
async function handleDriverLocationRequest(request, env, origin) {
  if (!trackingStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Live tracking is not configured" }, 503, origin);
  }
  if (!driverAuthorized(request, env)) {
    return jsonResponse({ error: "Unauthorized" }, 401, origin);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, origin);
  }
  const token = String(body.token ?? "").trim();
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!token || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return jsonResponse({ error: "Missing token or coordinates" }, 400, origin);
  }
  const record = await getTrackingJob(env.TRACKING_STORE, token);
  if (!record) {
    return jsonResponse({ error: "Job not found" }, 404, origin);
  }
  if (!record.sharingActive) {
    return jsonResponse({ error: "Sharing is not active for this job" }, 409, origin);
  }
  record.driverLat = lat;
  record.driverLng = lng;
  record.driverUpdatedAt = (/* @__PURE__ */ new Date()).toISOString();
  await saveTrackingJob(env.TRACKING_STORE, record);
  return jsonResponse({ ok: true }, 200, origin);
}
__name(handleDriverLocationRequest, "handleDriverLocationRequest");
var RESERVED_TRACK_PATHS = /* @__PURE__ */ new Set(["sharing", "location"]);
function parseTrackSubRoute(pathname) {
  if (pathname === "/track/sharing" || pathname === "/api/track/sharing") {
    return "sharing";
  }
  if (pathname === "/track/location" || pathname === "/api/track/location") {
    return "location";
  }
  return null;
}
__name(parseTrackSubRoute, "parseTrackSubRoute");
function parseTrackTokenFromPath(pathname) {
  const match = pathname.match(/^\/(?:api\/)?track\/([^/]+)\/?$/);
  const token = match?.[1] ? decodeURIComponent(match[1]) : null;
  if (!token || RESERVED_TRACK_PATHS.has(token)) {
    return null;
  }
  return token;
}
__name(parseTrackTokenFromPath, "parseTrackTokenFromPath");
async function handleCustomerSharingRequest(request, env, origin) {
  if (!trackingStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Live tracking is not configured" }, 503, origin);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, origin);
  }
  const token = String(body.token ?? "").trim();
  const active = Boolean(body.active);
  if (!token) {
    return jsonResponse({ error: "Missing token" }, 400, origin);
  }
  const record = await getTrackingJob(env.TRACKING_STORE, token);
  if (!record) {
    return jsonResponse({ error: "Tracking link not found" }, 404, origin);
  }
  const window = getTrackingWindow(record.pickupAt);
  if (!window.open) {
    return jsonResponse({ error: "Tracking window is not open" }, 403, origin);
  }
  record.customerSharingActive = active;
  if (!active) {
    delete record.customerLat;
    delete record.customerLng;
    delete record.customerUpdatedAt;
  }
  await saveTrackingJob(env.TRACKING_STORE, record);
  return jsonResponse(
    {
      ok: true,
      customerSharingActive: record.customerSharingActive
    },
    200,
    origin
  );
}
__name(handleCustomerSharingRequest, "handleCustomerSharingRequest");
async function handleCustomerLocationRequest(request, env, origin) {
  if (!trackingStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Live tracking is not configured" }, 503, origin);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, origin);
  }
  const token = String(body.token ?? "").trim();
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!token || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return jsonResponse({ error: "Missing token or coordinates" }, 400, origin);
  }
  const record = await getTrackingJob(env.TRACKING_STORE, token);
  if (!record) {
    return jsonResponse({ error: "Tracking link not found" }, 404, origin);
  }
  const window = getTrackingWindow(record.pickupAt);
  if (!window.open) {
    return jsonResponse({ error: "Tracking window is not open" }, 403, origin);
  }
  if (!record.customerSharingActive) {
    return jsonResponse({ error: "Customer sharing is not active" }, 409, origin);
  }
  record.customerLat = lat;
  record.customerLng = lng;
  record.customerUpdatedAt = (/* @__PURE__ */ new Date()).toISOString();
  await saveTrackingJob(env.TRACKING_STORE, record);
  return jsonResponse({ ok: true }, 200, origin);
}
__name(handleCustomerLocationRequest, "handleCustomerLocationRequest");

// shared/business-links.ts
var DEFAULT_GOOGLE_REVIEW_URL = "https://search.google.com/local/writereview?placeid=ChIJXXXXXXXXXXXXXXXX";
function resolveGoogleReviewUrl(configuredUrl) {
  const url = configuredUrl?.trim() || DEFAULT_GOOGLE_REVIEW_URL;
  if (!url || url.includes("ChIJXXXXXXXX")) {
    return configuredUrl?.trim() || null;
  }
  return url;
}
__name(resolveGoogleReviewUrl, "resolveGoogleReviewUrl");

// src/review-request-handlers.ts
async function processDueReviewRequests(env) {
  const result = {
    scanned: 0,
    eligible: 0,
    sent: 0,
    skipped: 0,
    errors: 0
  };
  if (!trackingStoreConfigured(env.TRACKING_STORE)) {
    return result;
  }
  const reviewUrl = resolveGoogleReviewUrl(env.GOOGLE_REVIEW_URL);
  if (!reviewUrl) {
    console.warn("Google review URL is not configured \u2014 skipping review request emails");
    return result;
  }
  const jobs = await listTrackingJobsForRecentDays(env.TRACKING_STORE, 4);
  result.scanned = jobs.length;
  for (const job of jobs) {
    const outcome = await maybeSendReviewRequestEmail(env, job, reviewUrl);
    if (outcome === "sent") {
      result.sent += 1;
      result.eligible += 1;
    } else if (outcome === "eligible_error") {
      result.eligible += 1;
      result.errors += 1;
    } else if (outcome === "eligible_skipped") {
      result.eligible += 1;
      result.skipped += 1;
    }
  }
  return result;
}
__name(processDueReviewRequests, "processDueReviewRequests");
async function maybeSendReviewRequestEmail(env, job, reviewUrl) {
  if (job.reviewRequestSentAt) {
    return "not_eligible";
  }
  if (!job.customerEmail?.trim()) {
    return "not_eligible";
  }
  if (!isReviewRequestDue(job.pickupAt)) {
    return "not_eligible";
  }
  const email = buildGoogleReviewRequestEmail(
    {
      customerName: job.customerName,
      pickupLabel: job.pickupLabel,
      dropoffLabel: job.dropoffLabel,
      tripDate: job.tripDate,
      tripTime: job.tripTime
    },
    reviewUrl
  );
  const sendResult = await trySendEmail(env, {
    to: job.customerEmail.trim(),
    toName: job.customerName,
    subject: email.subject,
    body: email.text,
    htmlBody: email.html
  });
  if (!sendResult.sent) {
    console.error("Review request email failed", sendResult.error, job.token);
    return "eligible_error";
  }
  job.reviewRequestSentAt = (/* @__PURE__ */ new Date()).toISOString();
  await saveTrackingJob(env.TRACKING_STORE, job);
  return "sent";
}
__name(maybeSendReviewRequestEmail, "maybeSendReviewRequestEmail");

// src/driver-booking-handlers.ts
var AIRPORT_NAMES2 = {
  BFS: "Belfast International",
  BHD: "George Best Belfast City",
  DUB: "Dublin Airport",
  LDY: "City of Derry"
};
function calendarConfigured(env) {
  return Boolean(
    env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON?.trim() && env.GOOGLE_CALENDAR_ID?.trim()
  );
}
__name(calendarConfigured, "calendarConfigured");
async function resolveDriverFlight2(record, env) {
  if (!record.isAirportTrip || !record.isFromAirport || !record.flightNumber?.trim() || !record.airportCode?.trim()) {
    return null;
  }
  const apiKey = env.AERODATABOX_RAPIDAPI_KEY?.trim();
  if (!apiKey) {
    return null;
  }
  try {
    const result = await lookupFlight(apiKey, {
      flightNumber: record.flightNumber,
      tripDate: record.tripDate,
      airportCode: record.airportCode,
      airportName: AIRPORT_NAMES2[record.airportCode] ?? record.airportCode,
      direction: "from-airport"
    });
    return result.ok ? result.flight : null;
  } catch (error) {
    console.error("Driver flight lookup failed", error);
    return null;
  }
}
__name(resolveDriverFlight2, "resolveDriverFlight");
async function enrichDriverJob(job, env, origin) {
  const flight = await resolveDriverFlight2(job, env);
  const paidRecord = job.paymentReference && paidBookingStoreConfigured(env.TRACKING_STORE) ? await getPaidBookingRecord(env.TRACKING_STORE, job.paymentReference) : null;
  const bookingStatus = paidRecord?.status === "refunded" || job.refundedAt ? "refunded" : "confirmed";
  return {
    ...publicTrackPayload(job, origin, { includeCustomerLocation: true }),
    token: job.token,
    customerMobile: job.customerMobile,
    paymentReference: job.paymentReference,
    amountPaidLabel: paidRecord?.amountPaidLabel,
    bookingStatus,
    refundAmountLabel: paidRecord?.refundAmountLabel ?? job.refundAmountLabel,
    isAirportPickup: Boolean(job.isAirportTrip && job.isFromAirport),
    flightNumber: job.flightNumber ?? null,
    airportCode: job.airportCode ?? null,
    flight
  };
}
__name(enrichDriverJob, "enrichDriverJob");
function isValidDate2(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
__name(isValidDate2, "isValidDate");
function isValidTime2(value) {
  return /^\d{2}:\d{2}$/.test(value);
}
__name(isValidTime2, "isValidTime");
function jsonResponse2(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin)
    }
  });
}
__name(jsonResponse2, "jsonResponse");
async function handleDriverUpdateBookingRequest(request, env, origin) {
  if (!trackingStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse2({ error: "Live tracking is not configured" }, 503, origin);
  }
  if (!driverAuthorized(request, env)) {
    return jsonResponse2({ error: "Unauthorized" }, 401, origin);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse2({ error: "Invalid JSON" }, 400, origin);
  }
  const token = String(body.token ?? "").trim();
  if (!token) {
    return jsonResponse2({ error: "Missing token" }, 400, origin);
  }
  const record = await getTrackingJob(env.TRACKING_STORE, token);
  if (!record) {
    return jsonResponse2({ error: "Job not found" }, 404, origin);
  }
  if (record.paymentReference && paidBookingStoreConfigured(env.TRACKING_STORE)) {
    const paidRecord = await getPaidBookingRecord(env.TRACKING_STORE, record.paymentReference);
    if (paidRecord?.status === "refunded") {
      return jsonResponse2({ error: "This booking has been refunded" }, 409, origin);
    }
  }
  const previousDate = record.tripDate;
  const previousTime = record.tripTime;
  const previousPickup = record.pickupLabel;
  const previousDropoff = record.dropoffLabel;
  const previousMobile = record.customerMobile;
  const previousFlight = record.flightNumber ?? "";
  if (body.tripDate !== void 0) {
    const tripDate = String(body.tripDate).trim();
    if (!isValidDate2(tripDate)) {
      return jsonResponse2({ error: "Invalid trip date" }, 400, origin);
    }
    record.tripDate = tripDate;
  }
  if (body.tripTime !== void 0) {
    const tripTime = String(body.tripTime).trim();
    if (!isValidTime2(tripTime)) {
      return jsonResponse2({ error: "Invalid trip time" }, 400, origin);
    }
    record.tripTime = tripTime;
  }
  if (body.pickupLabel !== void 0) {
    record.pickupLabel = String(body.pickupLabel).trim();
  }
  if (body.dropoffLabel !== void 0) {
    record.dropoffLabel = String(body.dropoffLabel).trim();
  }
  if (body.customerMobile !== void 0) {
    record.customerMobile = String(body.customerMobile).trim();
  }
  if (body.flightNumber !== void 0) {
    const flightNumber = String(body.flightNumber).trim();
    record.flightNumber = flightNumber ? flightNumber.toUpperCase() : void 0;
  }
  const pickupAt = buildPickupDateTimeLocal(record.tripDate, record.tripTime);
  if (!pickupAt) {
    return jsonResponse2({ error: "Invalid trip date or time" }, 400, origin);
  }
  const changed = record.tripDate !== previousDate || record.tripTime !== previousTime || record.pickupLabel !== previousPickup || record.dropoffLabel !== previousDropoff || record.customerMobile !== previousMobile || (record.flightNumber ?? "") !== previousFlight;
  if (!changed) {
    return jsonResponse2({ ok: true, job: await enrichDriverJob(record, env, origin) }, 200, origin);
  }
  record.pickupAt = pickupAt;
  await saveTrackingJob(env.TRACKING_STORE, record);
  if (record.tripDate !== previousDate) {
    await reindexTrackingJobDate(env.TRACKING_STORE, token, previousDate, record.tripDate);
  }
  const warnings = [];
  if (record.paymentReference && paidBookingStoreConfigured(env.TRACKING_STORE)) {
    const updated = await updatePaidBookingFields(env.TRACKING_STORE, record.paymentReference, {
      tripDate: record.tripDate,
      tripTime: record.tripTime,
      pickupLabel: record.pickupLabel,
      dropoffLabel: record.dropoffLabel,
      mobileNumber: record.customerMobile
    });
    if (!updated) {
      warnings.push("Paid booking record could not be updated");
    } else if (calendarConfigured(env) && updated.calendarEventIds.length > 0) {
      try {
        const serviceAccount = parseServiceAccountJson(env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON);
        const accessToken = await getGoogleAccessToken(serviceAccount);
        const startDateTime = `${record.tripDate}T${record.tripTime}`;
        const updateNote = `Updated via driver dashboard at ${(/* @__PURE__ */ new Date()).toISOString()}
` + (record.tripDate !== previousDate || record.tripTime !== previousTime ? `Was: ${previousDate} ${previousTime}
Now: ${record.tripDate} ${record.tripTime}
` : "") + (record.pickupLabel !== previousPickup ? `Pickup was: ${previousPickup}
Pickup now: ${record.pickupLabel}
` : "") + (record.dropoffLabel !== previousDropoff ? `Drop-off was: ${previousDropoff}
Drop-off now: ${record.dropoffLabel}
` : "");
        const result = await rescheduleCalendarEvents(
          accessToken,
          env.GOOGLE_CALENDAR_ID.trim(),
          [updated.calendarEventIds[0]],
          {
            startDateTime,
            endDateTime: transferEventEndDateTime(startDateTime),
            location: record.pickupLabel,
            updateNote
          }
        );
        if (result.errors.length > 0) {
          warnings.push(...result.errors.map((message) => `Calendar: ${message}`));
        }
      } catch (error) {
        warnings.push(
          error instanceof Error ? error.message : "Calendar update failed"
        );
      }
    }
  }
  const job = await enrichDriverJob(record, env, origin);
  return jsonResponse2(
    {
      ok: true,
      job,
      ...warnings.length > 0 ? { warnings } : {}
    },
    200,
    origin
  );
}
__name(handleDriverUpdateBookingRequest, "handleDriverUpdateBookingRequest");

// src/refund-handlers.ts
var DEFAULT_BOOKING_EMAIL2 = "bookings@myairporttaxini.co.uk";
var BUSINESS_NAME3 = "My Airport Taxi NI";
function ownerAuthorized(request, env) {
  const expected = env.OWNER_ACCESS_KEY?.trim() || env.DRIVER_ACCESS_KEY?.trim() || "";
  if (!expected) {
    return false;
  }
  const headerKey = request.headers.get("X-Owner-Key")?.trim() ?? "";
  const driverKey = request.headers.get("X-Driver-Key")?.trim() ?? "";
  const urlKey = new URL(request.url).searchParams.get("key")?.trim() ?? "";
  const provided = headerKey || driverKey || urlKey;
  return provided === expected;
}
__name(ownerAuthorized, "ownerAuthorized");
function isKnownRefundAmount(label) {
  const trimmed = label?.trim() ?? "";
  return Boolean(trimmed) && trimmed.toLowerCase() !== "unknown";
}
__name(isKnownRefundAmount, "isKnownRefundAmount");
function resolveRefundAmountLabel(record, preferred) {
  if (isKnownRefundAmount(preferred)) {
    return preferred.trim();
  }
  if (isKnownRefundAmount(record.amountPaidLabel)) {
    return record.amountPaidLabel.trim();
  }
  if (record.amount > 0) {
    return formatPaidAmount(record.amount, record.currency);
  }
  return null;
}
__name(resolveRefundAmountLabel, "resolveRefundAmountLabel");
function applyCheckoutAmount(record, checkout) {
  if (typeof checkout.amount !== "number" || checkout.amount <= 0) {
    return null;
  }
  record.amount = checkout.amount;
  record.currency = checkout.currency ?? record.currency;
  record.amountPaidLabel = formatPaidAmount(record.amount, record.currency);
  return record.amountPaidLabel;
}
__name(applyCheckoutAmount, "applyCheckoutAmount");
function calendarConfigured2(env) {
  return Boolean(
    env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON?.trim() && env.GOOGLE_CALENDAR_ID?.trim()
  );
}
__name(calendarConfigured2, "calendarConfigured");
async function issueBookingRefund(env, paymentReferenceInput, options) {
  const paymentReference = paymentReferenceInput.trim();
  if (!paymentReference) {
    return { ok: false, paymentReference: "", error: "Missing payment reference" };
  }
  if (!paidBookingStoreConfigured(env.TRACKING_STORE)) {
    return { ok: false, paymentReference, error: "Booking store is not configured" };
  }
  let record = await getPaidBookingRecord(env.TRACKING_STORE, paymentReference) ?? await buildLegacyPaidBookingRecord(env, paymentReference, options?.trackingToken);
  if (!record) {
    return {
      ok: false,
      paymentReference,
      error: "Booking not found for that payment reference"
    };
  }
  if (record.status === "refunded") {
    return {
      ok: true,
      alreadyRefunded: true,
      paymentReference,
      refundAmount: record.refundAmountLabel ?? record.amountPaidLabel
    };
  }
  const warnings = [];
  let refundAmountLabel = record.amountPaidLabel;
  let sumUpRefunded = false;
  const sumUpApiKey = env.SUMUP_API_KEY?.trim() ?? "";
  const sumUpMerchantCode = env.SUMUP_MERCHANT_CODE?.trim() ?? "";
  if (sumUpApiKey) {
    if (!record.transactionId || !resolveRefundAmountLabel(record, refundAmountLabel)) {
      const resolved = await resolveSumUpTransactionForRefund(
        sumUpApiKey,
        sumUpMerchantCode,
        record.paymentReference,
        record.checkoutId || void 0
      );
      if (resolved?.id) {
        record.transactionId = resolved.id;
        if (typeof resolved.amount === "number" && resolved.amount > 0) {
          record.amount = resolved.amount;
          record.currency = resolved.currency ?? record.currency;
          record.amountPaidLabel = formatPaidAmount(record.amount, record.currency);
          refundAmountLabel = record.amountPaidLabel;
        }
      }
    }
    if (!resolveRefundAmountLabel(record, refundAmountLabel) && record.checkoutId) {
      try {
        const checkout = await getSumUpCheckout(sumUpApiKey, record.checkoutId);
        const transactionId = getSuccessfulTransactionId(checkout);
        if (transactionId) {
          record.transactionId = transactionId;
        }
        const checkoutAmount = applyCheckoutAmount(record, checkout);
        if (checkoutAmount) {
          refundAmountLabel = checkoutAmount;
        }
      } catch {
      }
    }
    if (!record.transactionId) {
      return {
        ok: false,
        paymentReference,
        error: "Could not find SumUp transaction for this booking"
      };
    }
    const resolvedBeforeRefund = resolveRefundAmountLabel(record, refundAmountLabel);
    if (!resolvedBeforeRefund) {
      return {
        ok: false,
        paymentReference,
        error: "Could not determine refund amount for this booking"
      };
    }
    refundAmountLabel = resolvedBeforeRefund;
    try {
      const refund = await refundSumUpTransaction(
        sumUpApiKey,
        record.transactionId,
        void 0,
        sumUpMerchantCode || void 0
      );
      sumUpRefunded = true;
      if (typeof refund.refundedAmount === "number" && refund.refundedAmount > 0) {
        refundAmountLabel = formatPaidAmount(refund.refundedAmount, refund.currency ?? record.currency);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : "SumUp refund failed";
      return { ok: false, paymentReference, error: detail };
    }
  } else {
    warnings.push("SumUp refund was not attempted \u2014 missing API key");
    const resolvedRefundAmount = resolveRefundAmountLabel(record, refundAmountLabel);
    if (!resolvedRefundAmount) {
      return {
        ok: false,
        paymentReference,
        error: "Could not determine refund amount for this booking"
      };
    }
    refundAmountLabel = resolvedRefundAmount;
  }
  let calendarCancelled = 0;
  if (calendarConfigured2(env) && record.calendarEventIds.length > 0) {
    try {
      const serviceAccount = parseServiceAccountJson(env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON);
      const accessToken = await getGoogleAccessToken(serviceAccount);
      const refundNote = `Refunded: ${refundAmountLabel}
Reference: ${paymentReference}
Cancelled at: ${(/* @__PURE__ */ new Date()).toISOString()}`;
      const result = await cancelCalendarEvents(
        accessToken,
        env.GOOGLE_CALENDAR_ID.trim(),
        record.calendarEventIds,
        { refundNote }
      );
      calendarCancelled = result.cancelled;
      if (result.errors.length > 0) {
        warnings.push(...result.errors.map((message) => `Calendar: ${message}`));
      }
    } catch (error) {
      warnings.push(
        error instanceof Error ? error.message : "Calendar cancellation failed"
      );
    }
  } else if (calendarConfigured2(env)) {
    warnings.push("No stored calendar event ids \u2014 calendar entry may remain");
  }
  let trackingMarkedRefunded = false;
  if (trackingStoreConfigured(env.TRACKING_STORE)) {
    const token = record.trackingToken ?? (await findTrackingJobByPaymentReference(env.TRACKING_STORE, paymentReference))?.token;
    if (token) {
      trackingMarkedRefunded = await markTrackingJobRefunded(
        env.TRACKING_STORE,
        token,
        refundAmountLabel
      );
    }
  }
  const emailDetails = {
    customerName: record.customerName,
    paymentReference: record.paymentReference,
    refundAmount: refundAmountLabel,
    tripLabel: record.tripLabel,
    pickupLabel: record.pickupLabel,
    dropoffLabel: record.dropoffLabel,
    tripDate: record.tripDate,
    tripTime: record.tripTime
  };
  const customerEmail = buildCustomerRefundConfirmationEmail(emailDetails, BUSINESS_NAME3);
  const ownerEmail = buildOwnerRefundConfirmationEmail(emailDetails, BUSINESS_NAME3);
  const customerEmailResult = await trySendEmail(env, {
    to: record.customerEmail,
    toName: record.customerName,
    subject: customerEmail.subject,
    body: customerEmail.text,
    htmlBody: customerEmail.html
  });
  const ownerEmailResult = await trySendEmail(env, {
    to: env.BOOKING_TO_EMAIL?.trim() || DEFAULT_BOOKING_EMAIL2,
    subject: ownerEmail.subject,
    body: ownerEmail.body
  });
  if (!customerEmailResult.sent) {
    warnings.push(
      customerEmailResult.error ? `Customer refund email failed: ${customerEmailResult.error}` : "Customer refund email failed"
    );
  }
  if (!ownerEmailResult.sent) {
    warnings.push(
      ownerEmailResult.error ? `Owner refund email failed: ${ownerEmailResult.error}` : "Owner refund email failed"
    );
  }
  const existingPaidRecord = await getPaidBookingRecord(env.TRACKING_STORE, paymentReference);
  if (existingPaidRecord) {
    await markPaidBookingRefunded(env.TRACKING_STORE, paymentReference, refundAmountLabel);
  } else {
    await savePaidBookingRecord(env.TRACKING_STORE, {
      ...record,
      status: "refunded",
      refundedAt: (/* @__PURE__ */ new Date()).toISOString(),
      refundAmountLabel
    });
  }
  return {
    ok: true,
    paymentReference,
    refundAmount: refundAmountLabel,
    sumUpRefunded,
    calendarCancelled,
    calendarDeleted: calendarCancelled,
    trackingRemoved: trackingMarkedRefunded,
    trackingMarkedRefunded,
    customerEmailSent: customerEmailResult.sent,
    ownerEmailSent: ownerEmailResult.sent,
    ...warnings.length > 0 ? { warnings } : {}
  };
}
__name(issueBookingRefund, "issueBookingRefund");
async function buildLegacyPaidBookingRecord(env, paymentReference, trackingToken) {
  if (!trackingStoreConfigured(env.TRACKING_STORE)) {
    return null;
  }
  let trackingJob = trackingToken?.trim() ? await getTrackingJob(env.TRACKING_STORE, trackingToken.trim()) : null;
  if (trackingJob && paymentReference && trackingJob.paymentReference?.trim() && trackingJob.paymentReference.trim() !== paymentReference.trim()) {
    trackingJob = null;
  }
  if (!trackingJob) {
    trackingJob = await findTrackingJobByPaymentReference(env.TRACKING_STORE, paymentReference);
  }
  if (!trackingJob) {
    return null;
  }
  const resolvedReference = trackingJob.paymentReference?.trim() || paymentReference;
  let transactionId;
  let amount = 0;
  let currency = "GBP";
  let amountPaidLabel = "Unknown";
  if (env.SUMUP_API_KEY?.trim() && env.SUMUP_MERCHANT_CODE?.trim()) {
    try {
      const transaction = await resolveSumUpTransactionForRefund(
        env.SUMUP_API_KEY.trim(),
        env.SUMUP_MERCHANT_CODE.trim(),
        resolvedReference
      );
      if (transaction?.id) {
        transactionId = transaction.id;
        if (typeof transaction.amount === "number") {
          amount = transaction.amount;
          currency = transaction.currency ?? "GBP";
          amountPaidLabel = formatPaidAmount(amount, currency);
        }
      }
    } catch {
    }
  }
  return {
    paymentReference: resolvedReference,
    checkoutId: "",
    transactionId,
    transactionCode: resolvedReference,
    amount,
    currency,
    amountPaidLabel,
    customerName: trackingJob.customerName,
    customerEmail: trackingJob.customerEmail ?? "",
    mobileNumber: trackingJob.customerMobile,
    tripLabel: "Airport transfer",
    pickupLabel: trackingJob.pickupLabel,
    dropoffLabel: trackingJob.dropoffLabel,
    returnJourney: false,
    tripDate: trackingJob.tripDate,
    tripTime: trackingJob.tripTime,
    trackingToken: trackingJob.token,
    calendarEventIds: [],
    status: "confirmed",
    createdAt: trackingJob.createdAt
  };
}
__name(buildLegacyPaidBookingRecord, "buildLegacyPaidBookingRecord");
async function savePaidBookingRecordFromConfirm(input) {
  if (!paidBookingStoreConfigured(input.env.TRACKING_STORE)) {
    return;
  }
  const record = {
    paymentReference: input.paymentReference,
    checkoutId: input.checkoutId,
    transactionId: input.transactionId,
    transactionCode: input.transactionCode,
    amount: input.amount,
    currency: input.currency,
    amountPaidLabel: input.amountPaidLabel,
    customerName: input.booking.customerName,
    customerEmail: input.booking.customerEmail,
    mobileNumber: input.booking.mobileNumber,
    tripLabel: input.booking.tripLabel,
    pickupLabel: input.booking.pickupLabel,
    dropoffLabel: input.booking.dropoffLabel,
    returnJourney: input.booking.returnJourney,
    tripDate: input.booking.tripDate,
    tripTime: input.booking.tripTime,
    returnDate: input.booking.returnDate || void 0,
    returnTime: input.booking.returnTime || void 0,
    trackingToken: input.trackingToken,
    calendarEventIds: input.calendarEventIds,
    status: "confirmed",
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  await savePaidBookingRecord(input.env.TRACKING_STORE, record);
}
__name(savePaidBookingRecordFromConfirm, "savePaidBookingRecordFromConfirm");
async function handleRefundRequest(request, env, origin) {
  if (!ownerAuthorized(request, env)) {
    return json({ error: "Unauthorized" }, 401, origin);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, origin);
  }
  const paymentReference = String(body.paymentReference ?? "").trim();
  if (!paymentReference) {
    return json({ error: "Missing paymentReference" }, 400, origin);
  }
  const trackingToken = String(body.trackingToken ?? "").trim() || void 0;
  const result = await issueBookingRefund(env, paymentReference, { trackingToken });
  return json(result, result.ok ? 200 : 502, origin);
}
__name(handleRefundRequest, "handleRefundRequest");
function json(body, status, origin) {
  const headers = {
    "Content-Type": "application/json"
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers.Vary = "Origin";
  } else {
    headers["Access-Control-Allow-Origin"] = "*";
  }
  headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
  headers["Access-Control-Allow-Headers"] = "Content-Type, Accept, X-Owner-Key, X-Driver-Key";
  return new Response(JSON.stringify(body), { status, headers });
}
__name(json, "json");

// src/index.ts
var DEFAULT_BOOKING_EMAIL3 = "bookings@myairporttaxini.co.uk";
var BUSINESS_NAME4 = "My Airport Taxi NI";
function json2(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin)
    }
  });
}
__name(json2, "json");
function parseDriverRoute(pathname) {
  if (pathname === "/driver/jobs" || pathname === "/api/driver/jobs") {
    return "jobs";
  }
  if (pathname === "/driver/status" || pathname === "/api/driver/status") {
    return "status";
  }
  if (pathname === "/driver/bookings/update" || pathname === "/api/driver/bookings/update") {
    return "bookings-update";
  }
  if (pathname === "/driver/sharing" || pathname === "/api/driver/sharing") {
    return "sharing";
  }
  if (pathname === "/driver/location" || pathname === "/api/driver/location") {
    return "location";
  }
  return null;
}
__name(parseDriverRoute, "parseDriverRoute");
function routePath(pathname) {
  if (pathname === "/addresses" || pathname === "/api/addresses") {
    return "addresses";
  }
  if (pathname === "/geocode" || pathname === "/api/geocode") {
    return "geocode";
  }
  if (pathname === "/bookings" || pathname === "/api/bookings") {
    return "bookings";
  }
  if (pathname === "/quote-leads" || pathname === "/api/quote-leads") {
    return "quote-leads";
  }
  if (pathname === "/payments/confirm" || pathname === "/api/payments/confirm") {
    return "payments-confirm";
  }
  if (pathname === "/payments" || pathname === "/api/payments") {
    return "payments";
  }
  if (pathname === "/bookings/refund" || pathname === "/api/bookings/refund") {
    return "bookings-refund";
  }
  if (pathname === "/flights" || pathname === "/api/flights") {
    return "flights";
  }
  if (pathname === "/calendar-status" || pathname === "/api/calendar-status") {
    return "calendar-status";
  }
  return null;
}
__name(routePath, "routePath");
async function sendBookingEmail(env, customerName, message, bookingReference) {
  const toEmail = env.BOOKING_TO_EMAIL?.trim() || DEFAULT_BOOKING_EMAIL3;
  const body = bookingReference ? prependBookingReference(message, bookingReference) : message;
  const subject = bookingReference ? `New booking ${bookingReference} \u2014 ${customerName}` : `New booking \u2014 ${customerName}`;
  await sendEmail(env, {
    to: toEmail,
    subject,
    body
  });
}
__name(sendBookingEmail, "sendBookingEmail");
async function allocateBookingReference(env) {
  if (!env.BOOKING_COUNTER) {
    return null;
  }
  const counterKey = "next_booking_ref";
  const stored = await env.BOOKING_COUNTER.get(counterKey);
  let refNumber = stored ? Number(stored) : STARTING_BOOKING_REF;
  if (!Number.isFinite(refNumber) || refNumber < STARTING_BOOKING_REF) {
    refNumber = STARTING_BOOKING_REF;
  }
  await env.BOOKING_COUNTER.put(counterKey, String(refNumber + 1));
  return formatBookingReference(refNumber);
}
__name(allocateBookingReference, "allocateBookingReference");
function calendarConfigured3(env) {
  return Boolean(
    env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON?.trim() && env.GOOGLE_CALENDAR_ID?.trim()
  );
}
__name(calendarConfigured3, "calendarConfigured");
async function logBookingCalendar(env, body, customerName, message) {
  if (!calendarConfigured3(env)) {
    return { logged: false };
  }
  try {
    const eventIds = await logBookingsToGoogleCalendar({
      serviceAccountJson: env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON,
      calendarId: env.GOOGLE_CALENDAR_ID.trim(),
      customerName,
      message,
      booking: body.booking ?? null,
      tour: body.tour ?? null
    });
    return { logged: true, events: eventIds.length, eventIds };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown calendar error";
    console.error("Google Calendar booking log failed", detail);
    return { logged: false, error: detail };
  }
}
__name(logBookingCalendar, "logBookingCalendar");
async function logPaidBookingCalendar(env, booking, amountPaid, paymentReference) {
  if (!calendarConfigured3(env)) {
    return { logged: false, eventIds: [] };
  }
  try {
    const eventIds = await logBookingsToGoogleCalendar({
      serviceAccountJson: env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON,
      calendarId: env.GOOGLE_CALENDAR_ID.trim(),
      customerName: booking.customerName,
      message: "",
      booking: {
        customerName: booking.customerName,
        customerEmail: booking.customerEmail,
        mobileNumber: booking.mobileNumber,
        tripLabel: booking.tripLabel,
        pickupLabel: booking.pickupLabel,
        dropoffLabel: booking.dropoffLabel,
        returnJourney: booking.returnJourney,
        tripDate: booking.tripDate,
        tripTime: booking.tripTime,
        returnDate: booking.returnDate,
        returnTime: booking.returnTime,
        flightNumber: booking.flightNumber,
        returnFlightNumber: booking.returnFlightNumber,
        passengers: booking.passengers,
        suitcases: booking.suitcases,
        vehicle: booking.vehicle,
        estimatedPrice: amountPaid,
        isAirportTrip: booking.isAirportTrip,
        amountPaid,
        paymentReference,
        paid: true
      }
    });
    return { logged: true, events: eventIds.length, eventIds };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown calendar error";
    console.error("Google Calendar paid booking log failed", detail);
    return { logged: false, error: detail };
  }
}
__name(logPaidBookingCalendar, "logPaidBookingCalendar");
function parsePaidBookingDetails(body) {
  const booking = body.booking;
  if (!booking || typeof booking !== "object") {
    return null;
  }
  const details = booking;
  const customerName = String(details.customerName ?? "").trim();
  const customerEmail = String(details.customerEmail ?? "").trim();
  if (!customerName || !customerEmail) {
    return null;
  }
  return {
    customerName,
    customerEmail,
    mobileNumber: String(details.mobileNumber ?? "").trim(),
    tripLabel: String(details.tripLabel ?? "").trim(),
    pickupLabel: String(details.pickupLabel ?? "").trim(),
    dropoffLabel: String(details.dropoffLabel ?? "").trim(),
    returnJourney: Boolean(details.returnJourney),
    tripDate: String(details.tripDate ?? "").trim(),
    tripTime: String(details.tripTime ?? "").trim(),
    returnDate: String(details.returnDate ?? "").trim(),
    returnTime: String(details.returnTime ?? "").trim(),
    flightNumber: String(details.flightNumber ?? "").trim(),
    returnFlightNumber: String(details.returnFlightNumber ?? "").trim() || void 0,
    passengers: Number(details.passengers) || 0,
    suitcases: Number(details.suitcases) || 0,
    vehicle: String(details.vehicle ?? "").trim(),
    journeyDistance: String(details.journeyDistance ?? "").trim() || void 0,
    journeyDuration: String(details.journeyDuration ?? "").trim() || void 0,
    isAirportTrip: Boolean(details.isAirportTrip),
    airportCode: String(details.airportCode ?? "").trim().toUpperCase() || void 0,
    isFromAirport: details.isFromAirport === void 0 ? void 0 : Boolean(details.isFromAirport),
    termsAcceptedAt: String(details.termsAcceptedAt ?? "").trim() || void 0,
    termsVersion: String(details.termsVersion ?? "").trim() || void 0
  };
}
__name(parsePaidBookingDetails, "parsePaidBookingDetails");
async function isDuplicateQuoteLead(fingerprint) {
  const cache = caches.default;
  const cacheKey = new Request(`https://quote-lead-dedup.internal/${encodeURIComponent(fingerprint)}`);
  const cached = await cache.match(cacheKey);
  if (cached) {
    return true;
  }
  await cache.put(
    cacheKey,
    new Response("1", {
      headers: { "Cache-Control": "private, max-age=3600" }
    })
  );
  return false;
}
__name(isDuplicateQuoteLead, "isDuplicateQuoteLead");
function parseQuoteLeadBody(body) {
  const tripLabel = body.tripLabel?.trim() ?? "";
  const pickupLabel = body.pickupLabel?.trim() ?? "";
  const dropoffLabel = body.dropoffLabel?.trim() ?? "";
  const tripDate = body.tripDate?.trim() ?? "";
  const tripTime = body.tripTime?.trim() ?? "";
  const vehicle = body.vehicle?.trim() ?? "";
  const estimatedPrice = body.estimatedPrice?.trim() ?? "";
  if (!tripLabel || !pickupLabel || !dropoffLabel || !tripDate || !tripTime || !vehicle || !estimatedPrice) {
    return null;
  }
  const passengers = Number(body.passengers);
  const suitcases = Number(body.suitcases);
  if (!Number.isFinite(passengers) || passengers < 1 || !Number.isFinite(suitcases) || suitcases < 0) {
    return null;
  }
  return {
    tripLabel,
    pickupLabel,
    dropoffLabel,
    returnJourney: Boolean(body.returnJourney),
    tripDate,
    tripTime,
    returnDate: body.returnDate?.trim() || void 0,
    returnTime: body.returnTime?.trim() || void 0,
    passengers,
    suitcases,
    vehicle,
    estimatedPrice,
    journeyDistance: body.journeyDistance?.trim() || void 0,
    journeyDuration: body.journeyDuration?.trim() || void 0,
    isAirportTrip: Boolean(body.isAirportTrip)
  };
}
__name(parseQuoteLeadBody, "parseQuoteLeadBody");
async function handleQuoteLeadRequest(request, env, origin) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json2({ error: "Invalid JSON" }, 400, origin);
  }
  const details = parseQuoteLeadBody(body);
  if (!details) {
    return json2({ error: "Missing required fields" }, 400, origin);
  }
  const fingerprint = body.fingerprint?.trim() ?? "";
  if (!fingerprint || fingerprint.length > 512) {
    return json2({ error: "Missing quote fingerprint" }, 400, origin);
  }
  if (await isDuplicateQuoteLead(fingerprint)) {
    return json2({ ok: true, emailed: false, deduplicated: true }, 200, origin);
  }
  const toEmail = env.BOOKING_TO_EMAIL?.trim() || DEFAULT_BOOKING_EMAIL3;
  try {
    await sendEmail(env, {
      to: toEmail,
      subject: buildQuoteLeadSubject(details),
      body: buildQuoteLeadMessage(details)
    });
  } catch (error) {
    console.error("Quote lead email failed", error);
    return json2({ error: "Failed to send quote alert email" }, 502, origin);
  }
  return json2({ ok: true, emailed: true }, 200, origin);
}
__name(handleQuoteLeadRequest, "handleQuoteLeadRequest");
async function handleBookingRequest(request, env, origin) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json2({ error: "Invalid JSON" }, 400, origin);
  }
  const customerName = body.customerName?.trim() ?? "";
  const message = body.message?.trim() ?? "";
  const shouldSendEmail = body.sendEmail !== false;
  if (!customerName || !message) {
    return json2({ error: "Missing required fields" }, 400, origin);
  }
  let bookingReference = null;
  try {
    bookingReference = await allocateBookingReference(env);
  } catch (error) {
    console.error("Booking reference allocation failed", error);
  }
  let emailSent = false;
  if (shouldSendEmail) {
    try {
      await sendBookingEmail(env, customerName, message, bookingReference);
      emailSent = true;
    } catch (error) {
      console.error("Booking email failed", error);
      const calendar2 = await logBookingCalendar(env, body, customerName, message);
      if (calendar2.logged) {
        return json2(
          {
            ok: true,
            bookingReference: bookingReference ?? void 0,
            emailSent: false,
            calendarLogged: true,
            calendarEvents: calendar2.events,
            warning: "Booking email failed but the trip was logged to Google Calendar"
          },
          200,
          origin
        );
      }
      return json2({ error: "Failed to send booking email" }, 502, origin);
    }
  }
  const calendar = await logBookingCalendar(env, body, customerName, message);
  if (!shouldSendEmail && !calendar.logged && calendarConfigured3(env) && calendar.error) {
    return json2(
      { error: "Failed to log booking to Google Calendar", detail: calendar.error },
      502,
      origin
    );
  }
  return json2(
    {
      ok: true,
      bookingReference: bookingReference ?? void 0,
      emailSent,
      calendarLogged: calendar.logged,
      calendarEvents: calendar.events ?? 0
    },
    200,
    origin
  );
}
__name(handleBookingRequest, "handleBookingRequest");
async function handleCalendarStatusRequest(env, origin) {
  const calendarId = env.GOOGLE_CALENDAR_ID?.trim() ?? "";
  const serviceAccountJson = env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON?.trim() ?? "";
  if (!calendarId || !serviceAccountJson) {
    return json2(
      {
        connected: false,
        configured: false,
        calendarId: calendarId || null,
        reason: "missing_secrets",
        message: "Google Calendar secrets are not set on the worker. Add GOOGLE_CALENDAR_ID and GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON."
      },
      200,
      origin
    );
  }
  try {
    const serviceAccount = parseServiceAccountJson(serviceAccountJson);
    await getGoogleAccessToken(serviceAccount);
    return json2(
      {
        connected: true,
        configured: true,
        calendarId,
        serviceAccountEmail: serviceAccount.client_email,
        message: `Calendar API authentication succeeded for ${calendarId}.`
      },
      200,
      origin
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown calendar error";
    const trimmed = serviceAccountJson.trim();
    return json2(
      {
        connected: false,
        configured: true,
        calendarId,
        reason: "auth_failed",
        detail,
        secretLength: trimmed.length,
        secretStartsWithBrace: trimmed.startsWith("{"),
        secretContainsClientEmail: trimmed.includes("client_email"),
        secretContainsPrivateKey: trimmed.includes("private_key"),
        message: "Calendar secrets are set but authentication failed. Check the service account JSON key."
      },
      200,
      origin
    );
  }
}
__name(handleCalendarStatusRequest, "handleCalendarStatusRequest");
async function handlePaymentRequest(request, env, origin) {
  const apiKey = env.SUMUP_API_KEY?.trim() ?? "";
  const merchantCode = env.SUMUP_MERCHANT_CODE?.trim() ?? "";
  if (!apiKey || !merchantCode) {
    return json2({ error: "SumUp payment is not configured" }, 503, origin);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json2({ error: "Invalid JSON" }, 400, origin);
  }
  const amount = Number(body.amount);
  const description = body.description?.trim() ?? "";
  const redirectUrl = body.redirectUrl?.trim() ?? "";
  if (!Number.isFinite(amount) || amount < 1 || amount > 5e3) {
    return json2({ error: "Invalid payment amount" }, 400, origin);
  }
  if (!description) {
    return json2({ error: "Missing payment description" }, 400, origin);
  }
  if (!redirectUrl) {
    return json2({ error: "Missing redirect URL" }, 400, origin);
  }
  try {
    const checkoutReference = body.checkoutReference?.trim() || buildCheckoutReference();
    const checkout = await createSumUpHostedCheckout(apiKey, merchantCode, {
      amount: Math.round(amount * 100) / 100,
      description,
      checkoutReference,
      redirectUrl
    });
    return json2(
      {
        ok: true,
        paymentUrl: checkout.paymentUrl,
        checkoutId: checkout.checkoutId,
        checkoutReference: checkout.checkoutReference
      },
      200,
      origin
    );
  } catch (error) {
    console.error("SumUp checkout failed", error);
    return json2({ error: "Could not create SumUp payment link" }, 502, origin);
  }
}
__name(handlePaymentRequest, "handlePaymentRequest");
async function handlePaymentConfirmRequest(request, env, origin) {
  const apiKey = env.SUMUP_API_KEY?.trim() ?? "";
  if (!apiKey) {
    return json2({ error: "SumUp payment is not configured" }, 503, origin);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json2({ error: "Invalid JSON" }, 400, origin);
  }
  const checkoutId = String(body.checkoutId ?? "").trim();
  const booking = parsePaidBookingDetails(body);
  if (!checkoutId || !booking) {
    return json2({ error: "Missing checkout or booking details" }, 400, origin);
  }
  try {
    const checkout = await getSumUpCheckout(apiKey, checkoutId);
    if (!isSumUpCheckoutPaid(checkout)) {
      return json2({ error: "Payment has not been completed yet" }, 402, origin);
    }
    const amountPaid = formatPaidAmount(checkout.amount ?? 0, checkout.currency ?? "GBP");
    const transactionCode = getSuccessfulTransactionCode(checkout);
    const transactionId = getSuccessfulTransactionId(checkout);
    const paymentReference = transactionCode ?? checkout.checkout_reference ?? checkout.id;
    const receipt = {
      ...booking,
      amountPaid,
      paymentReference,
      transactionCode,
      checkoutReference: checkout.checkout_reference
    };
    const tracking = await createTrackingJobForPaidBooking(env, booking, paymentReference);
    const customerEmail = buildCustomerConfirmationEmail(receipt, BUSINESS_NAME4, {
      trackUrl: tracking.trackUrl
    });
    const ownerEmail = buildOwnerPaidBookingEmail(receipt, BUSINESS_NAME4, {
      trackUrl: tracking.trackUrl
    });
    const customerEmailResult = await trySendEmail(env, {
      to: booking.customerEmail,
      toName: booking.customerName,
      subject: customerEmail.subject,
      body: customerEmail.text,
      htmlBody: customerEmail.html
    });
    const ownerEmailResult = await trySendEmail(env, {
      to: env.BOOKING_TO_EMAIL?.trim() || DEFAULT_BOOKING_EMAIL3,
      subject: ownerEmail.subject,
      body: ownerEmail.body
    });
    const calendar = await logPaidBookingCalendar(env, booking, amountPaid, paymentReference);
    await savePaidBookingRecordFromConfirm({
      env,
      booking,
      checkoutId,
      transactionId,
      transactionCode,
      amount: checkout.amount ?? 0,
      currency: checkout.currency ?? "GBP",
      amountPaidLabel: amountPaid,
      paymentReference,
      trackingToken: tracking.token,
      calendarEventIds: calendar.eventIds ?? []
    });
    const emailSent = customerEmailResult.sent && ownerEmailResult.sent;
    const emailWarnings = [];
    if (!customerEmailResult.sent) {
      emailWarnings.push(
        customerEmailResult.error ? `Customer confirmation email failed: ${customerEmailResult.error}` : "Customer confirmation email failed"
      );
    }
    if (!ownerEmailResult.sent) {
      emailWarnings.push(
        ownerEmailResult.error ? `Owner notification email failed: ${ownerEmailResult.error}` : "Owner notification email failed"
      );
    }
    return json2(
      {
        ok: true,
        paid: true,
        amountPaid,
        paymentReference,
        emailSent,
        customerEmailSent: customerEmailResult.sent,
        ownerEmailSent: ownerEmailResult.sent,
        ...emailWarnings.length > 0 ? { emailWarning: emailWarnings.join("; ") } : {},
        calendarLogged: calendar.logged,
        calendarEvents: calendar.events ?? 0,
        ...calendar.error ? { calendarWarning: calendar.error } : {},
        trackingCreated: tracking.created,
        ...tracking.trackUrl ? { trackUrl: tracking.trackUrl } : {}
      },
      200,
      origin
    );
  } catch (error) {
    console.error("Payment confirmation failed", error);
    const detail = error instanceof Error ? error.message : "Unknown payment confirmation error";
    return json2(
      {
        error: "Could not confirm payment",
        detail
      },
      502,
      origin
    );
  }
}
__name(handlePaymentConfirmRequest, "handlePaymentConfirmRequest");
async function handleFlightLookupRequest(url, env, origin) {
  try {
    const flightNumber = url.searchParams.get("flight")?.trim() ?? "";
    const tripDate = url.searchParams.get("date")?.trim() ?? "";
    const airportCode = url.searchParams.get("airport")?.trim().toUpperCase() ?? "";
    const directionParam = url.searchParams.get("direction")?.trim() ?? "from-airport";
    const direction = directionParam === "to-airport" ? "to-airport" : "from-airport";
    const airportNames = {
      BFS: "Belfast International",
      BHD: "George Best Belfast City",
      DUB: "Dublin Airport",
      LDY: "City of Derry"
    };
    const configured = Boolean(env.AERODATABOX_RAPIDAPI_KEY?.trim());
    const flightCache = caches.default;
    const cacheKey = new Request(url.toString(), { method: "GET" });
    const cached = await flightCache.match(cacheKey);
    if (cached) {
      const cachedBody = await cached.json();
      if (cachedBody.code !== "rate_limited") {
        return json2(cachedBody, cached.status, origin);
      }
    }
    const result = await lookupFlight(env.AERODATABOX_RAPIDAPI_KEY, {
      flightNumber,
      tripDate,
      airportCode,
      airportName: airportNames[airportCode] ?? airportCode,
      direction
    });
    if (!result.ok) {
      const status = result.code === "api_unavailable" || result.code === "rate_limited" ? 503 : 404;
      const responseBody2 = {
        ok: false,
        error: result.error,
        code: result.code,
        configured: result.code === "rate_limited" ? false : configured
      };
      if (result.code !== "rate_limited") {
        const response2 = json2(responseBody2, status, origin);
        await flightCache.put(
          cacheKey,
          new Response(JSON.stringify(responseBody2), {
            status,
            headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=600" }
          })
        );
        return response2;
      }
      return json2(responseBody2, status, origin);
    }
    const responseBody = {
      ok: true,
      flight: result.flight,
      configured
    };
    const response = json2(responseBody, 200, origin);
    await flightCache.put(
      cacheKey,
      new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=600" }
      })
    );
    return response;
  } catch (error) {
    console.error("Flight lookup failed", error);
    return json2(
      {
        ok: false,
        error: "Flight verification hit a temporary error. You can still enter your flight number and continue.",
        code: "upstream_error",
        configured: false
      },
      503,
      origin
    );
  }
}
__name(handleFlightLookupRequest, "handleFlightLookupRequest");
var src_default = {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const url = new URL(request.url);
    const route = routePath(url.pathname);
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin)
      });
    }
    const trackSubRoute = parseTrackSubRoute(url.pathname);
    if (trackSubRoute === "sharing" && request.method === "POST") {
      return handleCustomerSharingRequest(request, env, origin);
    }
    if (trackSubRoute === "location" && request.method === "POST") {
      return handleCustomerLocationRequest(request, env, origin);
    }
    const trackToken = parseTrackTokenFromPath(url.pathname);
    if (trackToken && request.method === "GET") {
      return handlePublicTrackRequest(trackToken, env, origin);
    }
    const driverRoute = parseDriverRoute(url.pathname);
    if (driverRoute === "jobs" && request.method === "GET") {
      return handleDriverJobsRequest(request, env, origin);
    }
    if (driverRoute === "status" && request.method === "GET") {
      return handleDriverStatusRequest(request, env, origin);
    }
    if (driverRoute === "bookings-update" && request.method === "POST") {
      return handleDriverUpdateBookingRequest(request, env, origin);
    }
    if (driverRoute === "sharing" && request.method === "POST") {
      return handleDriverSharingRequest(request, env, origin);
    }
    if (driverRoute === "location" && request.method === "POST") {
      return handleDriverLocationRequest(request, env, origin);
    }
    if (!route) {
      return json2({ error: "Not found" }, 404, origin);
    }
    if (route === "bookings") {
      if (request.method !== "POST") {
        return json2({ error: "Method not allowed" }, 405, origin);
      }
      return handleBookingRequest(request, env, origin);
    }
    if (route === "bookings-refund") {
      if (request.method !== "POST") {
        return json2({ error: "Method not allowed" }, 405, origin);
      }
      return handleRefundRequest(request, env, origin);
    }
    if (route === "quote-leads") {
      if (request.method !== "POST") {
        return json2({ error: "Method not allowed" }, 405, origin);
      }
      return handleQuoteLeadRequest(request, env, origin);
    }
    if (route === "payments") {
      if (request.method !== "POST") {
        return json2({ error: "Method not allowed" }, 405, origin);
      }
      return handlePaymentRequest(request, env, origin);
    }
    if (route === "payments-confirm") {
      if (request.method !== "POST") {
        return json2({ error: "Method not allowed" }, 405, origin);
      }
      return handlePaymentConfirmRequest(request, env, origin);
    }
    if (route === "flights") {
      if (request.method !== "GET") {
        return json2({ error: "Method not allowed" }, 405, origin);
      }
      return handleFlightLookupRequest(url, env, origin);
    }
    if (route === "calendar-status") {
      if (request.method !== "GET") {
        return json2({ error: "Method not allowed" }, 405, origin);
      }
      return handleCalendarStatusRequest(env, origin);
    }
    if (request.method !== "GET") {
      return json2({ error: "Method not allowed" }, 405, origin);
    }
    if (!env.GOOGLE_PLACES_API_KEY && !env.GETADDRESS_API_KEY) {
      return json2({ error: "Address lookup is not configured" }, 503, origin);
    }
    if (route === "geocode") {
      const lat = url.searchParams.get("lat");
      const lon = url.searchParams.get("lon");
      const airportCode2 = url.searchParams.get("airport")?.trim().toUpperCase() ?? "";
      if (!lat || !lon) {
        return json2({ error: "Missing coordinates" }, 400, origin);
      }
      const latitude = Number(lat);
      const longitude = Number(lon);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return json2({ error: "Invalid coordinates" }, 400, origin);
      }
      try {
        const address = await reverseGeocodeGoogle(
          env.GOOGLE_PLACES_API_KEY,
          latitude,
          longitude,
          airportCode2
        );
        if (!address) {
          return json2({ error: "Location is outside the service area" }, 404, origin);
        }
        return json2({ address, provider: "google" }, 200, origin);
      } catch {
        return json2({ error: "Geocoding failed" }, 502, origin);
      }
    }
    const id = url.searchParams.get("id")?.trim();
    const query = url.searchParams.get("q")?.trim() ?? "";
    const airportCode = url.searchParams.get("airport")?.trim().toUpperCase() ?? "";
    const sessionToken = url.searchParams.get("session")?.trim() ?? void 0;
    if (id) {
      try {
        if (id.startsWith("ga:") && env.GETADDRESS_API_KEY) {
          const address2 = await resolveGetAddress(env.GETADDRESS_API_KEY, id, airportCode);
          if (!address2) {
            return json2({ error: "Address not found" }, 404, origin);
          }
          return json2({ address: address2, provider: "getaddress" }, 200, origin);
        }
        if (!env.GOOGLE_PLACES_API_KEY) {
          return json2({ error: "Address lookup is not configured" }, 503, origin);
        }
        const address = await resolveGooglePlace(
          env.GOOGLE_PLACES_API_KEY,
          id,
          airportCode,
          sessionToken
        );
        if (!address) {
          return json2({ error: "Address not found" }, 404, origin);
        }
        return json2({ address, provider: "google" }, 200, origin);
      } catch {
        return json2({ error: "Address lookup failed" }, 502, origin);
      }
    }
    if (query.length < 3) {
      return json2({ suggestions: [] }, 200, origin);
    }
    try {
      const tasks = [];
      if (env.GETADDRESS_API_KEY && airportCode !== "DUB" && (airportCode !== "LDY" || isNorthernIrelandPostcodeQuery(query))) {
        tasks.push(searchGetAddress(env.GETADDRESS_API_KEY, query, airportCode));
      }
      if (env.GOOGLE_PLACES_API_KEY) {
        tasks.push(
          searchGooglePlaces(env.GOOGLE_PLACES_API_KEY, query, airportCode, sessionToken)
        );
        if (!extractLeadingStreetNumber(query)) {
          tasks.push(
            searchGoogleEstablishments(
              env.GOOGLE_PLACES_API_KEY,
              query,
              airportCode,
              sessionToken
            )
          );
        }
        if (isStreetOnlyQuery(query)) {
          tasks.push(
            searchGoogleStreetAddresses(env.GOOGLE_PLACES_API_KEY, query, airportCode)
          );
        }
      }
      const results = await Promise.all(tasks.map((task) => task.catch(() => [])));
      const suggestions = results.flat();
      const seen = /* @__PURE__ */ new Set();
      const merged = sortSuggestionsByStreetNumber(
        suggestions.filter((item) => {
          const key = item.label.toLowerCase();
          if (seen.has(key)) {
            return false;
          }
          seen.add(key);
          return true;
        })
      );
      return json2(
        {
          suggestions: merged.slice(0, 8),
          provider: env.GETADDRESS_API_KEY ? "getaddress+google" : "google"
        },
        200,
        origin
      );
    } catch {
      return json2({ error: "Address lookup failed" }, 502, origin);
    }
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      processDueReviewRequests(env).then((result) => {
        if (result.sent > 0 || result.errors > 0) {
          console.log("Review request cron", JSON.stringify(result));
        }
      })
    );
  }
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-4q5i8b/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-4q5i8b/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof __Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
__name(__Facade_ScheduledController__, "__Facade_ScheduledController__");
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = (request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    };
    #dispatcher = (type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    };
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
