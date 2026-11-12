/**
 * The quote form that opens inside WhatsApp (a WhatsApp Flow), for customers the chat bot
 * struggles with (12 Nov 2026). The customer types where from / where to, taps the right
 * addresses (looked up on Google by the Worker), picks date, time, passengers and bags,
 * then submits; the fixed price arrives in the chat through the bot's normal pricing.
 *
 * This file is pure (no network): the Flow JSON, and what each screen does with the
 * customer's answers. The Worker (whatsapp-quote-form-endpoint.ts) does the encryption,
 * the address lookups and the storage.
 */
import { airportLabel, type QuickQuoteAirportCode } from "./quick-quote-parse";
import {
  buildWhatsAppSummary,
  explicitAirportCode,
  isWhatsAppTownOnlyAddress,
  validateWhatsAppDraft,
  type WhatsAppQuoteDraft,
} from "./whatsapp-quote-bot";

export const QUOTE_FORM_SCREENS = ["JOURNEY", "ADDRESSES", "DETAILS", "SUMMARY"] as const;
export type QuoteFormScreen = (typeof QUOTE_FORM_SCREENS)[number];

/** One address the customer can tap. */
export type QuoteFormOption = { id: string; title: string; description?: string };

/** What a tapped option stands for. */
export type QuoteFormPlace =
  | { kind: "address"; address: string; placeId: string }
  | { kind: "airport"; airportCode: QuickQuoteAirportCode };

/** Stored per form (keyed by flow token) between screens. */
export type QuoteFormSession = {
  phone: string;
  createdAt: string;
  /** Option id → what it means (pickup and destination share ids: p1.. and d1..). */
  places: Record<string, QuoteFormPlace>;
  pickup?: QuoteFormPlace;
  dropoff?: QuoteFormPlace;
  /** The address lists last shown (to show them again with a note). */
  pickupOptions?: QuoteFormOption[];
  dropoffOptions?: QuoteFormOption[];
  /** Set when the details screen is valid: the journey to price on submit. */
  draft?: WhatsAppQuoteDraft;
  /** Prefill for the first screen (from what the chat already knows). */
  prefill?: { pickup?: string; dropoff?: string };
};

/** Address search used by the form: up to 4 Google matches, or none. */
export type QuoteFormLookup = (
  typed: string,
  field: "pickupAddress" | "dropoffAddress",
) => Promise<Array<{ placeId: string; address: string }> | null>;

export type QuoteFormReply = { screen: QuoteFormScreen; data: Record<string, unknown> };

const RADIO_TITLE_MAX = 30;
const RADIO_DESCRIPTION_MAX = 300;
const TEXT_MAX = 200;

/** Pickup times every 15 minutes, 00:00–23:45. */
export const QUOTE_FORM_TIMES: QuoteFormOption[] = Array.from({ length: 96 }, (_, i) => {
  const t = `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`;
  return { id: t, title: t };
});
const PASSENGERS: QuoteFormOption[] = Array.from({ length: 8 }, (_, i) => ({
  id: String(i + 1),
  title: i === 0 ? "1 passenger" : `${i + 1} passengers`,
}));
const SUITCASES: QuoteFormOption[] = Array.from({ length: 11 }, (_, i) => ({
  id: String(i),
  title: i === 0 ? "No suitcases" : i === 1 ? "1 suitcase" : `${i} suitcases`,
}));

const optionArraySchema = (example: QuoteFormOption[]) => ({
  type: "array",
  items: {
    type: "object",
    properties: { id: { type: "string" }, title: { type: "string" }, description: { type: "string" } },
  },
  __example__: example,
});

/**
 * The Flow JSON (paste into WhatsApp Manager → Flows, or send via the API).
 * Screens: JOURNEY → ADDRESSES → DETAILS → SUMMARY (submit).
 */
export const WHATSAPP_QUOTE_FORM_JSON = {
  version: "7.3",
  data_api_version: "3.0",
  routing_model: {
    JOURNEY: ["ADDRESSES"],
    ADDRESSES: ["DETAILS"],
    DETAILS: ["SUMMARY"],
    SUMMARY: [],
  },
  screens: [
    {
      id: "JOURNEY",
      title: "Get your price",
      data: {
        pickup_init: { type: "string", __example__: "" },
        dropoff_init: { type: "string", __example__: "" },
        notice: { type: "string", __example__: "" },
        has_notice: { type: "boolean", __example__: false },
      },
      layout: {
        type: "SingleColumnLayout",
        children: [
          { type: "TextBody", text: "${data.notice}", visible: "${data.has_notice}" },
          {
            type: "TextInput",
            name: "pickup",
            label: "Pickup",
            "input-type": "text",
            required: true,
            "init-value": "${data.pickup_init}",
            "helper-text": "Address, hotel, postcode or airport",
          },
          {
            type: "TextInput",
            name: "dropoff",
            label: "Going to",
            "input-type": "text",
            required: true,
            "init-value": "${data.dropoff_init}",
            "helper-text": "Address, hotel, postcode or airport",
          },
          {
            type: "Footer",
            label: "Find addresses",
            "on-click-action": {
              name: "data_exchange",
              payload: { pickup: "${form.pickup}", dropoff: "${form.dropoff}" },
            },
          },
        ],
      },
    },
    {
      id: "ADDRESSES",
      title: "Choose addresses",
      data: {
        pickup_options: optionArraySchema([
          { id: "p1", title: "Europa Hotel", description: "Great Victoria St, Belfast BT2 7AP" },
        ]),
        dropoff_options: optionArraySchema([{ id: "d1", title: "Dublin Airport" }]),
        notice: { type: "string", __example__: "" },
        has_notice: { type: "boolean", __example__: false },
      },
      layout: {
        type: "SingleColumnLayout",
        children: [
          { type: "TextBody", text: "${data.notice}", visible: "${data.has_notice}" },
          {
            type: "TextBody",
            text: "Tap the right ones. Not listed? Go back and add the street, town or postcode.",
          },
          {
            type: "RadioButtonsGroup",
            name: "pickup_choice",
            label: "Pickup",
            required: true,
            "data-source": "${data.pickup_options}",
          },
          {
            type: "RadioButtonsGroup",
            name: "dropoff_choice",
            label: "Going to",
            required: true,
            "data-source": "${data.dropoff_options}",
          },
          {
            type: "Footer",
            label: "Continue",
            "on-click-action": {
              name: "data_exchange",
              payload: { pickup_choice: "${form.pickup_choice}", dropoff_choice: "${form.dropoff_choice}" },
            },
          },
        ],
      },
    },
    {
      id: "DETAILS",
      title: "Journey details",
      data: {
        min_date: { type: "string", __example__: "2026-11-12" },
        times: optionArraySchema(QUOTE_FORM_TIMES.slice(0, 2)),
        passenger_options: optionArraySchema(PASSENGERS.slice(0, 2)),
        suitcase_options: optionArraySchema(SUITCASES.slice(0, 2)),
        notice: { type: "string", __example__: "" },
        has_notice: { type: "boolean", __example__: false },
      },
      layout: {
        type: "SingleColumnLayout",
        children: [
          { type: "TextBody", text: "${data.notice}", visible: "${data.has_notice}" },
          { type: "DatePicker", name: "date", label: "Pickup date", required: true, "min-date": "${data.min_date}" },
          { type: "Dropdown", name: "time", label: "Pickup time", required: true, "data-source": "${data.times}" },
          {
            type: "Dropdown",
            name: "passengers",
            label: "Passengers",
            required: true,
            "data-source": "${data.passenger_options}",
          },
          {
            type: "Dropdown",
            name: "suitcases",
            label: "Suitcases",
            required: true,
            "data-source": "${data.suitcase_options}",
          },
          {
            type: "RadioButtonsGroup",
            name: "trip",
            label: "Trip",
            required: true,
            "init-value": "one_way",
            "data-source": [
              { id: "one_way", title: "One way" },
              { id: "return", title: "Return" },
            ],
          },
          {
            type: "DatePicker",
            name: "return_date",
            label: "Return date (return trips only)",
            required: false,
            "min-date": "${data.min_date}",
          },
          {
            type: "Dropdown",
            name: "return_time",
            label: "Return pickup time (return trips only)",
            required: false,
            "data-source": "${data.times}",
          },
          {
            type: "TextInput",
            name: "flight",
            label: "Flight number (if flying)",
            "input-type": "text",
            required: false,
          },
          {
            type: "Footer",
            label: "Check my journey",
            "on-click-action": {
              name: "data_exchange",
              payload: {
                date: "${form.date}",
                time: "${form.time}",
                passengers: "${form.passengers}",
                suitcases: "${form.suitcases}",
                trip: "${form.trip}",
                return_date: "${form.return_date}",
                return_time: "${form.return_time}",
                flight: "${form.flight}",
              },
            },
          },
        ],
      },
    },
    {
      id: "SUMMARY",
      title: "Check your journey",
      terminal: true,
      data: {
        summary: { type: "string", __example__: "From: Europa Hotel\nTo: Dublin Airport" },
      },
      layout: {
        type: "SingleColumnLayout",
        children: [
          { type: "TextBody", text: "${data.summary}" },
          { type: "TextBody", text: "Tap below and your fixed price will arrive in the chat." },
          {
            type: "Footer",
            label: "Get my price",
            "on-click-action": { name: "complete", payload: { submitted: "yes" } },
          },
        ],
      },
    },
  ],
} as const;

function cut(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/** "Europa Hotel, Great Victoria St, Belfast BT2 7AP" → title "Europa Hotel", description the rest. */
export function quoteFormOptionFor(id: string, address: string): QuoteFormOption {
  const [first, ...rest] = address.split(",").map((s) => s.trim()).filter(Boolean);
  const title = cut(first ?? address, RADIO_TITLE_MAX);
  const description = rest.join(", ") || (first && first.length > RADIO_TITLE_MAX ? first : "");
  return { id, title, ...(description ? { description: cut(description, RADIO_DESCRIPTION_MAX) } : {}) };
}

function ukToday(now: Date): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

function plainText(text: string): string {
  return text.replace(/\*/g, "").replace(/_/g, "");
}

export function quoteFormJourneyScreen(session: QuoteFormSession, notice = ""): QuoteFormReply {
  return {
    screen: "JOURNEY",
    data: {
      pickup_init: session.prefill?.pickup ?? "",
      dropoff_init: session.prefill?.dropoff ?? "",
      notice: cut(notice, TEXT_MAX * 2),
      has_notice: Boolean(notice),
    },
  };
}

function detailsScreen(now: Date, notice = ""): QuoteFormReply {
  return {
    screen: "DETAILS",
    data: {
      min_date: ukToday(now),
      times: QUOTE_FORM_TIMES,
      passenger_options: PASSENGERS,
      suitcase_options: SUITCASES,
      notice,
      has_notice: Boolean(notice),
    },
  };
}

function addressesScreen(session: QuoteFormSession, notice = ""): QuoteFormReply {
  return {
    screen: "ADDRESSES",
    data: {
      pickup_options: session.pickupOptions ?? [],
      dropoff_options: session.dropoffOptions ?? [],
      notice,
      has_notice: Boolean(notice),
    },
  };
}

function samePlace(a: QuoteFormPlace, b: QuoteFormPlace): boolean {
  if (a.kind === "airport" && b.kind === "airport") return a.airportCode === b.airportCode;
  if (a.kind === "address" && b.kind === "address") return a.placeId === b.placeId;
  return false;
}

async function optionsFor(
  typed: string,
  field: "pickupAddress" | "dropoffAddress",
  prefix: "p" | "d",
  lookup: QuoteFormLookup,
): Promise<{ options: QuoteFormOption[]; places: Record<string, QuoteFormPlace> } | null> {
  const code = explicitAirportCode(typed);
  if (code) {
    const id = `${prefix}-${code}`;
    return { options: [{ id, title: airportLabel(code) }], places: { [id]: { kind: "airport", airportCode: code } } };
  }
  // A town on its own ("Dublin") can't be priced: the customer is asked for the street or hotel.
  const found = (await lookup(typed, field))?.filter((m) => !isWhatsAppTownOnlyAddress(m.address));
  if (!found?.length) return null;
  const options: QuoteFormOption[] = [];
  const places: Record<string, QuoteFormPlace> = {};
  found.slice(0, 4).forEach((m, i) => {
    const id = `${prefix}${i + 1}`;
    options.push(quoteFormOptionFor(id, m.address));
    places[id] = { kind: "address", address: m.address, placeId: m.placeId };
  });
  return { options, places };
}

/** The journey the form's answers describe (addresses as tapped, airports as airports). */
export function quoteFormDraft(
  pickup: QuoteFormPlace,
  dropoff: QuoteFormPlace,
  details: {
    date: string;
    time: string;
    passengers: number;
    suitcases: number;
    returnTrip: boolean;
    returnDate?: string;
    returnTime?: string;
    flight?: string;
  },
): WhatsAppQuoteDraft {
  const draft: WhatsAppQuoteDraft = {
    outboundDate: details.date,
    outboundTime: details.time,
    passengers: details.passengers,
    suitcases: details.suitcases,
    returnJourney: details.returnTrip,
    ...(details.returnTrip ? { returnDate: details.returnDate, returnTime: details.returnTime } : {}),
    ...(details.flight ? { flightNumber: details.flight.toUpperCase().replace(/\s+/g, "") } : {}),
  };
  const set = (field: "pickupAddress" | "dropoffAddress", place: QuoteFormPlace) => {
    if (place.kind === "airport" && !draft.airportCode) {
      draft[field] = airportLabel(place.airportCode);
      draft.airportCode = place.airportCode;
      draft.fromAirport = field === "pickupAddress";
    } else if (place.kind === "airport") {
      draft[field] = airportLabel(place.airportCode);
    } else {
      draft[field] = place.address;
      draft[field === "pickupAddress" ? "pickupPlaceId" : "dropoffPlaceId"] = place.placeId;
    }
  };
  set("pickupAddress", pickup);
  set("dropoffAddress", dropoff);
  return draft;
}

/** A form value that may arrive as YYYY-MM-DD or (older clients) a timestamp in ms. */
function formDate(value: unknown): string {
  const s = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{10,13}$/.test(s)) {
    return new Date(Number(s.length === 10 ? Number(s) * 1000 : s)).toLocaleDateString("en-CA", {
      timeZone: "Europe/London",
    });
  }
  return "";
}

/**
 * What the form shows next. `screen` is the screen the customer pressed the button on
 * (or "INIT" when the form opens). Mutates `session`; the caller saves it.
 */
export async function nextQuoteFormScreen(
  session: QuoteFormSession,
  screen: string,
  data: Record<string, unknown>,
  lookup: QuoteFormLookup,
  now: Date = new Date(),
): Promise<QuoteFormReply> {
  if (screen === "INIT") return quoteFormJourneyScreen(session);

  if (screen === "JOURNEY") {
    const pickupTyped = String(data.pickup ?? "").trim();
    const dropoffTyped = String(data.dropoff ?? "").trim();
    session.prefill = { pickup: pickupTyped, dropoff: dropoffTyped };
    if (!pickupTyped || !dropoffTyped) return quoteFormJourneyScreen(session, "Please fill in both places.");
    const [pick, drop] = await Promise.all([
      optionsFor(pickupTyped, "pickupAddress", "p", lookup),
      optionsFor(dropoffTyped, "dropoffAddress", "d", lookup),
    ]);
    const missing = [!pick ? pickupTyped : null, !drop ? dropoffTyped : null].filter(Boolean) as string[];
    if (missing.length) {
      const which = missing.map((m) => `"${cut(m, 60)}"`).join(" or ");
      return quoteFormJourneyScreen(
        session,
        `We couldn't find ${which} on the map. Check the spelling, or add the street, town or postcode.`,
      );
    }
    session.places = { ...pick!.places, ...drop!.places };
    session.pickupOptions = pick!.options;
    session.dropoffOptions = drop!.options;
    delete session.pickup;
    delete session.dropoff;
    delete session.draft;
    return addressesScreen(session);
  }

  if (screen === "ADDRESSES") {
    const pickup = session.places[String(data.pickup_choice ?? "")];
    const dropoff = session.places[String(data.dropoff_choice ?? "")];
    if (!pickup || !dropoff) return addressesScreen(session, "Please tap both places.");
    if (samePlace(pickup, dropoff)) {
      return addressesScreen(session, "The pickup and destination are the same place. Please choose again.");
    }
    session.pickup = pickup;
    session.dropoff = dropoff;
    return detailsScreen(now);
  }

  if (screen === "DETAILS") {
    if (!session.pickup || !session.dropoff) return quoteFormJourneyScreen(session, "Please start again.");
    const returnTrip = String(data.trip ?? "") === "return";
    const date = formDate(data.date);
    const time = String(data.time ?? "");
    const returnDate = formDate(data.return_date);
    const returnTime = String(data.return_time ?? "");
    if (!date || !/^\d{2}:\d{2}$/.test(time)) return detailsScreen(now, "Please choose the pickup date and time.");
    if (returnTrip && (!returnDate || !/^\d{2}:\d{2}$/.test(returnTime))) {
      return detailsScreen(now, "For a return trip, please choose the return date and time too.");
    }
    const draft = quoteFormDraft(session.pickup, session.dropoff, {
      date,
      time,
      passengers: Math.max(1, Number(data.passengers) || 1),
      suitcases: Math.max(0, Number(data.suitcases) || 0),
      returnTrip,
      returnDate,
      returnTime,
      flight: String(data.flight ?? "").trim().slice(0, 12),
    });
    // The same checks as the chat: not in the past, return after the outward trip, etc.
    const problem = validateWhatsAppDraft(draft, now);
    if (problem) return detailsScreen(now, plainText(problem.message));
    session.draft = draft;
    return { screen: "SUMMARY", data: { summary: plainText(buildWhatsAppSummary(draft)) } };
  }

  return quoteFormJourneyScreen(session);
}
