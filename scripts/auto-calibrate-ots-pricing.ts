/**
 * Daily OTS auto-calibration.
 *
 * Samples random NI airport routes, fetches live OTS estate quotes from
 * https://www.airporttaxis-uk.co.uk/, adjusts
 * AREA_AIRPORT_SURCHARGES in src/lib/quote.ts so our estate fares sit ~£5–£8
 * below OTS, then writes a report.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { AIRPORTS } from "../src/lib/data";
import {
  calculateQuote,
  computeAirportEstateForSurcharge,
  findAirportSurchargeForOtsEstate,
} from "../src/lib/quote";
import { fetchOtsEstateQuote } from "./lib/ots-client.mjs";
import { applySurchargePatches } from "./lib/quote-surcharge-patcher.mjs";
import { buildRoutePool } from "./lib/ots-route-pool.mjs";
import { sampleRoutes, seedFromDate } from "./lib/seeded-sample.mjs";

const ESTATE = "Estate Car (1–4 passengers)" as const;
const QUOTE_PATH = join(process.cwd(), "src/lib/quote.ts");

const SAMPLE_SIZE = Number(process.env.OTS_SAMPLE_SIZE ?? "100");
const MIN_DISCOUNT = Number(process.env.OTS_MIN_DISCOUNT ?? "5");
const MAX_DISCOUNT = Number(process.env.OTS_MAX_DISCOUNT ?? "8");
const REQUEST_DELAY_MS = Number(process.env.OTS_REQUEST_DELAY_MS ?? "250");

type AirportRoute = {
  id: string;
  kind: "airport";
  airportCode: string;
  direction: string;
  pickup: string;
  dropoff: string;
  quoteAddress: string;
  area: string;
};

type CalibrationSample = {
  routeId: string;
  area: string;
  airportCode: string;
  direction: string;
  otsEstate: number;
  previousSurcharge: number | null;
  recommendedSurcharge: number | null;
  previousEstate: number | null;
  projectedEstate: number | null;
  projectedDiscount: number | null;
  status: "updated" | "unchanged" | "skipped" | "error";
  message: string;
};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }
  return sorted[mid];
}

function readCurrentSurcharge(source: string, area: string, airportCode: string): number | null {
  const areaKey = area.includes(" ") || area.includes("/") ? `"${area}"` : area;
  const lineRegex = new RegExp(
    `^\\s*${areaKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*\\{[^\\n]*?\\b${airportCode}:\\s*(\\d+)`,
    "m",
  );
  const match = source.match(lineRegex);
  return match ? Number(match[1]) : null;
}

async function main() {
  const runDate = process.env.OTS_CHECK_DATE ?? new Date().toISOString().slice(0, 10);
  const seed = seedFromDate(new Date(`${runDate}T12:00:00Z`));
  const pool = buildRoutePool().filter((route) => route.kind === "airport") as AirportRoute[];

  const sampleSize = Math.min(pool.length, SAMPLE_SIZE);
  const sampled = sampleRoutes(pool, sampleSize, seed);

  console.log(`OTS auto-calibration for ${runDate}`);
  console.log(`Sampling ${sampled.length} airport routes`);
  console.log(`Target: £${MIN_DISCOUNT}–£${MAX_DISCOUNT} below OTS estate\n`);

  let quoteSource = readFileSync(QUOTE_PATH, "utf8");
  const recommendations = new Map<string, number[]>();
  const samples: CalibrationSample[] = [];

  for (const [index, route] of sampled.entries()) {
    const key = `${route.area}::${route.airportCode}`;
    process.stdout.write(`[${index + 1}/${sampled.length}] ${route.id}… `);

    try {
      const otsEstate = await fetchOtsEstateQuote(route.pickup, route.dropoff, {
        delayMs: REQUEST_DELAY_MS,
      });
      const recommended = findAirportSurchargeForOtsEstate(
        route.airportCode,
        otsEstate,
        MIN_DISCOUNT,
        MAX_DISCOUNT,
      );

      const previousSurcharge = readCurrentSurcharge(quoteSource, route.area, route.airportCode);
      const previousQuote = calculateQuote(route.quoteAddress, route.airportCode, ESTATE);
      const previousEstate = previousQuote?.amount ?? null;

      if (recommended == null) {
        samples.push({
          routeId: route.id,
          area: route.area,
          airportCode: route.airportCode,
          direction: route.direction,
          otsEstate,
          previousSurcharge,
          recommendedSurcharge: null,
          previousEstate,
          projectedEstate: null,
          projectedDiscount: null,
          status: "skipped",
          message: "Could not find surcharge in target band",
        });
        console.log("skipped — no surcharge in band");
        continue;
      }

      if (!recommendations.has(key)) {
        recommendations.set(key, []);
      }
      recommendations.get(key)!.push(recommended);

      const projectedEstate = computeAirportEstateForSurcharge(route.airportCode, recommended);
      const projectedDiscount = +(otsEstate - projectedEstate).toFixed(2);

      samples.push({
        routeId: route.id,
        area: route.area,
        airportCode: route.airportCode,
        direction: route.direction,
        otsEstate,
        previousSurcharge,
        recommendedSurcharge: recommended,
        previousEstate,
        projectedEstate,
        projectedDiscount,
        status: "updated",
        message: `Recommend surcharge ${recommended} → estate £${projectedEstate} (£${projectedDiscount} below OTS)`,
      });
      console.log(`OTS £${otsEstate} → surcharge ${recommended}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      samples.push({
        routeId: route.id,
        area: route.area,
        airportCode: route.airportCode,
        direction: route.direction,
        otsEstate: 0,
        previousSurcharge: null,
        recommendedSurcharge: null,
        previousEstate: null,
        projectedEstate: null,
        projectedDiscount: null,
        status: "error",
        message,
      });
      console.log(`error — ${message}`);
    }
  }

  const patches: Array<{ area: string; airportCode: string; surcharge: number; previous: number | null }> =
    [];

  for (const [key, values] of recommendations.entries()) {
    const [area, airportCode] = key.split("::");
    const surcharge = median(values);
    const previous = readCurrentSurcharge(quoteSource, area, airportCode);
    if (previous === surcharge) {
      continue;
    }
    patches.push({ area, airportCode, surcharge, previous });
  }

  patches.sort((a, b) => a.area.localeCompare(b.area) || a.airportCode.localeCompare(b.airportCode));

  if (patches.length > 0) {
    quoteSource = applySurchargePatches(quoteSource, patches);
    writeFileSync(QUOTE_PATH, quoteSource);
    console.log(`\nApplied ${patches.length} surcharge update(s) to src/lib/quote.ts`);
    for (const patch of patches) {
      console.log(
        `- ${patch.area} / ${patch.airportCode}: ${patch.previous ?? "?"} → ${patch.surcharge}`,
      );
    }
  } else {
    console.log("\nNo surcharge updates needed");
  }

  const report = {
    mode: "auto-calibrate",
    runDate,
    seed,
    sampleSize: sampled.length,
    thresholds: { minDiscount: MIN_DISCOUNT, maxDiscount: MAX_DISCOUNT },
    patchesApplied: patches,
    samples,
    airports: AIRPORTS.map((airport) => ({ code: airport.code, basePrice: airport.basePrice })),
  };

  const reportsDir = join(process.cwd(), "reports");
  mkdirSync(reportsDir, { recursive: true });
  const reportPath = join(reportsDir, `ots-calibration-${runDate}.json`);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nReport written to ${reportPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
