import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SITE_URL = "https://www.myairporttaxini.co.uk";

// Keep in sync with SERVICE_FLAGS in src/lib/data.ts
const DAY_TRIPS_ENABLED = false;
const ADDRESS_TO_ADDRESS_ENABLED = true;
const TRACKING_DEMO_ENABLED = false;
const BELFAST_CITY_AIRPORT_ENABLED = true;

/** Europe/London civil date YYYY-MM-DD — matches shared/uk-time todayLondonDate. */
function todayLondonDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(now);
}

/** Real git commit date for a source file. Never invents a build-time lastmod. */
function gitLastModifiedDate(relPath) {
  try {
    const iso = execFileSync("git", ["log", "-1", "--format=%cI", "--", relPath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (!iso) return null;
    const day = iso.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
  } catch {
    return null;
  }
}

const emergeConfig = JSON.parse(
  readFileSync(join(process.cwd(), "src/lib/emerge-belfast-config.json"), "utf8"),
);
// Match isEmergeBelfastCampaignActive — omit when hidden or past expiresOn.
const EMERGE_CAMPAIGN_ACTIVE =
  emergeConfig.publiclyVisible !== false &&
  todayLondonDate() <= emergeConfig.expiresOn;

const tourSlugs = [
  "giants-causeway",
  "belfast-city",
  "game-of-thrones",
  "antrim-coast",
  "mourne-mountains",
  "derry-londonderry",
];

const airportSlugs = [
  "belfast-international",
  ...(BELFAST_CITY_AIRPORT_ENABLED ? ["belfast-city"] : []),
  "dublin",
  "city-of-derry",
];

const townSlugs = ["belfast", "newtownabbey", "lisburn", "bangor"];

const transferSlugs = townSlugs.flatMap((town) =>
  airportSlugs.map((airport) => `${town}-to-${airport}`),
);

const pages = [
  { path: "/", source: "src/app/page.tsx" },
  { path: "/airports/", source: "src/app/airports/page.tsx" },
  ...airportSlugs.map((slug) => ({
    path: `/airports/${slug}/`,
    source: "src/lib/location-pages.ts",
  })),
  ...transferSlugs.map((slug) => ({
    path: `/transfers/${slug}/`,
    source: "src/lib/location-pages.ts",
  })),
  ...(DAY_TRIPS_ENABLED
    ? [
        { path: "/tours/", source: "src/app/tours/page.tsx" },
        ...tourSlugs.map((slug) => ({
          path: `/tours/${slug}/`,
          source: "src/lib/tours.ts",
        })),
      ]
    : []),
  ...(ADDRESS_TO_ADDRESS_ENABLED
    ? [
        { path: "/long-distance-transfers/", source: "src/lib/long-distance-content.ts" },
        { path: "/locations/", source: "src/lib/locations-content.ts" },
      ]
    : []),
  { path: "/terms/", source: "src/lib/terms.ts" },
  { path: "/cancellation/", source: "shared/cancellation-policy.ts" },
  { path: "/privacy/", source: "src/lib/privacy.ts" },
  { path: "/contact/", source: "src/app/contact/page.tsx" },
  // /unsubscribe/ is noindex — omit from the sitemap.
  // /book/, /quote/, /manage-booking/, /pay/, /owner/, /driver/ omitted.
  // EMERGE landing stays at the same URL year to year — omit from sitemap when expired (no 301).
  ...(EMERGE_CAMPAIGN_ACTIVE
    ? [{ path: emergeConfig.path, source: "src/lib/emerge-belfast-config.json" }]
    : []),
  // /driver/, /owner/, /track/demo/, /test-booking/ intentionally omitted from public sitemap
  ...(TRACKING_DEMO_ENABLED
    ? [{ path: "/track/demo/", source: "src/app/track/demo/page.tsx" }]
    : []),
];

const urls = pages
  .map((page) => {
    const lastmod = gitLastModifiedDate(page.source);
    return `  <url>
    <loc>${SITE_URL}${page.path}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ""}
  </url>`;
  })
  .join("\n");

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

writeFileSync(join(process.cwd(), "public", "sitemap.xml"), xml);
console.log(
  `Wrote sitemap with ${pages.length} URLs (airports ${airportSlugs.length}, transfers ${transferSlugs.length}, day trips ${DAY_TRIPS_ENABLED ? "on" : "off"})`,
);
