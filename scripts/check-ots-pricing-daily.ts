/**
 * Daily OTS pricing monitor.
 *
 * Samples random NI routes (seeded by date), fetches live OTS estate quotes
 * from https://www.airporttaxis-uk.co.uk/,
 * and compares them to our site pricing. Writes a JSON report.
 *
 * To auto-adjust surcharges, use: npm run calibrate:ots-pricing
 *
 * Airport transfers: target ~£3–£5 below OTS (airportOtsCalibration).
 * Point-to-point: A2A undercut band from otsReferenceModel (~£8–£10).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { PRICING_CONFIG } from "../src/lib/pricing-config";
import {
  AIRPORT_OTS_UNDERCUT_MAX,
  AIRPORT_OTS_UNDERCUT_MIN,
  calculatePointToPointQuote,
  calculateQuote,
  computeAirportEstateForSurcharge,
} from "../src/lib/quote";
import { fetchOtsEstateQuote } from "./lib/ots-client.mjs";
import { buildRoutePool } from "./lib/ots-route-pool.mjs";
import { sampleRoutes, seedFromDate } from "./lib/seeded-sample.mjs";

const ESTATE = "Estate Car (1–4 passengers)" as const;

const SAMPLE_SIZE = Number(process.env.OTS_SAMPLE_SIZE ?? "100");
const AIRPORT_MIN_DISCOUNT = Number(
  process.env.OTS_MIN_DISCOUNT ?? String(AIRPORT_OTS_UNDERCUT_MIN),
);
const AIRPORT_MAX_DISCOUNT = Number(
  process.env.OTS_MAX_DISCOUNT ?? String(AIRPORT_OTS_UNDERCUT_MAX),
);
const A2A_MIN_DISCOUNT = Number(
  process.env.OTS_A2A_MIN_DISCOUNT ?? String(PRICING_CONFIG.otsReferenceModel.undercutMinGbp),
);
const A2A_MAX_DISCOUNT = Number(
  process.env.OTS_A2A_MAX_DISCOUNT ?? String(PRICING_CONFIG.otsReferenceModel.undercutMaxGbp),
);
const DISCOUNT_TOLERANCE = Number(process.env.OTS_DISCOUNT_TOLERANCE ?? "2");
const REQUEST_DELAY_MS = Number(process.env.OTS_REQUEST_DELAY_MS ?? "250");

type Route =
  | {
      id: string;
      kind: "airport";
      airportCode: string;
      direction: string;
      pickup: string;
      dropoff: string;
      quoteAddress: string;
      area: string;
    }
  | {
      id: string;
      kind: "point-to-point";
      pickup: string;
      dropoff: string;
      distanceKm: number;
      durationMinutes: number;
    };

type CheckResult = {
  id: string;
  kind: "airport" | "point-to-point";
  pickup: string;
  dropoff: string;
  otsEstate: number | null;
  ourEstate: number | null;
  discount: number | null;
  status: "pass" | "fail" | "error" | "skipped";
  message: string;
};

function discountBand(minDiscount: number, maxDiscount: number) {
  return {
    min: minDiscount - DISCOUNT_TOLERANCE,
    max: maxDiscount + DISCOUNT_TOLERANCE,
  };
}

function ourAirportEstate(route: Extract<Route, { kind: "airport" }>): number | null {
  const quote = calculateQuote(route.quoteAddress, route.airportCode, ESTATE);
  return quote?.amount ?? null;
}

function ourPointToPointEstate(route: Extract<Route, { kind: "point-to-point" }>): number | null {
  const quote = calculatePointToPointQuote(
    route.pickup,
    route.dropoff,
    ESTATE,
    false,
    {},
    { distanceKm: route.distanceKm, durationMinutes: route.durationMinutes },
  );
  return quote?.amount ?? null;
}

function evaluateAgainstBand(
  otsEstate: number,
  ourEstate: number,
  minDiscount: number,
  maxDiscount: number,
  airportCode?: string,
): { status: "pass" | "fail"; message: string } {
  const discount = +(otsEstate - ourEstate).toFixed(2);
  const band = discountBand(minDiscount, maxDiscount);

  if (discount >= band.min && discount <= band.max) {
    return {
      status: "pass",
      message: `£${discount.toFixed(2)} below OTS (target £${minDiscount}–£${maxDiscount})`,
    };
  }

  // Short hops: OTS can sit under our published airport estate minimum — stay at the floor.
  if (airportCode && discount < 0) {
    const estateFloorRaw = computeAirportEstateForSurcharge(airportCode, 0);
    const estateFloor =
      estateFloorRaw % 5 === 4 ? Math.round(estateFloorRaw) : Math.round(estateFloorRaw / 5) * 5;
    if (estateFloor > 0 && ourEstate <= estateFloor) {
      return {
        status: "pass",
        message: `At airport estate minimum £${estateFloor} (OTS £${otsEstate} is lower on this short hop)`,
      };
    }
  }

  if (discount < 0) {
    return {
      status: "fail",
      message: `Our price is £${Math.abs(discount).toFixed(2)} above OTS — should be ~£${minDiscount}–£${maxDiscount} below`,
    };
  }

  if (discount < band.min) {
    return {
      status: "fail",
      message: `Only £${discount.toFixed(2)} below OTS — expected ~£${minDiscount}–£${maxDiscount} below`,
    };
  }

  return {
    status: "fail",
    message: `£${discount.toFixed(2)} below OTS — more than £${maxDiscount + DISCOUNT_TOLERANCE} under target band`,
  };
}

async function checkRoute(route: Route): Promise<CheckResult> {
  const base = {
    id: route.id,
    kind: route.kind,
    pickup: route.pickup,
    dropoff: route.dropoff,
    otsEstate: null as number | null,
    ourEstate: null as number | null,
    discount: null as number | null,
  };

  try {
    const ourEstate =
      route.kind === "airport" ? ourAirportEstate(route) : ourPointToPointEstate(route);

    if (ourEstate == null) {
      return {
        ...base,
        status: "skipped",
        message: "No quote returned by our pricing engine",
      };
    }

    const otsEstate = await fetchOtsEstateQuote(route.pickup, route.dropoff, {
      delayMs: REQUEST_DELAY_MS,
    });

    const discount = +(otsEstate - ourEstate).toFixed(2);
    const evaluation =
      route.kind === "airport"
        ? evaluateAgainstBand(
            otsEstate,
            ourEstate,
            AIRPORT_MIN_DISCOUNT,
            AIRPORT_MAX_DISCOUNT,
            route.airportCode,
          )
        : evaluateAgainstBand(otsEstate, ourEstate, A2A_MIN_DISCOUNT, A2A_MAX_DISCOUNT);

    return {
      ...base,
      otsEstate,
      ourEstate,
      discount,
      status: evaluation.status,
      message: evaluation.message,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...base,
      status: "error",
      message,
    };
  }
}

function summarise(results: CheckResult[]) {
  const airport = results.filter((row) => row.kind === "airport");
  const pointToPoint = results.filter((row) => row.kind === "point-to-point");

  return {
    total: results.length,
    pass: results.filter((row) => row.status === "pass").length,
    fail: results.filter((row) => row.status === "fail").length,
    error: results.filter((row) => row.status === "error").length,
    skipped: results.filter((row) => row.status === "skipped").length,
    airport: {
      total: airport.length,
      pass: airport.filter((row) => row.status === "pass").length,
      fail: airport.filter((row) => row.status === "fail").length,
    },
    pointToPoint: {
      total: pointToPoint.length,
      pass: pointToPoint.filter((row) => row.status === "pass").length,
      fail: pointToPoint.filter((row) => row.status === "fail").length,
    },
  };
}

async function main() {
  const runDate =
    process.env.OTS_CHECK_DATE?.trim() || new Date().toISOString().slice(0, 10);
  const seed = seedFromDate(new Date(`${runDate}T12:00:00Z`));
  const pool = buildRoutePool();

  const airportPool = pool.filter((route) => route.kind === "airport");
  const p2pPool = pool.filter((route) => route.kind === "point-to-point");

  const airportSampleSize = Math.min(
    airportPool.length,
    Math.max(1, Math.round(SAMPLE_SIZE * 0.85)),
  );
  const p2pSampleSize = Math.min(p2pPool.length, SAMPLE_SIZE - airportSampleSize);

  const sampled = [
    ...sampleRoutes(airportPool, airportSampleSize, seed),
    ...sampleRoutes(p2pPool, p2pSampleSize, seed ^ 0x9e3779b9),
  ];

  console.log(`OTS pricing check for ${runDate}`);
  console.log(
    `Sampling ${sampled.length} routes (${airportSampleSize} airport, ${p2pSampleSize} point-to-point)`,
  );
  console.log(
    `Airport target: £${AIRPORT_MIN_DISCOUNT}–£${AIRPORT_MAX_DISCOUNT} below OTS (±£${DISCOUNT_TOLERANCE} tolerance)`,
  );
  console.log(
    `Point-to-point target: £${A2A_MIN_DISCOUNT}–£${A2A_MAX_DISCOUNT} below OTS (±£${DISCOUNT_TOLERANCE} tolerance)\n`,
  );

  const results: CheckResult[] = [];
  for (const [index, route] of sampled.entries()) {
    process.stdout.write(`[${index + 1}/${sampled.length}] ${route.id}… `);
    const result = await checkRoute(route as Route);
    results.push(result);
    console.log(`${result.status} — ${result.message}`);
  }

  const summary = summarise(results);
  const failures = results.filter((row) => row.status === "fail");
  const errors = results.filter((row) => row.status === "error");

  const report = {
    mode: "report-only",
    autoApplyPricing: false,
    runDate,
    seed,
    sampleSize: sampled.length,
    thresholds: {
      airportMinDiscount: AIRPORT_MIN_DISCOUNT,
      airportMaxDiscount: AIRPORT_MAX_DISCOUNT,
      airportTolerance: DISCOUNT_TOLERANCE,
      a2aMinDiscount: A2A_MIN_DISCOUNT,
      a2aMaxDiscount: A2A_MAX_DISCOUNT,
      pointToPointTolerance: DISCOUNT_TOLERANCE,
    },
    summary,
    failures,
    errors,
    results,
  };

  const reportsDir = join(process.cwd(), "reports");
  mkdirSync(reportsDir, { recursive: true });
  const reportPath = join(reportsDir, `ots-pricing-${runDate}.json`);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`\nReport written to ${reportPath}`);
  console.log(
    `Summary: ${summary.pass} pass / ${summary.fail} fail / ${summary.error} error / ${summary.skipped} skipped`,
  );

  if (summary.fail > 0 || summary.error > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
