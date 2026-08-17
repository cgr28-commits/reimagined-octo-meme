/**
 * Guards the owner/driver live-GPS path: session-token posts must be allowed
 * by worker CORS, and the client must send X-Tracking-Session + lat/lng body.
 * Run: npx tsx scripts/check-gps-session-cors.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

console.log("=== GPS session CORS + client wiring ===");

const corsSources = [
  "shared/google-places.ts",
  "workers/addresses/shared/google-places.ts",
];

for (const rel of corsSources) {
  const src = read(rel);
  assert.match(
    src,
    /Access-Control-Allow-Headers[\s\S]*X-Tracking-Session/,
    `${rel} must allow X-Tracking-Session (session GPS posts are cross-origin)`,
  );
  assert.match(src, /X-Driver-Key/);
  assert.match(src, /X-Owner-Key/);
  console.log(`OK  CORS Allow-Headers includes X-Tracking-Session (${rel})`);
}

const api = read("src/lib/tracking-api.ts");
assert.match(api, /export async function postDriverLocation/);
assert.match(api, /headers\["X-Tracking-Session"\]\s*=\s*sessionToken/);
assert.match(api, /"X-Driver-Key":\s*driverKey/);
assert.match(api, /token,\s*\n\s*lat,\s*\n\s*lng/);
assert.match(api, /\$\{WORKER_BASE\}\/driver\/location/);
assert.doesNotMatch(
  api,
  /body:\s*JSON\.stringify\(\{[^}]*latitude/,
  "postDriverLocation must send lat/lng (not latitude/longitude)",
);
console.log("OK  postDriverLocation sends session header + lat/lng");

const panel = read("src/components/OwnerPaidBookingsPanel.tsx");
assert.match(panel, /startGpsWatch/);
assert.match(panel, /watchPosition/);
assert.match(panel, /getCurrentPosition/);
assert.match(panel, /postDriverLocation\(/);
assert.match(panel, /sessionToken/);
assert.match(panel, /serverConnected/);
assert.match(
  panel,
  /GPS upload failed|GPS NOT RECORDING/,
  "Owner GPS failures must surface clearly",
);
console.log("OK  OwnerPaidBookingsPanel wires session GPS + surfaces upload errors");

const handler = read("workers/addresses/src/tracking-handlers.ts");
assert.match(handler, /handleDriverLocationRequest/);
assert.match(handler, /X-Tracking-Session/);
assert.match(handler, /body\.lat/);
assert.match(handler, /body\.lng/);
assert.match(handler, /appendDriverLocationPoint/);
console.log("OK  handleDriverLocationRequest accepts session + lat/lng");

console.log("\nAll GPS session CORS checks passed.");
