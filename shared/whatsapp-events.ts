/**
 * Big events the WhatsApp assistant should recognise from a journey (12 Nov 2026).
 * A pickup or destination at the venue on an event date is almost certainly for the
 * event, so the assistant can say so and mention that availability is limited.
 *
 * To add an event: copy an entry, set the venue words, dates (YYYY-MM-DD) and show time.
 * The note is what the owner wants customers told about it.
 */
export type WhatsAppEvent = {
  id: string;
  name: string;
  venue: string;
  /** Words that mean the venue in a typed or Google address. */
  venuePattern: RegExp;
  dates: string[];
  /** Show start, 24-hour HH:MM. */
  showTime: string;
  note: string;
};

export const WHATSAPP_EVENTS: WhatsAppEvent[] = [
  {
    id: "garth-brooks-belfast-2027",
    name: "Garth Brooks concert",
    venue: "Boucher Road Playing Fields, Belfast",
    venuePattern: /\bboucher\b/i,
    dates: ["2027-05-21", "2027-05-22"],
    showTime: "18:00",
    note: "We already have a lot of bookings for the Garth Brooks concerts, so availability is limited and it's worth booking soon.",
  },
];

export type WhatsAppEventMatch = {
  event: WhatsAppEvent;
  /** The journey date that falls on an event date, or null when no date is known yet. */
  date: string | null;
};

/**
 * The event this journey looks like it's for: the venue named in the pickup / destination
 * (or the message), on an event date, or with no date yet. Past events are ignored.
 */
export function matchWhatsAppEvent(
  input: { addresses: Array<string | undefined>; dates: Array<string | undefined>; text?: string },
  now: Date = new Date(),
  events: WhatsAppEvent[] = WHATSAPP_EVENTS,
): WhatsAppEventMatch | null {
  const today = now.toISOString().slice(0, 10);
  const places = [...input.addresses, input.text].filter(Boolean).join(" \n ");
  const dates = input.dates.filter((d): d is string => Boolean(d));
  for (const event of events) {
    if (event.dates.every((d) => d < today)) continue;
    if (!event.venuePattern.test(places)) continue;
    const date = dates.find((d) => event.dates.includes(d)) ?? null;
    if (date) return { event, date };
    if (dates.length === 0) return { event, date: null };
  }
  return null;
}

function longDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** What the assistant is told about a matched event. */
export function describeWhatsAppEventForAi(match: WhatsAppEventMatch): string {
  const { event } = match;
  const when = event.dates.map(longDate).join(" and ");
  const head = `${event.name} at ${event.venue}: ${when}, show starts ${event.showTime}.`;
  return match.date
    ? `${head} This journey is on ${longDate(match.date)}, so it is almost certainly for the concert. ` +
        `Say so naturally once (e.g. "Is this for Garth Brooks?" or "Heading to see Garth Brooks?"), and mention once: ${event.note}`
    : `${head} The journey involves this venue but the date isn't known yet: if they give one of these dates, it's for the concert.`;
}
