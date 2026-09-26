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

/** True when git history is incomplete — lastmod would be a shallow-tip date, not the real one. */
function isShallowRepository() {
  try {
    return (
      execFileSync("git", ["rev-parse", "--is-shallow-repository"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim() === "true"
    );
  } catch {
    return true;
  }
}

const SHALLOW_GIT = isShallowRepository();
if (SHALLOW_GIT) {
  console.warn(
    "Sitemap lastmod omitted: git history is shallow or unavailable. Use fetch-depth: 0 in sitemap builds.",
  );
}

/** Real git commit date for a source file. Never invents a build-time lastmod. */
function gitLastModifiedDate(relPath) {
  if (SHALLOW_GIT) return null;
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

const townHubSlugs = [
  "newtownabbey-airport-taxis",
  "carrickfergus-airport-taxis",
  "ballyclare-airport-taxis",
  "lisburn-airport-taxis",
  "bangor-airport-taxis",
  "holywood-airport-taxis",
  "antrim-airport-taxis",
  "ballymena-airport-taxis",
  "larne-airport-taxis",
  "newry-airport-taxis",
  "newtownards-airport-taxis",
  "dundonald-airport-taxis",
  "comber-airport-taxis",
  "carryduff-airport-taxis",
  "hillsborough-airport-taxis",
  "moira-airport-taxis",
  "glengormley-airport-taxis",
  "whiteabbey-airport-taxis",
];

const transferSlugs = [
  "belfast-to-belfast-international",
  "belfast-to-belfast-city",
  "belfast-to-dublin",
  "dublin-airport-to-belfast",
  "belfast-to-city-of-derry",
  "newtownabbey-to-belfast-international",
  "newtownabbey-to-belfast-city-airport",
  "newtownabbey-to-dublin-airport",
  "newtownabbey-to-city-of-derry",
  "carrickfergus-to-belfast-international",
  "carrickfergus-to-belfast-city-airport",
  "carrickfergus-to-dublin-airport",
  "ballyclare-to-belfast-international",
  "ballyclare-to-belfast-city-airport",
  "ballyclare-to-dublin-airport",
  "lisburn-to-belfast-international",
  "lisburn-to-belfast-city-airport",
  "lisburn-to-dublin-airport",
  "lisburn-to-city-of-derry",
  "bangor-to-belfast-international",
  "bangor-to-belfast-city-airport",
  "bangor-to-dublin-airport",
  "bangor-to-city-of-derry",
  "holywood-to-belfast-international",
  "holywood-to-belfast-city-airport",
  "holywood-to-dublin-airport",
  "antrim-to-belfast-international",
  "antrim-to-belfast-city-airport",
  "antrim-to-dublin-airport",
  "ballymena-to-belfast-international",
  "ballymena-to-belfast-city-airport",
  "ballymena-to-dublin-airport",
  "larne-to-belfast-international",
  "larne-to-belfast-city-airport",
  "larne-to-dublin-airport",
  "newry-to-belfast-international",
  "newry-to-belfast-city-airport",
  "newry-to-dublin-airport",
  "newtownards-to-belfast-international",
  "newtownards-to-belfast-city-airport",
  "newtownards-to-dublin-airport",
  "dundonald-to-belfast-international",
  "dundonald-to-belfast-city-airport",
  "dundonald-to-dublin-airport",
  "comber-to-belfast-international",
  "comber-to-belfast-city-airport",
  "comber-to-dublin-airport",
  "carryduff-to-belfast-international",
  "carryduff-to-belfast-city-airport",
  "carryduff-to-dublin-airport",
  "hillsborough-to-belfast-international",
  "hillsborough-to-belfast-city-airport",
  "hillsborough-to-dublin-airport",
  "moira-to-belfast-international",
  "moira-to-belfast-city-airport",
  "moira-to-dublin-airport",
  "glengormley-to-belfast-international",
  "glengormley-to-belfast-city-airport",
  "glengormley-to-dublin-airport",
  "whiteabbey-to-belfast-international",
  "whiteabbey-to-belfast-city-airport",
  "whiteabbey-to-dublin-airport",
];

const pages = [
  { path: "/", source: "src/app/page.tsx" },
  { path: "/airports/", source: "src/app/airports/page.tsx" },
  ...airportSlugs.map((slug) => ({
    path: `/airports/${slug}/`,
    source: "src/lib/location-pages.ts",
  })),
  ...townHubSlugs.map((slug) => ({
    path: `/locations/${slug}/`,
    source: "src/lib/town-hubs-content.ts",
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
  {
    path: "/belfast-cruise-terminal-transfers/",
    source: "src/lib/cruise-terminal-content.ts",
  },
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
  `Wrote sitemap with ${pages.length} URLs (airports ${airportSlugs.length}, town hubs ${townHubSlugs.length}, transfers ${transferSlugs.length}, day trips ${DAY_TRIPS_ENABLED ? "on" : "off"})`,
);
