/** Run after the static production build. Check rendered copy across every exported route. */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const output = join(process.cwd(), "out");
assert.ok(existsSync(output), "Run GITHUB_PAGES=true npm run build first");
const stationPath = "belfast-grand-central-station-taxi/index.html";
const stationIntro = "Pre-book your transfer to or from Belfast Grand Central Station in just a few clicks.";
const airportIntro = "Pre-book your airport transfer in just a few clicks.";
const pickupNotice = "Do not assume collection at the public-hire taxi rank.";
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : path.endsWith(".html") ? [path] : [];
  });
}
const pages = files(output);
for (const file of pages) {
  // Ignore Next's serialized payload: verify the visible pre-rendered document.
  const html = readFileSync(file, "utf8").replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
  if (relative(output, file) === stationPath) {
    assert.ok(html.includes(stationIntro), "Station form must show the station introduction");
    assert.ok(html.includes(pickupNotice), "Station form must show the pickup notice");
    assert.ok(!html.includes(airportIntro), "Airport-only introduction must not appear on station page");
    assert.equal((html.match(/<details\b/g) ?? []).length, 14, "Keep all station FAQs");
  } else {
    assert.ok(!html.includes(stationIntro), `Station introduction leaked into ${file}`);
    assert.ok(!html.includes(pickupNotice), `Station pickup notice leaked into ${file}`);
  }
}
for (const route of ["index.html", "airports/belfast-city/index.html", "airports/belfast-international/index.html", "airports/dublin/index.html", "transfers/belfast-to-dublin-airport/index.html", "locations/newtownabbey-airport-taxis/index.html"]) {
  const html = readFileSync(join(output, route), "utf8").replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
  assert.ok(html.includes(airportIntro), `Shared quote introduction changed on ${route}`);
}
console.log(`PASS: station-only introduction and pickup notice isolated across ${pages.length} exported HTML pages; shared airport, homepage, town and transfer copy retained; all 14 FAQs retained.`);
