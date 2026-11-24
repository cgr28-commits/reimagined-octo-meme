/**
 * Private Tours (staging preview). The itinerary engine is shared with the Worker (plain ESM in workers/tours/src/engine) so the
 * browser's instant fit checks and the server's authoritative re-check use the same rules.
 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
export {
  ATTRACTIONS, ATTRACTION_BY_ID, TAG_LABELS, REGIONS, TAGS, ZONES, ZONE_BY_ID, TOURS, TOUR_BY_ID, RULES,
  buildSchedule, publicView, suggest, suggestAdditions, bestOrder, formatPounds, toHM, parseHM, durationLabel,
} from "../../workers/tours/src/engine/index.js";

import { TOURS_LAUNCH_API_URL } from "./private-tours-mode";
export const TOURS_API = (process.env.NEXT_PUBLIC_TOURS_API_URL || TOURS_LAUNCH_API_URL || "").replace(/\/+$/, "");
export const toursApiConfigured = TOURS_API.length > 0;

export async function toursApi<T = unknown>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T | null }> {
  if (!toursApiConfigured) return { ok: false, status: 0, data: null };
  try {
    const res = await fetch(`${TOURS_API}${path}`, { ...init, headers: { "content-type": "application/json", ...(init?.headers || {}) } });
    let data: T | null = null;
    try { data = (await res.json()) as T; } catch { /* empty body */ }
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}
export const tourPhoto = (name: string) => `/images/tours/${name}.webp`;

/**
 * Public guide prices for the signature tours are the prices already published on /tours. They are never raised here.
 * The engine's own provisional figures stay in the Worker for the owner's reference only. Tours with no published price
 * (the cruise excursions) show no figure: the price is given in the personal quote.
 */
const PUBLISHED_FROM_POUNDS: Record<string, { from: number; note: string }> = {
  "giants-causeway": { from: 395, note: "full day · published price for the car, up to 4 guests" },
  "game-of-thrones": { from: 395, note: "full day · published price for the car, up to 4 guests" },
  "belfast-city": { from: 195, note: "half day · published price for the car, up to 4 guests" },
  "antrim-coast": { from: 195, note: "half day from £195, full day from £395 · for the car, up to 4 guests" },
};
export function guidePrice(tourId: string): { label: string; note: string } {
  const p = PUBLISHED_FROM_POUNDS[tourId];
  return p
    ? { label: `from £${p.from}`, note: `${p.note}. Your personal quote confirms the price for your exact route.` }
    : { label: "Price in your personal quote", note: "Cruise excursions are priced personally around your all-aboard time." };
}
