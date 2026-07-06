import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = "out";

const sitemapPath = join(root, "sitemap.xml");
if (!existsSync(sitemapPath)) {
  throw new Error("out/sitemap.xml missing after build — static sitemap must be in public/");
}
const sitemap = readFileSync(sitemapPath, "utf8");
if (!sitemap.includes("<urlset") || !sitemap.includes("<loc>")) {
  throw new Error("out/sitemap.xml is invalid or empty");
}

const replacements = [
  [/="\/_next\//g, '="./_next/'],
  [/='\/_next\//g, "='./_next/"],
  [/="\/images\//g, '="./images/'],
  [/='\/images\//g, "='./images/"],
  [/="\/logo\.png"/g, '="./logo.png"'],
  [/="\/icon\.png"/g, '="./icon.png"'],
  [/="\/og-image\.png"/g, '="./og-image.png"'],
  [/="\/favicon\.png"/g, '="./favicon.png"'],
  [/="\/terms\//g, '="./terms/'],
  [/url\(\/_next\//g, "url(./_next/"],
  [/url\(\/images\//g, "url(./images/"],
  [/"\/_next\//g, '"./_next/'],
  [/'\/_next\//g, "'./_next/"],
  [/"\/images\//g, '"./images/'],
  [/'\/images\//g, "'./images/"],
];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);

    if (statSync(path).isDirectory()) {
      walk(path);
      continue;
    }

    if (!/\.(html|js|css)$/.test(name)) {
      continue;
    }

    let content = readFileSync(path, "utf8");
    let next = content;

    for (const [from, to] of replacements) {
      next = next.replace(from, to);
    }

    if (next !== content) {
      writeFileSync(path, next);
    }
  }
}

walk(root);
