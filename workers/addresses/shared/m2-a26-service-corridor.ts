/** Reviewable destination corridor through Antrim, Ballymena, Ballymoney and Coleraine.
 * This is an approximate service-area buffer, not a driving-route calculation.
 * Route pricing continues to use measured road distance and duration.
 */
export const M2_A26_CORRIDOR_RADIUS_KM = 6;
export const M2_A26_CORRIDOR_POINTS = [
  [54.677, -5.960], // Newtownabbey / M2
  [54.704, -6.095], // Templepatrick
  [54.719, -6.210], // Antrim
  [54.865, -6.276], // Ballymena
  [55.070, -6.512], // Ballymoney
  [55.133, -6.668], // Coleraine
] as const;

export function isM2A26ServiceCorridorDestination(lat: number | null | undefined, lng: number | null | undefined): boolean {
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  // End at Coleraine; do not accidentally extend the buffer to North Coast towns.
  if (lat < 54.65 || lat > 55.155) return false;
  const scaleX = 111.32 * Math.cos(54.9 * Math.PI / 180);
  const scaleY = 111.32;
  for (let i = 1; i < M2_A26_CORRIDOR_POINTS.length; i++) {
    const a = M2_A26_CORRIDOR_POINTS[i - 1], b = M2_A26_CORRIDOR_POINTS[i];
    const dx = (b[1] - a[1]) * scaleX, dy = (b[0] - a[0]) * scaleY;
    const px = (lng - a[1]) * scaleX, py = (lat - a[0]) * scaleY;
    const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy)));
    if (Math.hypot(px - t * dx, py - t * dy) <= M2_A26_CORRIDOR_RADIUS_KM) return true;
  }
  return false;
}
