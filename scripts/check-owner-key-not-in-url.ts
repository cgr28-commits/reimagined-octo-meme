/**
 * Owner/driver credentials must never be placed in request URLs (they end up in
 * logs and history). Website side only — the Worker still accepts ?key= for older
 * cached pages until that compatibility is removed in a separate, approved step.
 * Run: npx tsx scripts/check-owner-key-not-in-url.ts
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const offenders: string[] = [];
for (const file of walk("src")) {
  const text = readFileSync(file, "utf8");
  text.split("\n").forEach((line, i) => {
    if (/^\s*(\*|\/\/)/.test(line)) return; // comments
    const credentialInUrl =
      /[?&]key=\$\{[^}]*(owner|driver|access|saved)Key/i.test(line) ||
      /searchParams\.(set|append)\(\s*["']key["']/.test(line) ||
      /driverQueryKey\(/.test(line);
    if (credentialInUrl) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
  });
}
assert.deepEqual(offenders, [], `Credentials placed in URLs:\n${offenders.join("\n")}`);

// The four GETs that used to authenticate only via the URL now send the header.
const api = readFileSync("src/lib/tracking-api.ts", "utf8");
for (const path of ["/driver/vehicle/profiles", "/driver/vehicle`", "/driver/roster", "/driver/location-history"]) {
  const at = api.indexOf(path);
  assert.ok(at > 0, `${path} call not found`);
  const window = api.slice(at, at + 600);
  assert.match(window, /headers: driverGetHeaders\(/, `${path} must send the auth header`);
}
// The inbox thread parameter is a thread id, not a credential — allowed.
assert.match(readFileSync("src/components/OwnerInboxPanel.tsx", "utf8"), /thread\?key=\$\{encodeURIComponent\(thread\.threadKey\)\}/);
console.log("No owner/driver credentials in request URLs.");
