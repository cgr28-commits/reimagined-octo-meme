/**
 * PROVISIONAL journey estimator (staging demonstrations only). It is NOT a routing provider and is not calibrated:
 * straight-line distance x a road factor, at tiered average speeds. Real routing arrives later and replaces this.
 * Traffic percentages and peak-hour uplifts are deliberately NOT configured (null): nothing here invents them.
 */
export const ESTIMATOR = Object.freeze({
  id: "provisional-straight-line/1",
  circuity: 1.3,
  minLegMinutes: 5,
  stopOverheadMinutes: 5, // parking, walking to the entrance, getting back to the car
  tiers: Object.freeze([
    Object.freeze({ upToKm: 8, kmh: 30 }),
    Object.freeze({ upToKm: 25, kmh: 45 }),
    Object.freeze({ upToKm: 60, kmh: 65 }),
    Object.freeze({ upToKm: Infinity, kmh: 80 }),
  ]),
  trafficUpliftPercent: null,
  peakHourUpliftPercent: null,
  accuracyNote: "Drive times are provisional estimates and are checked before any quote.",
});

/**
 * The driver's routing anchor (owner configurable). Village-level Glengormley, deliberately NOT the private address.
 * Server-side only: it is never part of any public response.
 */

const rad = (d) => (d * Math.PI) / 180;
export function haversineKm(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** @returns {{km:number, minutes:number}} road kilometres and minutes for one leg */
export function legEstimate(a, b) {
  const km = haversineKm(a, b) * ESTIMATOR.circuity;
  const tier = ESTIMATOR.tiers.find((t) => km <= t.upToKm);
  const minutes = Math.max(ESTIMATOR.minLegMinutes, Math.round((km / tier.kmh) * 60));
  return { km: Math.round(km * 10) / 10, minutes };
}

export const toHM = (minutes) => {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
export const parseHM = (text) => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(typeof text === "string" ? text : "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
export function durationLabel(minutes) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}
