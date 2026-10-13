import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CORK_TRANSFER_PAGES } from "../src/lib/cork-transfer-content";
for (const direction of ["belfast-to-cork", "cork-to-belfast"] as const) {
  const page = CORK_TRANSFER_PAGES[direction];
  assert.ok(page.description.length <= 170);
  assert.ok(page.faqs.length >= 6);
  assert.equal(new Set(page.faqs.map(faq => faq.question)).size, page.faqs.length);
  assert.ok(page.collectionText !== CORK_TRANSFER_PAGES[direction === "belfast-to-cork" ? "cork-to-belfast" : "belfast-to-cork"].collectionText);
  const html = readFileSync(`out/transfers/${direction}/index.html`, "utf8");
  assert.ok(html.includes(`https://www.myairporttaxini.co.uk/transfers/${direction}/`));
  assert.ok(html.includes('"@type":"Service"'));
  assert.ok(html.includes('"@type":"FAQPage"'));
  assert.ok(html.includes('"@type":"BreadcrumbList"'));
  assert.ok(html.includes('id="quote"'));
  assert.ok(html.includes(page.collectionTitle));
  const hero = direction === "belfast-to-cork" ? "cork-cathedral-river" : "belfast-big-fish";
  assert.ok(html.includes(hero));
  assert.ok(html.includes(direction === "belfast-to-cork" ? "Zairon" : "Ajay Suresh"));
  for (const width of [960, 1920]) for (const ext of ["avif", "webp", "jpg"])
    assert.ok(readFileSync(`public/images/hero/optimized/${hero}-${width}.${ext}`).length > 1000);

  const sitemap = readFileSync("public/sitemap.xml", "utf8");
  assert.ok(sitemap.includes(`/transfers/${direction}/`));
}
assert.ok(CORK_TRANSFER_PAGES["cork-to-belfast"].quoteText.includes("personalised"));
console.log("Cork route content, rendered metadata/schema, quote section and sitemap checks passed.");
