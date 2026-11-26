/**
 * Owner, 26 Nov 2026: the standard return-booking discount is paused while the Black Friday
 * (scheduled promo) offer runs, and comes back by itself afterwards.
 * Real SQLite (node:sqlite) through the D1 API shape and the real promo migration.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { defaultOwnerPricingSettings } from "../shared/owner-pricing-config";
import { savePromoSettings, type PromoDb } from "../workers/addresses/src/promo-store";
import { withReturnDiscountPausedDuringOffer } from "../workers/addresses/src/owner-pricing-handlers";
import { savedQuotePricingFor } from "../workers/addresses/src/owner-pricing-store";

function d1(db: DatabaseSync): PromoDb {
  const make = (sql: string, values: unknown[] = []) => ({
    bind: (...v: unknown[]) => make(sql, v),
    first: async <T>() => (db.prepare(sql).get(...(values as never[])) as T) ?? null,
    all: async <T>() => ({ results: db.prepare(sql).all(...(values as never[])) as T[] }),
    run: async () => db.prepare(sql).run(...(values as never[])),
  });
  return { prepare: (sql: string) => make(sql) } as unknown as PromoDb;
}

let failed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`✗ ${name}\n`, err);
  }
}

async function main() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync("workers/addresses/migrations/driver-db/0005_promo_codes.sql", "utf8"));
  const db = d1(sqlite);
  const env = { DRIVER_DB: db };
  const pricing = defaultOwnerPricingSettings();
  assert.equal(pricing.returnDiscount.rate, 0.05);
  const during = new Date("2026-11-27T10:00:00Z");
  const before = new Date("2026-11-25T10:00:00Z");
  const after = new Date("2026-12-01T00:00:00Z");

  await savePromoSettings(
    db,
    { enabled: true, campaign: { enabled: true, name: "Black Friday", discountRate: 0.05, startsAt: "2026-11-26T00:00:00.000Z", endsAt: "2026-12-01T00:00:00.000Z" } },
    new Date("2026-11-26T11:00:00Z"),
  );

  await check("offer running: return discount is 0%", async () => {
    const r = await withReturnDiscountPausedDuringOffer(pricing, env, during);
    assert.equal(r.returnDiscount.rate, 0);
  });
  await check("before the offer starts: normal 5% return discount", async () => {
    assert.equal((await withReturnDiscountPausedDuringOffer(pricing, env, before)).returnDiscount.rate, 0.05);
  });
  await check("after the offer ends (end is exclusive): 5% is back with no action", async () => {
    assert.equal((await withReturnDiscountPausedDuringOffer(pricing, env, after)).returnDiscount.rate, 0.05);
  });
  await check("every other pricing field is untouched (Christmas surcharge, tiers, Dublin adjustment)", async () => {
    const r = await withReturnDiscountPausedDuringOffer(pricing, env, during);
    assert.deepEqual({ ...r, returnDiscount: pricing.returnDiscount }, pricing);
    assert.equal(pricing.returnDiscount.rate, 0.05, "stored settings object is not mutated");
  });
  await check("saved quotes keep the discount they were quoted with", async () => {
    const paused = await withReturnDiscountPausedDuringOffer(pricing, env, during);
    assert.equal(savedQuotePricingFor(paused, { returnDiscountRate: 0.05 }).returnDiscount.rate, 0.05);
  });
  await check("owner switches the offer off in the dashboard: 5% returns immediately", async () => {
    await savePromoSettings(db, { campaign: { enabled: false, name: "Black Friday", discountRate: 0.05, startsAt: "2026-11-26T00:00:00.000Z", endsAt: "2026-12-01T00:00:00.000Z" } }, new Date("2026-11-27T11:00:00Z"));
    assert.equal((await withReturnDiscountPausedDuringOffer(pricing, env, during)).returnDiscount.rate, 0.05);
  });
  await check("promo master switch off: offer not running, 5% stays", async () => {
    await savePromoSettings(db, { enabled: true, campaign: { enabled: true, name: "Black Friday", discountRate: 0.05, startsAt: "2026-11-26T00:00:00.000Z", endsAt: "2026-12-01T00:00:00.000Z" } }, new Date("2026-11-27T12:00:00Z"));
    await savePromoSettings(db, { enabled: false }, new Date("2026-11-27T12:01:00Z"));
    assert.equal((await withReturnDiscountPausedDuringOffer(pricing, env, during)).returnDiscount.rate, 0.05);
  });
  await check("fail safe: no database, or a database error, keeps the 5%", async () => {
    assert.equal((await withReturnDiscountPausedDuringOffer(pricing, undefined, during)).returnDiscount.rate, 0.05);
    assert.equal((await withReturnDiscountPausedDuringOffer(pricing, {}, during)).returnDiscount.rate, 0.05);
    const broken = { DRIVER_DB: { prepare: () => { throw new Error("boom"); } } };
    assert.equal((await withReturnDiscountPausedDuringOffer(pricing, broken, during)).returnDiscount.rate, 0.05);
  });

  if (failed) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log("\nAll Black Friday return-discount checks passed");
}

void main();
