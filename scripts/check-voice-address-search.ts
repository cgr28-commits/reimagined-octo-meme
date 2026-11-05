/**
 * Fonio Address Search — decision logic + handler behaviour (mocked Google).
 * No real Places calls, no bookings, no payments.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  decideVoiceAddressMatches,
  spokenPlaceConfirmLabel,
  voiceAddressConfirmedSay,
  voiceAddressMatchScore,
} from "../shared/voice-address-search";
import { matchServedAirportSuggestions } from "../shared/served-airports";
import { handleVoiceAddressSearch } from "../workers/addresses/src/voice-address";
import type { AddressSuggestion } from "../shared/google-places";

function memoryStore() {
  const kv = new Map<string, string>();
  return {
    async get(key: string, type?: string) {
      const v = kv.get(key);
      return v == null ? null : type === "json" ? JSON.parse(v) : v;
    },
    async put(key: string, value: string) {
      kv.set(key, value);
    },
  };
}

function sug(id: string, main: string, secondary = "", label?: string): AddressSuggestion {
  const full = label ?? (secondary ? `${main}, ${secondary}` : main);
  return { id, label: full, address: full, mainText: main, secondaryText: secondary };
}

async function main() {
  // ——— Decision: Hilton-style single strong match ———
  const hilton = decideVoiceAddressMatches("The Hilton in Belfast", [
    sug("ChIJhilton", "Hilton Belfast", "Lanyon Place, Belfast BT1 3LP, UK"),
    sug("ChIJother", "Holiday Inn Belfast", "University Street, Belfast"),
  ]);
  assert.equal(hilton.status, "confirm");
  if (hilton.status === "confirm") {
    assert.match(hilton.say, /Hilton Belfast/i);
    assert.match(hilton.say, /Lanyon Place|Certainly/i);
    assert.doesNotMatch(hilton.say, /postcode first|full postcode/i);
  }
  console.log("OK  Hilton Belfast → confirm (no postcode demand)");

  // ——— Glengormley / ambiguous clarify ———
  const glen = decideVoiceAddressMatches("Glengormley", [
    sug("id1", "Glengormley", "Newtownabbey, Northern Ireland"),
    sug("id2", "Glengormley Park", "Antrim Road, Newtownabbey"),
    sug("id3", "Glengormley Methodist Church", "Newtownabbey"),
  ]);
  assert.equal(glen.status, "clarify");
  if (glen.status === "clarify") {
    assert.ok(glen.options.length >= 2);
    assert.match(glen.say, /matches|is it/i);
  }
  console.log("OK  Glengormley → clarify");

  // ——— Belfast International from catalogue ———
  const bfsSuggestions = matchServedAirportSuggestions("Belfast International");
  assert.ok(bfsSuggestions.length >= 1);
  const bfs = decideVoiceAddressMatches("Belfast International", bfsSuggestions as AddressSuggestion[]);
  assert.equal(bfs.status, "confirm");
  if (bfs.status === "confirm") {
    assert.match(bfs.candidate.label, /Belfast International/i);
  }
  const dub = decideVoiceAddressMatches("Dublin Airport", matchServedAirportSuggestions("Dublin Airport") as AddressSuggestion[]);
  assert.equal(dub.status, "confirm");
  console.log("OK  BFS + Dublin Airport catalogue → confirm");

  // ——— Titanic Hotel ———
  const titanic = decideVoiceAddressMatches("Titanic Hotel Belfast", [
    sug("ChIJtitanic", "Titanic Hotel Belfast", "Queens Road, Belfast BT3"),
  ]);
  assert.equal(titanic.status, "confirm");
  if (titanic.status === "confirm") {
    assert.match(spokenPlaceConfirmLabel(titanic.candidate), /Titanic Hotel/i);
  }
  console.log("OK  Titanic Hotel Belfast → confirm");

  // ——— Antrim / Newtownabbey style ———
  const antrim = decideVoiceAddressMatches("Antrim town centre", [
    sug("a1", "Antrim", "County Antrim, Northern Ireland"),
    sug("a2", "Antrim Castle Gardens", "Antrim"),
  ]);
  assert.ok(antrim.status === "clarify" || antrim.status === "confirm");
  console.log("OK  Antrim ambiguous handled without inventing");

  // ——— Empty / need_more ———
  const none = decideVoiceAddressMatches("xyzzy unknown place 999", []);
  assert.equal(none.status, "need_more");
  assert.match(none.say, /postcode|hotel|street/i);
  assert.ok(voiceAddressMatchScore("hilton belfast", {
    placeId: "x",
    label: "Hilton Belfast, Lanyon Place",
    mainText: "Hilton Belfast",
    secondaryText: "Lanyon Place",
  }) >= 0.6);
  assert.match(voiceAddressConfirmedSay("Hilton Belfast, Lanyon Place", "pickup"), /Certainly.*Hilton Belfast/i);
  assert.doesNotMatch(voiceAddressConfirmedSay("Hilton Belfast, Lanyon Place", "pickup"), /That's grand|where are we taking you/i);
  console.log("OK  need_more + brief confirmed say");

  // ——— Handler: confirm served airport without Google key ———
  const store = memoryStore();
  let res = await handleVoiceAddressSearch(
    new Request("https://w/voice/address-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "Belfast International", role: "pickup" }),
    }),
    { TRACKING_STORE: store as unknown as KVNamespace },
  );
  let body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.status, "confirm");
  assert.match(body.say, /Certainly|Belfast International/i);
  assert.ok(body.placeId);

  res = await handleVoiceAddressSearch(
    new Request("https://w/voice/address-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ placeId: body.placeId, role: "pickup" }),
    }),
    { TRACKING_STORE: store as unknown as KVNamespace },
  );
  body = await res.json();
  assert.equal(body.status, "confirmed");
  assert.equal(typeof body.lat, "number");
  assert.equal(typeof body.lng, "number");
  assert.match(body.formattedAddress, /Airport/i);
  assert.match(String(body.displayAddress ?? body.label ?? ""), /Airport|International/i);
  assert.match(body.say, /Certainly/i);
  assert.doesNotMatch(body.say, /That's grand|where are we taking you/i);
  console.log("OK  handler confirm → confirmed with coords (catalogue)");

  // ——— Handler: Google failure path ———
  res = await handleVoiceAddressSearch(
    new Request("https://w/voice/address-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "some random hotel belfast", role: "pickup" }),
    }),
    { TRACKING_STORE: store as unknown as KVNamespace },
  );
  body = await res.json();
  assert.equal(body.ok, false);
  assert.equal(body.status, "failed");
  assert.match(body.say, /postcode|message/i);
  console.log("OK  no Google key + non-airport → graceful failed");

  // ——— Handler: mocked Google suggestions (Hilton) ———
  const prevFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("places:autocomplete")) {
      return Response.json({
        suggestions: [
          {
            placePrediction: {
              placeId: "ChIJhiltonTest",
              text: { text: "Hilton Belfast, Lanyon Place, Belfast, UK" },
              structuredFormat: {
                mainText: { text: "Hilton Belfast" },
                secondaryText: { text: "Lanyon Place, Belfast, UK" },
              },
            },
          },
        ],
      });
    }
    if (url.includes("places.googleapis.com/v1/places/")) {
      return Response.json({
        id: "ChIJhiltonTest",
        formattedAddress: "Hilton Belfast, 4 Lanyon Place, Belfast BT1 3LP, UK",
        displayName: { text: "Hilton Belfast" },
        location: { latitude: 54.595, longitude: -5.92 },
        addressComponents: [
          { longText: "United Kingdom", shortText: "GB", types: ["country"] },
          { longText: "Belfast", shortText: "Belfast", types: ["locality"] },
          { longText: "BT1 3LP", shortText: "BT1 3LP", types: ["postal_code"] },
        ],
      });
    }
    return Response.json({}, { status: 404 });
  }) as typeof fetch;

  try {
    res = await handleVoiceAddressSearch(
      new Request("https://w/voice/address-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "Hilton in Belfast", role: "pickup" }),
      }),
      {
        TRACKING_STORE: memoryStore() as unknown as KVNamespace,
        GOOGLE_PLACES_API_KEY: "test-key-not-real",
      },
    );
    body = await res.json();
    assert.equal(body.status, "confirm");
    assert.match(body.say, /Hilton Belfast/i);
    assert.equal(body.placeId, "ChIJhiltonTest");

    res = await handleVoiceAddressSearch(
      new Request("https://w/voice/address-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId: "ChIJhiltonTest", role: "pickup" }),
      }),
      {
        TRACKING_STORE: memoryStore() as unknown as KVNamespace,
        GOOGLE_PLACES_API_KEY: "test-key-not-real",
      },
    );
    body = await res.json();
    assert.equal(body.status, "confirmed");
    assert.equal(body.place.placeId, "ChIJhiltonTest");
    assert.ok(body.place.lat && body.place.lng);
  } finally {
    globalThis.fetch = prevFetch;
  }
  console.log("OK  mocked Google Hilton search + Place Details confirm");

  // ——— Hotel whose Google formattedAddress is street-only (Hope Street pattern) ———
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("places.googleapis.com/v1/places/")) {
      return Response.json({
        id: "ChIJhopeHotel",
        // Street only — displayName carries the hotel.
        formattedAddress: "15 Hope Street, Belfast BT12 5AH, UK",
        displayName: { text: "Fitzwilliam Hotel Belfast" },
        types: ["lodging", "establishment", "point_of_interest"],
        location: { latitude: 54.594, longitude: -5.935 },
        addressComponents: [
          { longText: "United Kingdom", shortText: "GB", types: ["country"] },
          { longText: "Belfast", shortText: "Belfast", types: ["locality"] },
          { longText: "BT12 5AH", shortText: "BT12 5AH", types: ["postal_code"] },
          { longText: "15", shortText: "15", types: ["street_number"] },
          { longText: "Hope Street", shortText: "Hope Street", types: ["route"] },
        ],
      });
    }
    return Response.json({}, { status: 404 });
  }) as typeof fetch;

  try {
    res = await handleVoiceAddressSearch(
      new Request("https://w/voice/address-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId: "ChIJhopeHotel", role: "dropoff" }),
      }),
      {
        TRACKING_STORE: memoryStore() as unknown as KVNamespace,
        GOOGLE_PLACES_API_KEY: "test-key-not-real",
      },
    );
    body = await res.json();
    assert.equal(body.status, "confirmed");
    assert.match(String(body.displayAddress ?? ""), /Fitzwilliam Hotel Belfast/i);
    assert.match(String(body.label ?? ""), /Fitzwilliam Hotel Belfast/i);
    assert.match(String(body.displayAddress ?? ""), /15 Hope Street/i);
    assert.match(String(body.formattedAddress ?? ""), /15 Hope Street/i);
    assert.doesNotMatch(String(body.formattedAddress ?? ""), /Fitzwilliam/i);
    assert.match(String(body.say ?? ""), /Fitzwilliam/i);
  } finally {
    globalThis.fetch = prevFetch;
  }
  console.log("OK  Hope Street hotel confirm keeps venue name on displayAddress/label");

  // ——— Wiring ———
  const index = readFileSync("workers/addresses/src/index.ts", "utf8");
  assert.match(index, /\/voice\/address-search/);
  assert.match(readFileSync("workers/addresses/src/voice-quote.ts", "utf8"), /pickupPlaceId/);
  assert.match(readFileSync("workers/addresses/src/voice-quote.ts", "utf8"), /displayAddress|resolved\.label/);
  assert.match(readFileSync("docs/fonio-tool-config.md", "utf8"), /address-search/);
  assert.match(readFileSync("docs/fonio-tool-config.md", "utf8"), /displayAddress/);
  assert.match(readFileSync("docs/fonio-receptionist-prompt.md", "utf8"), /no postcode required/i);
  assert.match(readFileSync("docs/fonio-receptionist-prompt.md", "utf8"), /displayAddress/);
  assert.match(readFileSync("workers/addresses/src/voice-address.ts", "utf8"), /GOOGLE_PLACES_API_KEY/);
  assert.doesNotMatch(readFileSync("workers/addresses/src/voice-address.ts", "utf8"), /NEXT_PUBLIC_GOOGLE/);
  console.log("OK  route + Get Quote placeId + docs; key stays server-side");

  console.log("check-voice-address-search: OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
