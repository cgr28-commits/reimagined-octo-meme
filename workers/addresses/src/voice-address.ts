/**
 * POST /voice/address-search — Google Places lookup for the Fonio receptionist.
 *
 * Reuses the website Worker Places stack (GOOGLE_PLACES_API_KEY server-side):
 * served-airport catalogue + searchGoogleAddressSuggestions + Place Details.
 * Never invents coordinates. Never prices a journey (that stays on /voice/quote).
 */
import {
  resolveGooglePlaceDetails,
  searchGoogleAddressSuggestions,
  type AddressSuggestion,
  type ResolvedGooglePlace,
} from "../shared/google-places";
import { isAllowedAutocompleteLabel } from "../shared/address-validation";
import {
  matchServedAirportSuggestions,
  servedAirportFromPlaceId,
} from "../shared/served-airports";
import {
  decideVoiceAddressMatches,
  voiceAddressConfirmedSay,
  type VoiceAddressRole,
} from "../shared/voice-address-search";
import { consumeQuickQuoteCreateQuota } from "./quick-quote-store";

type Env = {
  TRACKING_STORE?: KVNamespace;
  GOOGLE_PLACES_API_KEY?: string;
  GETADDRESS_API_KEY?: string;
  IDEAL_POSTCODES_API_KEY?: string;
};

const SEARCHES_PER_HOUR = 120;
/** Island-wide bias (NI + ROI) — same as website A2A autocomplete. */
const DEFAULT_AIRPORT_BIAS = "A2A";

function reply(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function flatten(body: unknown): Record<string, unknown> {
  const root = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  let out: Record<string, unknown> = { ...root };
  for (const key of ["parameters", "args", "arguments", "data", "input"]) {
    const inner = root[key];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      out = { ...out, ...(inner as object) };
    }
  }
  return out;
}

function text(value: unknown, max = 200): string {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max) : "";
}

function roleOf(value: unknown): VoiceAddressRole {
  return /^drop|dest/i.test(String(value ?? "")) ? "dropoff" : "pickup";
}

function placePayload(place: ResolvedGooglePlace) {
  return {
    placeId: place.placeId,
    formattedAddress: place.formattedAddress,
    displayAddress: place.displayAddress,
    placeName: place.placeName,
    lat: place.lat,
    lng: place.lng,
    postalCode: place.postalCode,
    countryCode: place.countryCode,
  };
}

function fromServedPlaceId(placeId: string): ResolvedGooglePlace | null {
  const airport = servedAirportFromPlaceId(placeId);
  if (!airport) return null;
  return {
    placeId: airport.placeId,
    formattedAddress: airport.formattedAddress,
    displayAddress: airport.name,
    placeName: airport.name,
    lat: airport.lat,
    lng: airport.lng,
    postalCode: airport.postalCode,
    countryCode: airport.countryCode,
    streetNumber: null,
    route: null,
    locality: null,
    administrativeArea: null,
  };
}

async function resolvePlace(
  env: Env,
  placeId: string,
  airportBias: string,
  userInput?: string,
): Promise<ResolvedGooglePlace | null> {
  const served = fromServedPlaceId(placeId);
  if (served) return served;
  const key = env.GOOGLE_PLACES_API_KEY?.trim();
  if (!key) return null;
  return resolveGooglePlaceDetails(key, placeId, airportBias, undefined, userInput);
}

/**
 * Merge served airports + Google suggestions (same idea as GET /addresses).
 * Ideal/GetAddress omitted on the phone path to keep latency low; Google + catalogue cover hotels/landmarks.
 */
export async function collectVoiceAddressSuggestions(
  env: Env,
  query: string,
  airportBias: string,
): Promise<{ suggestions: AddressSuggestion[]; unavailable: boolean; configured: boolean }> {
  const served = matchServedAirportSuggestions(query).filter((item) =>
    isAllowedAutocompleteLabel(item.label, airportBias),
  ) as AddressSuggestion[];

  const key = env.GOOGLE_PLACES_API_KEY?.trim();
  if (!key) {
    return { suggestions: served, unavailable: served.length === 0, configured: false };
  }

  let google: AddressSuggestion[] = [];
  let unavailable = false;
  try {
    google = await searchGoogleAddressSuggestions(key, query, airportBias);
  } catch (error) {
    unavailable = true;
    console.error("voice address google search failed", error instanceof Error ? error.message : error);
  }

  const filtered = google.filter((item) => isAllowedAutocompleteLabel(item.label, airportBias));
  const byId = new Set<string>();
  const merged: AddressSuggestion[] = [];
  for (const item of [...served, ...filtered]) {
    const id = (item.id || item.label).toLowerCase();
    if (byId.has(id)) continue;
    byId.add(id);
    merged.push(item);
  }
  return {
    suggestions: merged.slice(0, 10),
    unavailable: unavailable && merged.length === 0,
    configured: true,
  };
}

export async function handleVoiceAddressSearch(request: Request, env: Env): Promise<Response> {
  const store = env.TRACKING_STORE;
  const input = flatten(await request.json().catch(() => null));
  const query = text(input.query ?? input.q ?? input.address ?? input.place, 200);
  const role = roleOf(input.role ?? input.side ?? input.field);
  const placeId = text(input.placeId ?? input.confirmPlaceId ?? input.id, 128);
  const airportBias = text(input.airportHint ?? input.airportCode ?? input.airport, 8).toUpperCase() || DEFAULT_AIRPORT_BIAS;

  if (store && (await consumeQuickQuoteCreateQuota(store, "voice:address", SEARCHES_PER_HOUR)) === "limited") {
    return reply({
      ok: false,
      status: "failed",
      say: "I've looked up a lot of addresses just now. Could I take a postcode, or leave a message for the team?",
    });
  }

  // Caller confirmed a previous candidate — resolve Place Details (or served airport).
  if (placeId) {
    const place = await resolvePlace(env, placeId, airportBias, query || undefined);
    if (!place || place.lat == null || place.lng == null) {
      return reply({
        ok: false,
        status: "need_more",
        say: "I couldn't confirm that location. Could you give me the postcode, or shall I take a message for the team?",
      });
    }
    const display = place.displayAddress || place.formattedAddress;
    return reply({
      ok: true,
      status: "confirmed",
      role,
      place: placePayload(place),
      formattedAddress: place.formattedAddress,
      placeId: place.placeId,
      lat: place.lat,
      lng: place.lng,
      say: voiceAddressConfirmedSay(display, role),
    });
  }

  if (query.length < 3) {
    return reply({
      ok: false,
      status: "need_more",
      role,
      say: role === "dropoff" ? "Where would you like us to take you?" : "Where would you like us to pick you up from?",
    });
  }

  if (!env.GOOGLE_PLACES_API_KEY?.trim()) {
    // Catalogue-only airports can still resolve without Google.
    const servedOnly = matchServedAirportSuggestions(query);
    if (servedOnly.length === 1) {
      const decision = decideVoiceAddressMatches(query, servedOnly as AddressSuggestion[], role);
      if (decision.status === "confirm") {
        return reply({
          ok: true,
          status: "confirm",
          role,
          query,
          placeId: decision.candidate.placeId,
          label: decision.candidate.label,
          options: [decision.candidate],
          say: decision.say,
          googleConfigured: false,
        });
      }
    }
    return reply({
      ok: false,
      status: "failed",
      say: "I can't look that up on the map just now. Could you give me a postcode, or shall I take a message for the team?",
      googleConfigured: false,
    });
  }

  const { suggestions, unavailable, configured } = await collectVoiceAddressSuggestions(env, query, airportBias);
  if (unavailable && !suggestions.length) {
    return reply({
      ok: false,
      status: "failed",
      role,
      query,
      say: "The address lookup isn't responding just now. Could you give me a postcode, or shall I take a message for the team?",
      googleConfigured: configured,
    });
  }

  const decision = decideVoiceAddressMatches(query, suggestions, role);
  if (decision.status === "need_more") {
    return reply({
      ok: false,
      status: "need_more",
      role,
      query,
      options: [],
      say: decision.say,
      googleConfigured: configured,
    });
  }

  if (decision.status === "confirm") {
    return reply({
      ok: true,
      status: "confirm",
      role,
      query,
      placeId: decision.candidate.placeId,
      label: decision.candidate.label,
      mainText: decision.candidate.mainText,
      secondaryText: decision.candidate.secondaryText,
      options: [decision.candidate],
      say: decision.say,
      googleConfigured: configured,
    });
  }

  return reply({
    ok: true,
    status: "clarify",
    role,
    query,
    options: decision.options,
    say: decision.say,
    googleConfigured: configured,
  });
}
