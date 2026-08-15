/**
 * Patches areaAirportSurchargesGbp values inside src/lib/pricing-config.json
 * (multi-line JSON objects).
 */

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replace one airport surcharge for an area in pricing-config.json.
 * Supports multi-line objects:
 *   "Antrim": {
 *     "BFS": 0,
 *     "BHD": 29,
 *     ...
 *   }
 */
export function patchAreaAirportSurcharge(source, area, airportCode, surcharge) {
  const areaKey = `"${escapeRegExp(area)}"`;
  const airportKey = `"${escapeRegExp(airportCode)}"`;

  // Match from the area key through the closing brace of its object, then
  // replace the specific airport code value inside that block only.
  const blockRegex = new RegExp(
    `(${areaKey}\\s*:\\s*\\{)([\\s\\S]*?)(\\n\\s*\\})`,
    "m",
  );
  const blockMatch = source.match(blockRegex);
  if (!blockMatch) {
    throw new Error(`Could not find surcharge block for ${area}`);
  }

  const before = blockMatch[1];
  const body = blockMatch[2];
  const after = blockMatch[3];
  const valueRegex = new RegExp(`(${airportKey}\\s*:\\s*)\\d+`);
  if (!valueRegex.test(body)) {
    throw new Error(`Could not find surcharge line for ${area} / ${airportCode}`);
  }

  const nextBody = body.replace(valueRegex, `$1${surcharge}`);
  return source.replace(blockMatch[0], `${before}${nextBody}${after}`);
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
