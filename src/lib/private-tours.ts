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

export const TOURS_API = (process.env.NEXT_PUBLIC_TOURS_API_URL || "").replace(/\/+$/, "");
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
