/**
 * Final correction-pass checks: copy rules, passenger cap, out-of-area gating,
 * and live Google Places autocomplete scenarios via the Cloudflare Worker.
 *
 * Run: npx tsx scripts/check-final-correction-pass.ts
 */

import assert from "node:assert/strict";
import {
  isOutOfAreaPickup,
  isPlaceSelected,
  isRepublicOfIrelandJourney,
  isStandardInstantPickup,
  needsManualQuoteApproval,
  quickSelectToPlace,
  type SelectedPlace,
} from "../src/lib/selected-place";
import {
  FAQS,
  MAX_ONLINE_PASSENGERS,
  REQUEST_QUOTE_VEHICLE_TYPES,
  VEHICLE_FLEET,
  VEHICLE_TYPES,
} from "../src/lib/data";
import { TERMS_SECTIONS } from "../src/lib/terms";
import { PRIVACY_SECTIONS } from "../src/lib/privacy";

let passed = 0;

function check(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`✓ ${name}`);
    });
}

function place(
  partial: Partial<SelectedPlace> & Pick<SelectedPlace, "formattedAddress">,
): SelectedPlace {
  return {
    placeId: partial.placeId ?? `test:${partial.formattedAddress.slice(0, 12)}`,
    formattedAddress: partial.formattedAddress,
    lat: partial.lat ?? null,
    lng: partial.lng ?? null,
    countryCode: partial.countryCode ?? null,
    postalCode: partial.postalCode ?? null,
  };
}

const belfast = place({
  placeId: "belfast",
  formattedAddress: "10 Donegall Square North, Belfast BT1 5GB, UK",
  countryCode: "GB",
  postalCode: "BT1 5GB",
});
const bangor = place({
  placeId: "bangor",
  formattedAddress: "12 Main Street, Bangor BT20 5AF, Northern Ireland",
  countryCode: "GB",
  postalCode: "BT20 5AF",
});
const lisburn = place({
  placeId: "lisburn",
  formattedAddress: "1 Market Square, Lisburn BT28 1AG, Northern Ireland",
  countryCode: "GB",
  postalCode: "BT28 1AG",
});
const omagh = place({
  placeId: "omagh",
  formattedAddress: "1 High Street, Omagh BT78 1AB, Northern Ireland",
  countryCode: "GB",
  postalCode: "BT78 1AB",
});
const dublinCity = place({
  placeId: "dublin-city",
  formattedAddress: "1 Grafton Street, Dublin, D02 HX96, Ireland",
  countryCode: "IE",
  postalCode: "D02 HX96",
});
const cork = place({
  placeId: "cork",
  formattedAddress: "Patrick Street, Cork, T12, Ireland",
  countryCode: "IE",
  postalCode: "T12",
});
const galway = place({
  placeId: "galway",
  formattedAddress: "Eyre Square, Galway, H91, Ireland",
  countryCode: "IE",
  postalCode: "H91",
});
const typedOnly = place({
  placeId: "",
  formattedAddress: "10 random street I typed myself",
});

const bfs = quickSelectToPlace("BFS");
const dub = quickSelectToPlace("DUB");
assert.ok(bfs && dub);

const WORKER = "https://reimagined-octo-meme.cgr28.workers.dev/addresses";

async function workerSuggestions(query: string, airport = "A2A") {
  const url = new URL(WORKER);
  url.searchParams.set("q", query);
  url.searchParams.set("airport", airport);
  const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  assert.equal(response.ok, true, `worker HTTP ${response.status} for ${query}`);
  const payload = (await response.json()) as { suggestions?: Array<{ label: string }> };
  return payload.suggestions ?? [];
}

async function main() {
  await check("Max online passengers is 8 (partner minibus for 5+)", () => {
    assert.equal(MAX_ONLINE_PASSENGERS, 8);
  });

  await check("Partner minibus vehicle type is available for 5–8", () => {
    const joined = [...VEHICLE_TYPES, ...VEHICLE_FLEET.map((v) => `${v.name} ${v.description}`)].join(
      " ",
    );
    assert.match(joined, /Minibus \(5–8 passengers\)/);
    assert.match(joined, /licensed transport partners/i);
    assert.equal(REQUEST_QUOTE_VEHICLE_TYPES.length, 1);
    assert.equal(/people carrier/i.test(joined), false);
  });

  await check("FAQs retain partner larger-vehicle wording for 5+ and 24h cancel", () => {
    const text = FAQS.map((f) => `${f.question} ${f.answer}`).join("\n");
    assert.match(text, /transport partners?/i);
    assert.match(text, /5\+|5 or more/i);
    assert.match(text, /more than 24 hours/i);
  });

  await check("Terms cover airports, long-distance, out-of-area, GBP, tolls, 24h cancel", () => {
    const text = TERMS_SECTIONS.map((section) => {
      const s = section as {
        title: string;
        content?: readonly string[];
        list?: readonly string[];
        contentAfterList?: readonly string[];
        footer?: string;
        subsections?: ReadonlyArray<{ content?: readonly string[] }>;
      };
      const parts = [
        s.title,
        ...(s.content ?? []),
        ...(s.list ?? []),
        ...(s.contentAfterList ?? []),
        s.footer ?? "",
        ...(s.subsections ?? []).flatMap((sub) => sub.content ?? []),
      ];
      return parts.join(" ");
    }).join("\n");

    assert.match(text, /Belfast City Airport/i);
    assert.match(text, /long-distance private transfers from Greater Belfast/i);
    assert.match(text, /out-of-area/i);
    assert.match(text, /manual approval/i);
    assert.match(text, /pounds sterling \(GBP\)/i);
    assert.match(text, /Applicable tolls/i);
    assert.match(text, /more than 24 hours/i);
    assert.match(text, /non-refundable/i);
    assert.equal(/administration charge of|10%|£5 .*cancel/i.test(text), false);
    assert.match(text, /licensed partner operators|transport partner/i);
    assert.match(text, /5–8 passengers/i);
    assert.equal(/people carrier/i.test(text), false);
  });

  await check("Terms Our Service lists airports immediately after the intro phrase", () => {
    const ourService = TERMS_SECTIONS.find((section) => section.title === "Our Service") as {
      content?: readonly string[];
      list?: readonly string[];
      contentAfterList?: readonly string[];
    };
    assert.ok(ourService);
    assert.equal(ourService.content?.length, 1);
    assert.match(ourService.content![0], /including transfers to and from:\s*$/);
    assert.deepEqual(ourService.list, [
      "Belfast International Airport",
      "Belfast City Airport",
      "Dublin Airport",
      "City of Derry Airport",
    ]);
    assert.ok((ourService.contentAfterList?.length ?? 0) >= 2);
    assert.match(ourService.contentAfterList!.join(" "), /long-distance private transfers/i);
  });

  await check("Privacy explains Google Places and Ads quote + paid booking measurement", () => {
    const text = PRIVACY_SECTIONS.map((s) =>
      [s.title, ...(s.content ?? []), ...((s as { list?: string[] }).list ?? [])].join(" "),
    ).join("\n");
    assert.match(text, /Google Places/i);
    assert.match(text, /successful quote requests/i);
    assert.match(text, /completed paid bookings/i);
  });

  await check("Belfast → Dublin city is ROI fixed quote", () => {
    assert.equal(isStandardInstantPickup(belfast), true);
    assert.equal(isRepublicOfIrelandJourney(belfast, dublinCity), true);
    assert.equal(needsManualQuoteApproval(belfast, dublinCity), true);
  });

  await check("Bangor → Cork is ROI fixed quote", () => {
    assert.equal(needsManualQuoteApproval(bangor, cork), true);
  });

  await check("Lisburn → Galway is ROI fixed quote", () => {
    assert.equal(needsManualQuoteApproval(lisburn, galway), true);
  });

  await check("BFS and DUB pickups stay standard instant", () => {
    assert.equal(isStandardInstantPickup(bfs!), true);
    assert.equal(isStandardInstantPickup(dub!), true);
    assert.equal(needsManualQuoteApproval(bfs!, belfast), false);
    assert.equal(needsManualQuoteApproval(dub!, belfast), false);
  });

  await check("Omagh → Greater Belfast gets a live quote; Omagh remains non-standard pickup", () => {
    assert.equal(isOutOfAreaPickup(omagh), true);
    assert.equal(needsManualQuoteApproval(omagh, belfast), false);
  });

  await check("Typed address without suggestion is not selected", () => {
    assert.equal(isPlaceSelected(typedOnly), false);
    assert.equal(needsManualQuoteApproval(typedOnly, dublinCity), false);
  });

  await check("Worker: Belfast street suggestions for A2A", async () => {
    const suggestions = await workerSuggestions("Donegall Street");
    assert.ok(suggestions.length > 0, "expected Belfast street suggestions");
    assert.ok(
      suggestions.some((s) => /belfast/i.test(s.label)),
      `expected Belfast in ${suggestions.map((s) => s.label).join(" | ")}`,
    );
  });

  await check("Worker: ROI Dublin city suggestions for A2A", async () => {
    const suggestions = await workerSuggestions("Grafton Street Dublin");
    assert.ok(suggestions.length > 0, "expected Dublin suggestions");
    assert.ok(
      suggestions.some((s) => /dublin|ireland/i.test(s.label)),
      `expected Dublin/Ireland in ${suggestions.map((s) => s.label).join(" | ")}`,
    );
  });

  await check("Worker: Cork suggestions for A2A", async () => {
    const suggestions = await workerSuggestions("Patrick Street Cork");
    assert.ok(suggestions.length > 0, "expected Cork suggestions");
  });

  await check("Worker: Galway suggestions for A2A", async () => {
    const suggestions = await workerSuggestions("Eyre Square Galway");
    assert.ok(suggestions.length > 0, "expected Galway suggestions");
  });

  await check("Worker: Belfast International airport suggestion", async () => {
    const suggestions = await workerSuggestions("Belfast International Airport");
    assert.ok(suggestions.length > 0);
    assert.ok(suggestions.some((s) => /belfast international|aldergrove/i.test(s.label)));
  });

  await check("Worker: Dublin Airport suggestion", async () => {
    const suggestions = await workerSuggestions("Dublin Airport");
    assert.ok(suggestions.length > 0);
    assert.ok(suggestions.some((s) => /dublin airport/i.test(s.label)));
  });

  await check("Locations examples are directional Greater Belfast departures", async () => {
    const fs = await import("node:fs");
    const source = fs.readFileSync("src/lib/locations-content.ts", "utf8");
    assert.match(source, /Belfast to Dublin city/);
    assert.match(source, /Bangor to Cork/);
    assert.match(source, /Lisburn to Galway/);
    assert.match(source, /Newtownabbey to Donegal/);
    assert.equal(/Newry|Derry ↔|↔/.test(source), false);
  });

  await check("Long-distance page uses H1 for the approved title", async () => {
    const fs = await import("node:fs");
    const page = fs.readFileSync("src/app/long-distance-transfers/page.tsx", "utf8");
    const content = fs.readFileSync("src/lib/long-distance-content.ts", "utf8");
    assert.match(page, /as="h1"/);
    assert.match(content, /Private Long-Distance Transfers from Anywhere in Greater Belfast/);
    assert.match(content, /Long-Distance Transfers from Greater Belfast Across Ireland/);
  });

  console.log(`\n${passed} correction-pass checks passed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
