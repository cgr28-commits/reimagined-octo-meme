/**
 * Daily OTS pricing monitor.
 *
 * Samples random NI routes (seeded by date), fetches live OTS estate quotes
 * from https://www.airporttaxis-uk.co.uk/,
 * and compares them to our site pricing. Writes a JSON report.
 *
 * To auto-adjust surcharges, use: npm run calibrate:ots-pricing
 *
 * Airport transfers: target ~£8–£10 below OTS (with rounding tolerance).
 * Point-to-point: same £8–£10 below OTS target.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { calculatePointToPointQuote, calculateQuote } from "../src/lib/quote";
import { fetchOtsEstateQuote } from "./lib/ots-client.mjs";
import { buildRoutePool } from "./lib/ots-route-pool.mjs";
import { sampleRoutes, seedFromDate } from "./lib/seeded-sample.mjs";

const ESTATE = "Estate Car (1–4 passengers)" as const;

const SAMPLE_SIZE = Number(process.env.OTS_SAMPLE_SIZE ?? "100");
const MIN_DISCOUNT = Number(process.env.OTS_MIN_DISCOUNT ?? "8");
const MAX_DISCOUNT = Number(process.env.OTS_MAX_DISCOUNT ?? "10");
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

function airportDiscountBand() {
  return {
    min: MIN_DISCOUNT - DISCOUNT_TOLERANCE,
    max: MAX_DISCOUNT + DISCOUNT_TOLERANCE,
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

function evaluateAirport(otsEstate: number, ourEstate: number): { status: "pass" | "fail"; message: string } {
  const discount = +(otsEstate - ourEstate).toFixed(2);
  const band = airportDiscountBand();

  if (discount >= band.min && discount <= band.max) {
    return {
      status: "pass",
      message: `£${discount.toFixed(2)} below OTS (target £${MIN_DISCOUNT}–£${MAX_DISCOUNT})`,
    };
  }

  if (discount < 0) {
    return {
      status: "fail",
      message: `Our price is £${Math.abs(discount).toFixed(2)} above OTS — should be ~£${MIN_DISCOUNT}–£${MAX_DISCOUNT} below`,
    };
  }

  if (discount < band.min) {
    return {
      status: "fail",
      message: `Only £${discount.toFixed(2)} below OTS — expected ~£${MIN_DISCOUNT}–£${MAX_DISCOUNT} below`,
    };
  }

  return {
    status: "fail",
    message: `£${discount.toFixed(2)} below OTS — more than £${MAX_DISCOUNT + DISCOUNT_TOLERANCE} under target band`,
  };
}

function evaluatePointToPoint(
  otsEstate: number,
  ourEstate: number,
): { status: "pass" | "fail"; message: string } {
  return evaluateAirport(otsEstate, ourEstate);
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
        ? evaluateAirport(otsEstate, ourEstate)
        : evaluatePointToPoint(otsEstate, ourEstate);

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
    `Airport target: £${MIN_DISCOUNT}–£${MAX_DISCOUNT} below OTS (±£${DISCOUNT_TOLERANCE} tolerance)`,
  );
  console.log(`Point-to-point target: £${MIN_DISCOUNT}–£${MAX_DISCOUNT} below OTS\n`);

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
      airportMinDiscount: MIN_DISCOUNT,
      airportMaxDiscount: MAX_DISCOUNT,
      airportTolerance: DISCOUNT_TOLERANCE,
      pointToPointTolerance: MAX_DISCOUNT,
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

  console.log("\n--- Summary ---");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nReport written to ${reportPath}`);

  if (failures.length > 0) {
    console.log("\nRoutes outside target band:");
    for (const row of failures.slice(0, 20)) {
      console.log(
        `- ${row.id}: OTS £${row.otsEstate}, ours £${row.ourEstate} — ${row.message}`,
      );
    }
    if (failures.length > 20) {
      console.log(`… and ${failures.length - 20} more (see report JSON)`);
    }
  }

  if (errors.length > 0) {
    console.log(`\n${errors.length} OTS/API errors — see report for details`);
  }

  const failRate = summary.fail / Math.max(1, summary.total - summary.skipped - summary.error);
  const exitOnFailure = process.env.OTS_CHECK_STRICT !== "0";

  if (exitOnFailure && (failures.length > 0 || failRate > 0.15)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
