import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = "out";

const sitemapPath = join(root, "sitemap.xml");
if (!existsSync(sitemapPath)) {
  throw new Error("out/sitemap.xml missing after build — static sitemap must be in public/");
}
const sitemap = readFileSync(sitemapPath, "utf8");
if (!sitemap.includes("<urlset") || !sitemap.includes("<loc>")) {
  throw new Error("out/sitemap.xml is invalid or empty");
}

function getRelativePrefix(relativePath) {
  const depth = relativePath.split("/").length - 1;

  if (depth === 0) {
    return "./";
  }

  return "../".repeat(depth);
}

function buildReplacements(prefix) {
  return [
    [/="\/_next\//g, `="${prefix}_next/`],
    [/='\/_next\//g, `='${prefix}_next/`],
    [/="\/images\//g, `="${prefix}images/`],
    [/='\/images\//g, `='${prefix}images/`],
    [/="\/logo\.png"/g, `="${prefix}logo.png"`],
    [/="\/icon\.png"/g, `="${prefix}icon.png"`],
    [/="\/og-image\.png"/g, `="${prefix}og-image.png"`],
    [/="\/favicon\.png"/g, `="${prefix}favicon.png"`],
    [/="\/terms\//g, `="${prefix}terms/`],
    [/='\/terms\//g, `='${prefix}terms/`],
    [/="\/tours\//g, `="${prefix}tours/`],
    [/='\/tours\//g, `='${prefix}tours/`],
    [/url\(\/_next\//g, `url(${prefix}_next/`],
    [/url\(\/images\//g, `url(${prefix}images/`],
    [/"\/_next\//g, `"${prefix}_next/`],
    [/'\/_next\//g, `'${prefix}_next/`],
    [/"\/images\//g, `"${prefix}images/`],
    [/'\/images\//g, `'${prefix}images/`],
  ];
}

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

    const relativePath = relative(root, path).replace(/\\/g, "/");
    const prefix = getRelativePrefix(relativePath);
    const replacements = buildReplacements(prefix);

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
