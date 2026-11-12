/**
 * Events the owner can pick from in Quick Quote (12 Nov 2026). Add an entry for each
 * big event; past events drop off the list by themselves.
 */
export type KnownEvent = { id: string; label: string; date: string };

export const KNOWN_EVENTS: KnownEvent[] = [
  { id: "garth-brooks-2027-05-21", label: "Garth Brooks – Boucher Road (Fri 21 May 2027)", date: "2027-05-21" },
  { id: "garth-brooks-2027-05-22", label: "Garth Brooks – Boucher Road (Sat 22 May 2027)", date: "2027-05-22" },
];

/** Events still to come (today included), soonest first. */
export function upcomingKnownEvents(now: Date = new Date(), events: KnownEvent[] = KNOWN_EVENTS): KnownEvent[] {
  const today = now.toISOString().slice(0, 10);
  return events.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
}
