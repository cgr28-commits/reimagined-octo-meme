#!/usr/bin/env node
/**
 * Seed local tracking demo jobs and print customer/driver test URLs.
 *
 * Prerequisite: worker running locally, e.g.
 *   npx wrangler dev --config wrangler.local.toml --port 8787
 */
import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const workerDir = join(new URL("..", import.meta.url).pathname, "workers/addresses");
const workerBase = process.env.DEMO_WORKER_URL?.trim() || "http://127.0.0.1:8787";
const siteBase = process.env.DEMO_SITE_URL?.trim() || "http://127.0.0.1:3000";
const driverKey = "demo-driver-key";

const demos = buildDemoJobs();

function londonParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    tripDate: `${get("year")}-${get("month")}-${get("day")}`,
    tripTime: `${get("hour")}:${get("minute")}`,
    pickupAt: `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`,
  };
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function buildDemoJobs() {
  const now = new Date();
  const tomorrow = addMinutes(now, 24 * 60);
  const soon = addMinutes(now, 45);
  const live = addMinutes(now, 30);

  return [
    {
      id: "demo-early",
      label: "Too early (pickup tomorrow — link saved but inactive)",
      record: baseRecord("demo-early", londonParts(tomorrow), {
        customerName: "Alex Demo",
        pickupLabel: "249 Rashee Road, Ballyclare",
        dropoffLabel: "Belfast International Airport (BFS)",
      }),
    },
    {
      id: "demo-waiting",
      label: "Window open — waiting for driver to start sharing",
      record: baseRecord("demo-waiting", londonParts(soon), {
        customerName: "Jamie Demo",
        pickupLabel: "Holiday Inn Express, Belfast",
        dropoffLabel: "George Best Belfast City Airport (BHD)",
      }),
    },
    {
      id: "demo-live",
      label: "Live map — driver sharing location now",
      record: {
        ...baseRecord("demo-live", londonParts(live), {
          customerName: "Sam Demo",
          pickupLabel: "Titanic Belfast",
          dropoffLabel: "Belfast International Airport (BFS)",
        }),
        sharingActive: true,
        driverLat: 54.5973,
        driverLng: -5.9301,
        driverUpdatedAt: new Date().toISOString(),
      },
    },
  ];
}

function baseRecord(token, parts, trip) {
  return {
    token,
    createdAt: new Date().toISOString(),
    customerName: trip.customerName,
    customerMobile: "+447700900123",
    pickupLabel: trip.pickupLabel,
    dropoffLabel: trip.dropoffLabel,
    tripDate: parts.tripDate,
    tripTime: parts.tripTime,
    pickupAt: parts.pickupAt,
    paymentReference: "DEMO-MATNI-1001",
    sharingActive: false,
  };
}

function putKv(key, value) {
  const tempDir = mkdtempSync(join(tmpdir(), "matni-kv-"));
  const filePath = join(tempDir, "value.json");
  writeFileSync(filePath, JSON.stringify(value));

  try {
    execSync(
      `npx wrangler kv key put ${JSON.stringify(key)} --path=${JSON.stringify(filePath)} --binding TRACKING_STORE --local --config wrangler.local.toml`,
      { cwd: workerDir, stdio: "pipe" },
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function seedJobs() {
  const dayTokens = new Map();

  for (const demo of demos) {
    putKv(`track:job:${demo.id}`, demo.record);
    const tokens = dayTokens.get(demo.record.tripDate) ?? [];
    tokens.push(demo.id);
    dayTokens.set(demo.record.tripDate, tokens);
  }

  for (const [tripDate, tokens] of dayTokens) {
    putKv(`track:day:${tripDate}`, tokens);
  }
}

async function fetchJson(path) {
  const response = await fetch(`${workerBase}${path}`);
  const body = await response.json();
  return { status: response.status, body };
}

async function main() {
  console.log("Seeding demo tracking jobs into local KV…");
  seedJobs();

  console.log("\n=== API responses (what the customer page reads) ===\n");

  for (const demo of demos) {
    const { status, body } = await fetchJson(`/track/${demo.id}`);
    console.log(`--- ${demo.label} ---`);
    console.log(`GET /track/${demo.id} → HTTP ${status}`);
    console.log(JSON.stringify(body, null, 2));
    console.log("");
  }

  console.log("=== Customer pages (open in browser) ===\n");
  for (const demo of demos) {
    console.log(`${demo.label}`);
    console.log(`  ${siteBase}/track/?id=${demo.id}`);
    console.log(`  https://www.myairporttaxini.co.uk/track/?id=${demo.id}\n`);
  }

  console.log("Demo index page:");
  console.log(`  ${siteBase}/track/demo/`);
  console.log("  https://www.myairporttaxini.co.uk/track/demo/\n");

  console.log("=== Driver dashboard ===\n");
  console.log(`  ${siteBase}/driver/`);
  console.log(`  Access key: ${driverKey}\n`);

  const jobs = await fetchJson(`/driver/jobs?key=${driverKey}`);
  console.log("GET /driver/jobs (today):");
  console.log(JSON.stringify(jobs.body, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
