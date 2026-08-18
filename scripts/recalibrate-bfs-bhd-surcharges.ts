/**
 * One-shot full BFS/BHD area-airport surcharge recalibration.
 *
 * Uses findAirportSurchargeForOtsEstate against airportOtsCalibration (£3–£5).
 * Seeds known comparison-table OTS estate observations (mean per zone), then
 * fetches live OTS for remaining BFS/BHD cells. Does not touch DUB/LDY.
 *
 * Run: npx tsx scripts/recalibrate-bfs-bhd-surcharges.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { PRICING_CONFIG } from "../src/lib/pricing-config";
import {
  AIRPORT_OTS_UNDERCUT_MAX,
  AIRPORT_OTS_UNDERCUT_MIN,
  computeAirportEstateForSurcharge,
  findAirportSurchargeForOtsEstate,
} from "../src/lib/quote";
import { AREA_ADDRESSES, AIRPORT_LOCATIONS } from "./lib/ots-route-pool.mjs";
import { fetchOtsEstateQuote } from "./lib/ots-client.mjs";
import { applySurchargePatches } from "./lib/quote-surcharge-patcher.mjs";

const CONFIG_PATH = join(process.cwd(), "src/lib/pricing-config.json");
const REQUEST_DELAY_MS = Number(process.env.OTS_REQUEST_DELAY_MS ?? "250");
const MIN_DISCOUNT = AIRPORT_OTS_UNDERCUT_MIN;
const MAX_DISCOUNT = AIRPORT_OTS_UNDERCUT_MAX;
const FETCH_LIVE = process.env.OTS_SKIP_LIVE !== "1";

/**
 * Approved comparison-table OTS estate observations (same area/airport may appear
 * more than once — mean is taken). Calibration source only.
 */
const SEEDED_OTS_ESTATE: Array<{ area: string; airportCode: "BFS" | "BHD"; otsEstate: number }> = [
  { area: "Newtownards", airportCode: "BHD", otsEstate: 52 },
  { area: "Larne", airportCode: "BFS", otsEstate: 78 },
  { area: "Carrickfergus", airportCode: "BFS", otsEstate: 75 },
  { area: "Belfast City Centre", airportCode: "BFS", otsEstate: 69 },
  { area: "Holywood", airportCode: "BFS", otsEstate: 69 }, // Holywood Rd
  { area: "Newtownards", airportCode: "BFS", otsEstate: 88 },
  { area: "Ballymena", airportCode: "BFS", otsEstate: 60 },
  { area: "Holywood", airportCode: "BFS", otsEstate: 77 },
  { area: "Comber", airportCode: "BFS", otsEstate: 88 },
  { area: "Hillsborough", airportCode: "BHD", otsEstate: 70 },
  { area: "Ballymena", airportCode: "BHD", otsEstate: 100 },
  { area: "Holywood", airportCode: "BHD", otsEstate: 39 },
  { area: "Lisburn", airportCode: "BFS", otsEstate: 61 },
  { area: "Larne", airportCode: "BHD", otsEstate: 94 },
  { area: "Holywood", airportCode: "BFS", otsEstate: 77 },
  { area: "Larne", airportCode: "BFS", otsEstate: 78 },
  { area: "Carrickfergus", airportCode: "BHD", otsEstate: 61 },
  { area: "Antrim", airportCode: "BHD", otsEstate: 80 },
  { area: "Newtownabbey", airportCode: "BFS", otsEstate: 57 },
  { area: "Belfast City Centre", airportCode: "BFS", otsEstate: 59 }, // Cliftonville
];

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function readCurrentSurcharge(source: string, area: string, airportCode: string): number | null {
  const areaKey = `"${area.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`;
  const airportKey = `"${airportCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`;
  const blockRegex = new RegExp(`${areaKey}\\s*:\\s*\\{([\\s\\S]*?)\\n\\s*\\}`, "m");
  const block = source.match(blockRegex);
  if (!block) {
    return null;
  }
  const valueMatch = block[1].match(new RegExp(`${airportKey}\\s*:\\s*(\\d+)`));
  return valueMatch ? Number(valueMatch[1]) : null;
}

async function main() {
  const areas = Object.keys(PRICING_CONFIG.areaAirportSurchargesGbp);
  const observations = new Map<string, number[]>();

  for (const row of SEEDED_OTS_ESTATE) {
    const key = `${row.area}::${row.airportCode}`;
    if (!observations.has(key)) {
      observations.set(key, []);
    }
    observations.get(key)!.push(row.otsEstate);
  }

  console.log(
    `BFS/BHD surcharge recalibration — target £${MIN_DISCOUNT}–£${MAX_DISCOUNT} below OTS estate`,
  );
  console.log(`Seeded observation keys: ${observations.size}`);

  for (const area of areas) {
    for (const airportCode of ["BFS", "BHD"] as const) {
      const key = `${area}::${airportCode}`;
      if (observations.has(key)) {
        continue;
      }
      if (!FETCH_LIVE) {
        console.log(`skip live ${key}`);
        continue;
      }

      const addresses = (AREA_ADDRESSES as Record<string, string[]>)[area];
      if (!addresses?.length) {
        console.log(`no addresses for ${area}`);
        continue;
      }

      const airportAddress = AIRPORT_LOCATIONS[airportCode];
      const samples: number[] = [];
      for (const address of addresses) {
        process.stdout.write(`live ${key} ← ${address.slice(0, 28)}… `);
        try {
          const price = await fetchOtsEstateQuote(address, airportAddress, {
            delayMs: REQUEST_DELAY_MS,
          });
          samples.push(price);
          console.log(`£${price}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.log(`error — ${message}`);
        }
      }
      if (samples.length > 0) {
        observations.set(key, samples);
      }
    }
  }

  let source = readFileSync(CONFIG_PATH, "utf8");
  const patches: Array<{
    area: string;
    airportCode: string;
    surcharge: number;
    previous: number | null;
    meanOts: number;
    projectedEstate: number;
    discount: number;
  }> = [];

  for (const [key, samples] of [...observations.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const [area, airportCode] = key.split("::") as [string, "BFS" | "BHD"];
    const meanOts = mean(samples);
    const recommended = findAirportSurchargeForOtsEstate(
      airportCode,
      meanOts,
      MIN_DISCOUNT,
      MAX_DISCOUNT,
    );
    if (recommended == null) {
      console.log(`${key}: no surcharge for mean OTS £${meanOts.toFixed(1)}`);
      continue;
    }
    const previous = readCurrentSurcharge(source, area, airportCode);
    const projectedEstate = computeAirportEstateForSurcharge(airportCode, recommended);
    const discount = +(meanOts - projectedEstate).toFixed(2);
    if (previous === recommended) {
      console.log(
        `${key}: unchanged surcharge ${recommended} (OTS mean £${meanOts.toFixed(1)} → estate £${projectedEstate}, −£${discount})`,
      );
      continue;
    }
    patches.push({
      area,
      airportCode,
      surcharge: recommended,
      previous,
      meanOts: +meanOts.toFixed(2),
      projectedEstate,
      discount,
    });
  }

  if (patches.length > 0) {
    source = applySurchargePatches(source, patches);
    writeFileSync(CONFIG_PATH, source);
  }

  console.log(`\nApplied ${patches.length} BFS/BHD surcharge update(s):`);
  for (const patch of patches) {
    console.log(
      `- ${patch.area} / ${patch.airportCode}: ${patch.previous ?? "?"} → ${patch.surcharge} (OTS mean £${patch.meanOts} → estate £${patch.projectedEstate}, −£${patch.discount})`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
