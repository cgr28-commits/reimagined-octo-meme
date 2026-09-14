/**
 * Legacy transfer slugs must 301/308 to the new canonical URL.
 * Run: npx tsx scripts/check-transfer-legacy-redirects.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import nextConfig from "../next.config";
import { TRANSFER_LEGACY_REDIRECTS } from "../src/lib/transfer-legacy-redirects.mjs";
import {
  getCanonicalTransferSlugs,
  getTransferLegacyRedirects,
  getTransferRoutePage,
  getTransferStaticSlugs,
  TRANSFER_ROUTE_PAGES,
} from "../src/lib/location-pages";

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

/** Previously indexed slugs that were renamed in the first SEO batch. */
const EXPECTED_REDIRECTS = [
  { fromSlug: "newtownabbey-to-dublin", toSlug: "newtownabbey-to-dublin-airport" },
  { fromSlug: "lisburn-to-dublin", toSlug: "lisburn-to-dublin-airport" },
  { fromSlug: "bangor-to-dublin", toSlug: "bangor-to-dublin-airport" },
  { fromSlug: "newtownabbey-to-belfast-city", toSlug: "newtownabbey-to-belfast-city-airport" },
  { fromSlug: "lisburn-to-belfast-city", toSlug: "lisburn-to-belfast-city-airport" },
  { fromSlug: "bangor-to-belfast-city", toSlug: "bangor-to-belfast-city-airport" },
] as const;

const CANONICAL_MUST_NOT_REDIRECT = [
  "belfast-to-dublin",
  "belfast-to-belfast-city",
  "belfast-to-belfast-international",
  "belfast-to-city-of-derry",
  "newtownabbey-to-belfast-international",
  "newtownabbey-to-belfast-city-airport",
  "newtownabbey-to-dublin-airport",
  "newtownabbey-to-city-of-derry",
] as const;

console.log("=== Legacy → canonical map ===");
{
  const redirects = getTransferLegacyRedirects();
  assert.equal(redirects.length, EXPECTED_REDIRECTS.length);
  const got = new Map(redirects.map((item) => [item.fromSlug, item.toSlug]));
  const modulePairs = new Map(
    TRANSFER_LEGACY_REDIRECTS.map((item) => [item.fromSlug, item.toSlug]),
  );
  assert.deepEqual(Object.fromEntries(got), Object.fromEntries(modulePairs));
  for (const expected of EXPECTED_REDIRECTS) {
    assert.equal(got.get(expected.fromSlug), expected.toSlug, expected.fromSlug);
    const page = getTransferRoutePage(expected.fromSlug);
    assert.ok(page, `lookup missing for ${expected.fromSlug}`);
    assert.equal(page.slug, expected.toSlug);
    assert.notEqual(expected.fromSlug, expected.toSlug);
  }
  const fromSlugs = redirects.map((item) => item.fromSlug);
  assert.equal(new Set(fromSlugs).size, fromSlugs.length, "duplicate legacy slugs");
  for (const slug of CANONICAL_MUST_NOT_REDIRECT) {
    assert.equal(got.has(slug), false, `must not redirect canonical ${slug}`);
    assert.equal(getTransferRoutePage(slug)?.slug, slug);
  }
  const canonical = new Set(getCanonicalTransferSlugs());
  for (const item of redirects) {
    assert.equal(canonical.has(item.fromSlug), false);
    assert.equal(canonical.has(item.toSlug), true);
    assert.equal(item.destination, `/transfers/${item.toSlug}/`);
    assert.equal(item.source, `/transfers/${item.fromSlug}`);
    assert.equal(item.sourceTrailing, `/transfers/${item.fromSlug}/`);
  }
  console.log(`OK  ${redirects.length} legacy slugs map to distinct canonicals`);
}

console.log("\n=== Next.js permanent redirects ===");
{
  assert.equal(typeof nextConfig.redirects, "function");
}

async function main() {
  const configured = await nextConfig.redirects!();
  assert.ok(configured.length > 0, "Vercel/Next redirects must not be empty");
  const bySource = new Map(configured.map((item) => [item.source, item]));
  for (const item of getTransferLegacyRedirects()) {
    const withoutSlash = bySource.get(item.source);
    const withSlash = bySource.get(item.sourceTrailing);
    assert.ok(withoutSlash, `missing redirect ${item.source}`);
    assert.ok(withSlash, `missing redirect ${item.sourceTrailing}`);
    assert.equal(withoutSlash.destination, item.destination);
    assert.equal(withSlash.destination, item.destination);
    assert.equal(withoutSlash.permanent, true);
    assert.equal(withSlash.permanent, true);
    assert.notEqual(item.source, item.destination);
    assert.notEqual(item.sourceTrailing, item.destination);
  }
  for (const slug of CANONICAL_MUST_NOT_REDIRECT) {
    assert.equal(bySource.has(`/transfers/${slug}`), false);
    assert.equal(bySource.has(`/transfers/${slug}/`), false);
  }
  console.log(`OK  next.config redirects ${configured.length} sources as permanent`);

  console.log("\n=== Page issues permanentRedirect; no duplicate static params ===");
  const transferPage = read("src/app/transfers/[slug]/page.tsx");
  assert.match(transferPage, /permanentRedirect/);
  assert.match(transferPage, /if \(page\.slug !== slug\)/);
  assert.match(transferPage, /permanentRedirect\(`\/transfers\/\$\{page\.slug\}\/`\)/);
  assert.deepEqual(getTransferStaticSlugs(), getCanonicalTransferSlugs());
  const staticSlugs = new Set(getTransferStaticSlugs());
  for (const item of getTransferLegacyRedirects()) {
    assert.equal(staticSlugs.has(item.fromSlug), false, `legacy ${item.fromSlug} must not be statically generated`);
    assert.equal(staticSlugs.has(item.toSlug), true);
  }
  console.log("OK  legacy slugs are lookup-only; canonical slugs stay static");

  console.log("\n=== Sitemap and internal links stay on canonical slugs ===");
  const sitemap = read("public/sitemap.xml");
  const sitemapScript = read("scripts/generate-sitemap.mjs");
  const locations = read("src/app/locations/page.tsx");
  const hubPage = read("src/app/locations/[slug]/page.tsx");
  const airportPage = read("src/app/airports/[slug]/page.tsx");
  for (const item of getTransferLegacyRedirects()) {
    assert.doesNotMatch(sitemap, new RegExp(`/transfers/${item.fromSlug}/`));
    assert.doesNotMatch(sitemapScript, new RegExp(`"${item.fromSlug}"`));
    assert.doesNotMatch(locations, new RegExp(`/transfers/${item.fromSlug}/`));
    assert.doesNotMatch(hubPage, new RegExp(`/transfers/${item.fromSlug}/`));
    assert.doesNotMatch(airportPage, new RegExp(`/transfers/${item.fromSlug}/`));
  }
  assert.match(transferPage, /href=\{`\/transfers\/\$\{route\.slug\}\/`\}/);
  for (const page of TRANSFER_ROUTE_PAGES) {
    if (!page.legacySlugs?.length) continue;
    for (const legacy of page.legacySlugs) {
      assert.notEqual(legacy, page.slug);
    }
  }
  console.log("OK  sitemap and in-app transfer hrefs use canonical slugs only");

  console.log("\nAll transfer legacy redirect checks passed.");
  console.log(
    getTransferLegacyRedirects()
      .map((item) => `${item.sourceTrailing} → ${item.destination}`)
      .join("\n"),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
