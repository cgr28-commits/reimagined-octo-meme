import assert from "node:assert/strict";
import { fetchCachedLeg, measureOperationalJob } from "../workers/addresses/src/profitability";
import { universalDrivingMilesFromKm } from "../shared/universal-distance-pricing";

async function main() {
  const originalFetch = globalThis.fetch;
  const releases: Array<() => void> = [], urls: string[] = [];
  globalThis.fetch = async (input) => {
    urls.push(String(input));
    await new Promise<void>(resolve => releases.push(resolve));
    return new Response(JSON.stringify({ routes: [{ distance: 10000, duration: 1200 }] }));
  };
  try {
    const input = { pickup: { lat: 54.60123, lng: -5.93234 }, dropoff: { lat: 54.66456, lng: -6.21789 }, passenger: { distanceKm: 30, durationMinutes: 35 } };
    const saloon = measureOperationalJob(input), estate = measureOperationalJob(input);
    assert.equal(urls.length, 2, "Both independent legs start immediately and both vehicles share them");
    assert.notEqual(urls[0], urls[1]);
    releases.splice(0).forEach(release => release());
    const [a, b] = await Promise.all([saloon, estate]);
    assert.deepEqual(a, b);
    assert.deepEqual(a, { operationalMiles: universalDrivingMilesFromKm(50), operationalMinutes: 75 });
    assert.deepEqual(await measureOperationalJob(input), a);
    assert.equal(urls.length, 2, "Completed legs retain their existing cache");
    const forward = fetchCachedLeg(input.pickup, input.dropoff), reverse = fetchCachedLeg(input.dropoff, input.pickup);
    assert.equal(urls.length, 4, "Opposite directions must not share a route");
    releases.splice(0).forEach(release => release());
    await Promise.all([forward, reverse]);
    let failures = 0;
    globalThis.fetch = async () => { failures++; return new Response("unavailable", { status: 503 }); };
    const from = { lat: 54.714321, lng: -5.851234 }, to = { lat: 54.744321, lng: -5.891234 };
    assert.equal(await fetchCachedLeg(from, to), null);
    const attempts = failures;
    assert.ok(attempts > 0);
    assert.equal(await fetchCachedLeg(from, to), null);
    assert.equal(failures, attempts * 2, "Failed routes must clear in-flight state and retry");
    console.log("OK parallel positioning, shared vehicle lookups, unchanged totals, directed caching and failure retry");
  } finally { globalThis.fetch = originalFetch; }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
