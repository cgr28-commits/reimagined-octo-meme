/**
 * Patches AREA_AIRPORT_SURCHARGES values inside src/lib/quote.ts.
 */

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function areaKeyPattern(area) {
  if (area.includes(" ") || area.includes("/")) {
    return `"${escapeRegExp(area)}"`;
  }
  return escapeRegExp(area);
}

export function patchAreaAirportSurcharge(source, area, airportCode, surcharge) {
  const areaKey = areaKeyPattern(area);
  const lineRegex = new RegExp(
    `^(\\s*${areaKey}:\\s*\\{[^\\n]*?)\\b${airportCode}:\\s*\\d+`,
    "m",
  );

  if (!lineRegex.test(source)) {
    throw new Error(`Could not find surcharge line for ${area} / ${airportCode}`);
  }

  return source.replace(lineRegex, `$1${airportCode}: ${surcharge}`);
}

export function applySurchargePatches(source, patches) {
  let next = source;
  for (const patch of patches) {
    next = patchAreaAirportSurcharge(
      next,
      patch.area,
      patch.airportCode,
      patch.surcharge,
    );
  }
  return next;
}
