#!/usr/bin/env node
/**
 * Build step: record whether the quote tools should ask for the pickup date and time up front,
 * from the owner's live surcharge settings, so the first paint of the quote form matches them.
 *
 * Asked up front only when the evening, night or weekend surcharge is on (Christmas does not
 * count). Never fails the build: on any problem the committed fallback file is left as it is.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "src/generated/quote-schedule-default.ts");
const feed = "https://reimagined-octo-meme.cgr28.workers.dev/pricing/public";

function on(mode) {
  return Boolean(mode) && mode.enabled === true && Number(mode.surchargeRate) > 0;
}

try {
  const response = await fetch(feed, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
  const body = await response.json();
  const config = body && body.config;
  if (!response.ok || !config || typeof config !== "object") throw new Error("pricing feed unavailable");
  const upFront = on(config.evening) || on(config.night) || on(config.weekend);
  const current = fs.readFileSync(target, "utf8");
  const next = current.replace(
    /export const QUOTE_SCHEDULE_UP_FRONT_AT_BUILD: boolean = (true|false);/,
    `export const QUOTE_SCHEDULE_UP_FRONT_AT_BUILD: boolean = ${upFront};`,
  );
  if (next === current && !current.includes(`boolean = ${upFront};`)) throw new Error("fallback file has an unexpected shape");
  if (next !== current) fs.writeFileSync(target, next);
  console.log(`Quote schedule default: date and time ${upFront ? "asked before the price" : "taken at the booking step"} (pricing version ${config.version}).`);
} catch (error) {
  console.warn(`Quote schedule default left as committed: ${error instanceof Error ? error.message : String(error)}`);
}
