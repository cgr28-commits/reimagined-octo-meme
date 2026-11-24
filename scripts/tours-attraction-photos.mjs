#!/usr/bin/env node
/**
 * Private Tours (staging): fetch openly licensed attraction photographs from Wikimedia Commons.
 * - Licence gate: CC0, CC BY, CC BY-SA, public domain only (no NC/ND/GFDL-only/fair use). Credit data comes from the Commons API, not from memory.
 * - Relevance gate: file title/description must contain a word from "must"; categories are preferred.
 * - Output: public/images/private-tours/<id>.webp (960px wide) and src/lib/private-tours-photo-credits.json.
 * Attractions with no acceptable photograph are listed in the report and shown without a photo (never a stand-in picture).
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { ATTRACTIONS } from "../workers/tours/src/engine/attractions.js";

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_PATH || "sharp");
const CONFIG = JSON.parse(readFileSync(new URL("./tours-attraction-photos.config.json", import.meta.url), "utf8"));
const API = "https://commons.wikimedia.org/w/api.php";
const UA = "MyAirportTaxiNI-staging-photo-fetch/1.0 (https://www.myairporttaxini.co.uk; bookings@myairporttaxini.co.uk)";
const OUT_DIR = "public/images/private-tours";
const CREDITS_FILE = "src/lib/private-tours-photo-credits.json";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (h) => String(h || "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

async function get(url, binary = false) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (res.status === 429 || res.status >= 500) { await sleep(2000 * attempt); continue; }
    if (!res.ok) throw new Error(`${res.status} ${url.slice(0, 120)}`);
    return binary ? Buffer.from(await res.arrayBuffer()) : res.json();
  }
  throw new Error(`gave up ${url.slice(0, 120)}`);
}
const q = (params) => `${API}?${new URLSearchParams({ format: "json", formatversion: "2", origin: "*", ...params })}`;
const INFO = { prop: "imageinfo", iiprop: "url|size|mime|extmetadata", iiurlwidth: "1100", iiextmetadatafilter: "LicenseShortName|LicenseUrl|Artist|Credit|ImageDescription|ObjectName|Categories|AttributionRequired" };

async function viaSearch(query) {
  const d = await get(q({ action: "query", generator: "search", gsrsearch: query, gsrnamespace: "6", gsrlimit: "30", ...INFO }));
  return d.query?.pages ?? [];
}
async function viaCategory(cat) {
  const d = await get(q({ action: "query", generator: "categorymembers", gcmtitle: `Category:${cat}`, gcmtype: "file", gcmlimit: "60", ...INFO }));
  return d.query?.pages ?? [];
}

const LICENCE_OK = /^(CC0|CC BY(-SA)? \d\.\d|Public domain|PD)/i;
const TITLE_BAD = /\b(map|plan|logo|diagram|sign|signage|poster|coat of arms|flag|svg|panorama|interior|ticket|stamp|painting|drawing|engraving|postcard|statue|memorial|plaque|night|mosaic|chart|admiralty|car|cars|cat|bmw|bus|lorry|van|tractor|portrait|selfie|wedding|bike|bicycle)\b/i;

function evaluate(page, cfg, fromCategory) {
  const ii = page.imageinfo?.[0];
  if (!ii) return null;
  const md = ii.extmetadata || {};
  const lic = md.LicenseShortName?.value || "";
  if (ii.mime !== "image/jpeg") return null;
  if (!LICENCE_OK.test(lic) || /NC|ND/.test(lic)) return null;
  if (TITLE_BAD.test(page.title.replace(/^File:/, ""))) return null;
  if (ii.width < 1600 || ii.height < 900) return null;
  const ratio = ii.width / ii.height;
  if (ratio < 1.25 || ratio > 2.0) return null;
  const text = `${page.title} ${strip(md.ImageDescription?.value)} ${strip(md.ObjectName?.value)}`.toLowerCase();
  if (!fromCategory && !cfg.must.some((m) => text.includes(m.toLowerCase()))) return null;
  const cats = strip(md.Categories?.value).toLowerCase();
  const artist = strip(md.Artist?.value);
  if (!artist || artist.length > 120) return null; // need a clear photographer credit
  let score = Math.log2(ii.width) - Math.abs(ratio - 1.5) * 2;
  if (/featured pictures|quality images|valued images/.test(cats)) score += 3;
  if (cfg.must.some((m) => page.title.toLowerCase().includes(m.toLowerCase()))) score += 1;
  if (fromCategory) score += 0.5;
  return { page, ii, md, lic, artist, score };
}

mkdirSync(OUT_DIR, { recursive: true });
const credits = existsSync(CREDITS_FILE) ? JSON.parse(readFileSync(CREDITS_FILE, "utf8")) : {};
const report = [];
const RUN = existsSync("scripts/tours-attraction-photos.run.json") ? JSON.parse(readFileSync("scripts/tours-attraction-photos.run.json", "utf8")) : {};
if (RUN.mode === "shortlist") {
  // Review aid: top candidates per attraction as small thumbnails (committed to design/photo-shortlist, removed after review).
  const dir = "design/photo-shortlist"; mkdirSync(dir, { recursive: true });
  const index = {};
  for (const id of RUN.ids || []) {
    const cfg = CONFIG[id]; if (!cfg) continue;
    const pool = [];
    for (const c of cfg.cats || []) { try { for (const p of await viaCategory(c)) pool.push(evaluate(p, cfg, true)); } catch { /* skip */ } await sleep(250); }
    for (const s2 of [...(cfg.q || []), ...(RUN.extraQueries?.[id] || [])]) { try { for (const p of await viaSearch(s2)) pool.push(evaluate(p, cfg, false)); } catch { /* skip */ } await sleep(250); }
    const seen = new Set(); const top = [];
    for (const c of pool.filter(Boolean).sort((x, y) => y.score - x.score)) { if (seen.has(c.page.title)) continue; seen.add(c.page.title); top.push(c); if (top.length >= 8) break; }
    index[id] = [];
    let n = 0;
    for (const c of top) { n += 1; try { const b = await get(c.ii.thumburl, true); await sharp(b).resize({ width: 420 }).jpeg({ quality: 70 }).toFile(`${dir}/${id}__${n}.jpg`); index[id].push({ n, title: c.page.title.replace(/^File:/, ""), author: c.artist, licence: c.lic }); } catch { /* skip */ } }
    console.log(`${id}: ${index[id].length} candidates`);
  }
  writeFileSync(`${dir}/index.json`, JSON.stringify(index, null, 1));
  process.exit(0);
}
const only = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
const force = process.env.FORCE === "1";
const taken = new Set(Object.values(credits).map((c) => c.title));

for (const a of ATTRACTIONS) {
  if (only && !only.has(a.id)) continue;
  if (credits[a.id] && !force) { report.push(`${a.id}: kept (${credits[a.id].title})`); continue; }
  const cfg = CONFIG[a.id];
  if (!cfg) { report.push(`${a.id}: NO CONFIG`); continue; }
  try {
    const pool = [];
    if (cfg.pick) { const d = await get(q({ action: "query", titles: `File:${cfg.pick}`, ...INFO })); for (const p of d.query?.pages ?? []) { const r = evaluate(p, { ...cfg, must: [""] }, true); if (r) { r.score += 100; pool.push(r); } else report.push(`  ${a.id}: picked file failed the licence/size checks`); } }
    for (const c of cfg.cats || []) { try { for (const p of await viaCategory(c)) pool.push(evaluate(p, cfg, true)); } catch (e) { report.push(`  ${a.id}: category ${c} failed (${e.message})`); } await sleep(250); }
    for (const s of cfg.q || []) { try { for (const p of await viaSearch(s)) pool.push(evaluate(p, cfg, false)); } catch (e) { report.push(`  ${a.id}: search failed (${e.message})`); } await sleep(250); }
    const ranked = pool.filter(Boolean).filter((c) => !taken.has(c.page.title)).sort((x, y) => y.score - x.score);
    if (!ranked.length) { report.push(`${a.id}: NO ACCEPTABLE PHOTO`); continue; }
    const best = ranked[0];
    const buf = await get(best.ii.thumburl, true);
    await sharp(buf).resize({ width: 960, withoutEnlargement: true }).webp({ quality: 76 }).toFile(`${OUT_DIR}/${a.id}.webp`);
    taken.add(best.page.title);
    credits[a.id] = {
      title: best.page.title.replace(/^File:/, ""),
      author: best.artist,
      licence: best.lic,
      licenceUrl: best.md.LicenseUrl?.value || "",
      source: best.ii.descriptionurl,
      changes: "Resized and re-encoded.",
    };
    report.push(`${a.id}: OK  ${credits[a.id].title} | ${best.artist} | ${best.lic}  (candidates ${ranked.length})`);
  } catch (e) {
    report.push(`${a.id}: ERROR ${e.message}`);
  }
}
writeFileSync(CREDITS_FILE, JSON.stringify(credits, null, 2) + "\n");
console.log(report.join("\n"));
console.log(`\n${Object.keys(credits).length} of ${ATTRACTIONS.length} attractions have a photograph.`);
