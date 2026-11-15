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
  /** Website quote tool: a drop-off anywhere in this city on a show day also gets the notice. */
  cityDropoff?: { namePattern: RegExp; postcodeDistricts: number[] };
  /** Website quote tool: journey dates (inclusive, YYYY-MM-DD) that get the notice. */
  websiteNoticeWindow?: { from: string; to: string };
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
    // Belfast city: BT1–BT17 (Belfast City Airport and Belfast International excluded as airports).
    // Owner (15 Nov 2026): from a few days before the shows up to the Sunday after.
    websiteNoticeWindow: { from: "2027-05-18", to: "2027-05-23" },
    cityDropoff: { namePattern: /\bbelfast\b/i, postcodeDistricts: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17] },
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

/**
 * Website quote tool (15 Nov 2026): anyone quoting to or from the venue, or into the city,
 * for a date in the event's notice window sees a "limited availability, book early" notice.
 */
export function matchEventForWebsiteQuote(
  input: {
    addresses: Array<string | undefined>;
    dates: Array<string | undefined>;
    /** Where the customer is going: a Belfast drop-off on a show day also gets the notice. */
    dropoff?: string;
  },
  now: Date = new Date(),
  events: WhatsAppEvent[] = WHATSAPP_EVENTS,
): WhatsAppEvent | null {
  const today = now.toISOString().slice(0, 10);
  const places = input.addresses.filter(Boolean).join(" \n ");
  const dates = input.dates.filter((d): d is string => Boolean(d));
  for (const event of events) {
    if (event.dates.every((d) => d < today)) continue;
    const window = event.websiteNoticeWindow ?? { from: event.dates[0], to: event.dates[event.dates.length - 1] };
    const inWindow = dates.some((d) => d >= window.from && d <= window.to);
    // Venue named, date not picked yet: likely for the show.
    if (event.venuePattern.test(places) && (dates.length === 0 || inWindow)) return event;
    // Owner (15 Nov 2026): anyone going into Belfast from anywhere in the window.
    if (event.cityDropoff && isCityDropoff(input.dropoff, event.cityDropoff) && inWindow) return event;
  }
  return null;
}

/** Drop-off in the city itself: city name or city postcode, and not an airport. */
function isCityDropoff(dropoff: string | undefined, city: NonNullable<WhatsAppEvent["cityDropoff"]>): boolean {
  if (!dropoff || /\bairport\b/i.test(dropoff)) return false;
  const postcode = dropoff.toUpperCase().match(/\bBT(\d{1,2})\b/);
  if (postcode) return city.postcodeDistricts.includes(Number(postcode[1]));
  return city.namePattern.test(dropoff);
}

/** "Fri 21 & Sat 22 May" for the website notice. */
export function websiteEventDatesLabel(event: WhatsAppEvent): string {
  const parts = event.dates.map((iso) => new Date(`${iso}T12:00:00Z`));
  const day = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" });
  const month = parts[parts.length - 1].toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });
  return `${parts.map(day).join(" & ")} ${month}`;
}
