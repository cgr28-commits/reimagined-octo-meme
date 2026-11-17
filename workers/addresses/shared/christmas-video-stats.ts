/**
 * Christmas video viewing figures (owner, 17 Nov 2026) — anonymous daily totals only.
 * No IP address, cookie, email or visitor id is stored: each event adds 1 to a
 * (day, event) counter. Shown on the Owner Dashboard → Promo Codes & Email Marketing.
 */
export const CHRISTMAS_VIDEO_EVENTS = [
  // Welcome pop-up
  "popup_shown", // pop-up opened and the video started (or was offered to play)
  "popup_watched", // video played to the end
  "popup_skipped", // pressed Skip
  "popup_closed", // closed (×, Escape or tapping outside) before the video finished
  "popup_sound_on", // turned the sound on
  "popup_offer_seen", // reached the 10% offer
  "popup_claim", // pressed "Claim My 10% Discount"
  "popup_code_sent", // discount code emailed from the pop-up
  "popup_get_quote", // pressed "Get My Quote"
  // Homepage video section (below the quote calculator)
  "section_play", // pressed play
  "section_watched", // played to the end
] as const;

export type ChristmasVideoEvent = (typeof CHRISTMAS_VIDEO_EVENTS)[number];

export function isChristmasVideoEvent(value: unknown): value is ChristmasVideoEvent {
  return typeof value === "string" && (CHRISTMAS_VIDEO_EVENTS as readonly string[]).includes(value);
}

export type ChristmasVideoCounts = Record<ChristmasVideoEvent, number>;

export function emptyChristmasVideoCounts(): ChristmasVideoCounts {
  return Object.fromEntries(CHRISTMAS_VIDEO_EVENTS.map((e) => [e, 0])) as ChristmasVideoCounts;
}

export type ChristmasVideoStats = {
  totals: ChristmasVideoCounts;
  /** Newest day first, YYYY-MM-DD (Europe/London). */
  days: Array<{ day: string; counts: ChristmasVideoCounts }>;
};

/** Rows from the (day, event, count) table → totals plus one entry per day. */
export function summarizeChristmasVideoRows(rows: Array<{ day: string; event: string; count: number }>): ChristmasVideoStats {
  const totals = emptyChristmasVideoCounts();
  const byDay = new Map<string, ChristmasVideoCounts>();
  for (const row of rows) {
    if (!isChristmasVideoEvent(row.event)) continue;
    const n = Math.max(0, Math.floor(Number(row.count) || 0));
    totals[row.event] += n;
    const counts = byDay.get(row.day) ?? emptyChristmasVideoCounts();
    counts[row.event] += n;
    byDay.set(row.day, counts);
  }
  const days = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([day, counts]) => ({ day, counts }));
  return { totals, days };
}

/** Whole-number percentage, or "—" when there is nothing to divide by. */
export function christmasVideoPercent(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—";
}
