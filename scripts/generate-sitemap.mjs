import { writeFileSync } from "node:fs";
import { join } from "node:path";

const SITE_URL = "https://www.myairporttaxini.co.uk";

// Keep in sync with SERVICE_FLAGS in src/lib/data.ts
const DAY_TRIPS_ENABLED = false;
const TRACKING_DEMO_ENABLED = false;

const tourSlugs = [
  "giants-causeway",
  "belfast-city",
  "game-of-thrones",
  "antrim-coast",
  "mourne-mountains",
  "derry-londonderry",
];

const pages = [
  { path: "/", changefreq: "monthly", priority: "1.0" },
  ...(DAY_TRIPS_ENABLED
    ? [
        { path: "/tours/", changefreq: "monthly", priority: "0.9" },
        ...tourSlugs.map((slug) => ({
          path: `/tours/${slug}/`,
          changefreq: "monthly",
          priority: "0.8",
        })),
      ]
    : []),
  { path: "/terms/", changefreq: "yearly", priority: "0.5" },
  { path: "/privacy/", changefreq: "yearly", priority: "0.5" },
  { path: "/contact/", changefreq: "monthly", priority: "0.8" },
  { path: "/unsubscribe/", changefreq: "yearly", priority: "0.3" },
  // /driver/, /owner/, /track/demo/, /test-booking/ intentionally omitted from public sitemap
  ...(TRACKING_DEMO_ENABLED
    ? [{ path: "/track/demo/", changefreq: "monthly", priority: "0.4" }]
    : []),
];

const lastmod = new Date().toISOString().split("T")[0];

const urls = pages
  .map(
    (page) => `  <url>
    <loc>${SITE_URL}${page.path}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`,
  )
  .join("\n");

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

writeFileSync(join(process.cwd(), "public", "sitemap.xml"), xml);
console.log(
  `Wrote sitemap with ${pages.length} URLs (day trips ${DAY_TRIPS_ENABLED ? "on" : "off"}, tracking demo ${TRACKING_DEMO_ENABLED ? "on" : "off"})`,
);
