/**
 * Big-event notices on the website quote tool (owner, 15 Nov 2026 — trial).
 *
 * A quote whose drop-off is in the event's city (Greater Belfast / Dublin) (or that names the venue) on a date inside
 * the event's notice window gets a "limited availability, book early" message.
 *
 * To add an event: copy an entry, set the dates (YYYY-MM-DD) and the window.
 * Past events drop off by themselves. The WhatsApp assistant has its own list
 * (whatsapp-events.ts) and is not affected by this one.
 */
import { isGreaterBelfastServiceAddress } from "./ldy-service-area";

export type WebsiteEventCity = "belfast" | "dublin";
export type WebsiteEventKind = "concert" | "match" | "festival";

export type WebsiteEventNotice = {
  id: string;
  /** Headline shown to customers, e.g. "Garth Brooks at Boucher Road". */
  title: string;
  kind: WebsiteEventKind;
  city: WebsiteEventCity;
  /** Words that mean the venue in a typed or Google address. */
  venuePattern: RegExp;
  dates: string[];
  /** Days before the first date and after the last date that also get the notice. */
  daysBefore: number;
  daysAfter: number;
  /** Venue named and no date picked yet: show it anyway (the event is the likely reason). */
  showForVenueWithoutDate?: boolean;
};

const BOUCHER = /\bboucher\b/i;
const ORMEAU_PARK = /\bormeau park\b/i;
const AVIVA = /\b(aviva stadium|lansdowne road)\b/i;
const CROKE_PARK = /\bcroke park\b/i;
const MARLAY_PARK = /\bmarlay park\b/i;

export const WEBSITE_EVENT_NOTICES: WebsiteEventNotice[] = [
  // ── Belfast ─────────────────────────────────────────────────────────────
  {
    id: "garth-brooks-belfast-2027",
    title: "Garth Brooks at Boucher Road",
    kind: "concert",
    city: "belfast",
    venuePattern: BOUCHER,
    // Sun 23 May added 12 Nov 2026 after the first two nights sold out.
    dates: ["2027-05-21", "2027-05-22", "2027-05-23"],
    // Owner: from a few days before up until the Sunday.
    daysBefore: 3,
    daysAfter: 0,
    showForVenueWithoutDate: true,
  },
  { id: "belsonic-kingfishr-2027", title: "Kingfishr at Belsonic, Ormeau Park", kind: "concert", city: "belfast", venuePattern: ORMEAU_PARK, dates: ["2027-06-11"], daysBefore: 0, daysAfter: 0 },
  { id: "belsonic-sombr-2027", title: "sombr at Belsonic, Ormeau Park", kind: "concert", city: "belfast", venuePattern: ORMEAU_PARK, dates: ["2027-06-17"], daysBefore: 0, daysAfter: 0 },
  { id: "belsonic-amble-2027", title: "Amble at Belsonic, Ormeau Park", kind: "concert", city: "belfast", venuePattern: ORMEAU_PARK, dates: ["2027-06-23"], daysBefore: 0, daysAfter: 0 },
  { id: "belsonic-take-that-2027", title: "Take That at Belsonic, Ormeau Park", kind: "concert", city: "belfast", venuePattern: ORMEAU_PARK, dates: ["2027-06-30"], daysBefore: 0, daysAfter: 0 },

  // ── Dublin ──────────────────────────────────────────────────────────────
  { id: "six-nations-ire-eng-2027", title: "Ireland v England at the Aviva", kind: "match", city: "dublin", venuePattern: AVIVA, dates: ["2027-02-05"], daysBefore: 1, daysAfter: 1 },
  { id: "six-nations-ire-fra-2027", title: "Ireland v France at the Aviva", kind: "match", city: "dublin", venuePattern: AVIVA, dates: ["2027-03-13"], daysBefore: 1, daysAfter: 1 },
  { id: "kingfishr-marlay-2027", title: "Kingfishr at Marlay Park", kind: "concert", city: "dublin", venuePattern: MARLAY_PARK, dates: ["2027-06-19"], daysBefore: 1, daysAfter: 0 },
  { id: "noah-kahan-aviva-2027", title: "Noah Kahan at the Aviva", kind: "concert", city: "dublin", venuePattern: AVIVA, dates: ["2027-07-17", "2027-07-18"], daysBefore: 1, daysAfter: 1 },
  { id: "harry-styles-croke-park-2027", title: "Harry Styles at Croke Park", kind: "concert", city: "dublin", venuePattern: CROKE_PARK, dates: ["2027-08-18", "2027-08-20", "2027-08-21"], daysBefore: 1, daysAfter: 1 },
];

const CITY_RULES: Record<WebsiteEventCity, (dropoff: string) => boolean> = {
  // Owner (15 Nov 2026): any drop-off in Greater Belfast — the same area the instant quotes use.
  // Airports are never counted.
  belfast: (dropoff) => isGreaterBelfastServiceAddress(dropoff),
  // Dublin city: Dublin 1–24 / D01–D24 Eircodes, or "Dublin" with no other county named.
  dublin: (dropoff) => {
    const eircode = dropoff.toUpperCase().match(/\bD(\d{2})\b|\bD6W\b/);
    if (eircode) return true;
    if (/\bdublin\s+\d{1,2}w?\b/i.test(dropoff)) return true;
    return /\bdublin\b/i.test(dropoff) && !/\b(co\.?|county)\s+(meath|kildare|wicklow|louth)\b/i.test(dropoff);
  },
};

function isAirport(text: string): boolean {
  return /\bairport\b/i.test(text);
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function eventNoticeWindow(event: WebsiteEventNotice): { from: string; to: string } {
  const sorted = [...event.dates].sort();
  return { from: addDays(sorted[0], -event.daysBefore), to: addDays(sorted[sorted.length - 1], event.daysAfter) };
}

/** The event notice for this quote, or null. */
export function matchWebsiteEventNotice(
  input: { pickup?: string; dropoff?: string; dates: Array<string | undefined> },
  now: Date = new Date(),
  events: WebsiteEventNotice[] = WEBSITE_EVENT_NOTICES,
): WebsiteEventNotice | null {
  const today = now.toISOString().slice(0, 10);
  const dates = input.dates.filter((d): d is string => Boolean(d));
  const places = [input.pickup, input.dropoff].filter(Boolean).join(" \n ");
  for (const event of events) {
    const window = eventNoticeWindow(event);
    if (window.to < today) continue;
    const inWindow = dates.some((d) => d >= window.from && d <= window.to);
    const venueNamed = event.venuePattern.test(places);
    if (venueNamed && (inWindow || (dates.length === 0 && event.showForVenueWithoutDate))) return event;
    const dropoff = input.dropoff ?? "";
    if (inWindow && dropoff && !isAirport(dropoff) && CITY_RULES[event.city](dropoff)) return event;
  }
  return null;
}

/** "Fri 21, Sat 22 & Sun 23 May" */
export function websiteEventDatesLabel(event: WebsiteEventNotice): string {
  const parts = [...event.dates].sort().map((iso) => new Date(`${iso}T12:00:00Z`));
  const day = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" });
  const month = (d: Date) => d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  const sameMonth = parts.every((d) => d.getUTCMonth() === parts[0].getUTCMonth());
  const labels = sameMonth ? parts.map(day) : parts.map((d) => `${day(d)} ${month(d)}`);
  const joined = labels.length > 1 ? `${labels.slice(0, -1).join(", ")} & ${labels[labels.length - 1]}` : labels[0];
  return sameMonth ? `${joined} ${parts[0].toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" })}` : joined;
}

export function websiteEventReason(event: WebsiteEventNotice): string {
  return event.kind === "match" ? "match-day bookings" : event.kind === "festival" ? "festival bookings" : "concert bookings";
}

export function websiteEventIcon(event: WebsiteEventNotice): string {
  return event.kind === "match" ? "🏉" : "🎵";
}
