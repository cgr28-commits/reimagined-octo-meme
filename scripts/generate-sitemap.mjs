import { writeFileSync } from "node:fs";
import { join } from "node:path";

const SITE_URL = "https://www.myairporttaxini.co.uk";

const pages = [
  { path: "/", changefreq: "monthly", priority: "1.0" },
  { path: "/terms/", changefreq: "yearly", priority: "0.5" },
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

writeFileSync(join("public", "sitemap.xml"), xml, "utf8");
console.log("Generated public/sitemap.xml");
