/**
 * Owner/admin mobile chrome — offline checks.
 * Run: npx tsx scripts/check-owner-mobile-ui.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

console.log("=== 1. Public sales widgets hidden on owner/admin/driver ===");
{
  const wa = read("src/components/WhatsAppButton.tsx");
  assert.match(wa, /shouldHidePublicSalesWidgets/);
  assert.match(wa, /usePathname/);

  const quote = read("src/components/QuoteAssistant.tsx");
  assert.match(quote, /shouldHidePublicSalesWidgets/);

  const helper = read("src/lib/owner-portal.ts");
  assert.match(helper, /isOwnerPortalPath/);
  assert.match(helper, /shouldHidePublicSalesWidgets/);
  console.log("OK  WhatsApp + QuoteAssistant gated off private portals");
}

console.log("\n=== 2. Owner portal header replaces public Header on ops pages ===");
{
  const portalHeader = read("src/components/OwnerPortalHeader.tsx");
  assert.match(portalHeader, /Owner Dashboard|Owner/);
  assert.match(portalHeader, /safe-area-inset-top/);
  assert.doesNotMatch(portalHeader, /NAV_LINKS|MOBILE_QUICK_LINKS|QuoteNavLink/);
  assert.doesNotMatch(portalHeader, /href=["']\/#airports["']/);

  const driver = read("src/app/driver/DriverPageClient.tsx");
  assert.match(driver, /OwnerPortalHeader/);
  assert.doesNotMatch(driver, /import Header from/);
  assert.match(driver, /safe-area-inset-top/);

  const refund = read("src/app/admin/refund/RefundPageClient.tsx");
  assert.match(refund, /OwnerPortalHeader/);
  assert.doesNotMatch(refund, /import Header from/);

  const evidencePage = read("src/app/owner/journey-evidence/page.tsx");
  assert.match(evidencePage, /OwnerPortalHeader/);
  assert.match(evidencePage, /safe-area-inset-top/);
  console.log("OK  owner/admin/driver use OwnerPortalHeader; no public Airports/Quote nav");
}

console.log("\n=== 3. Public Header component still has marketing nav (unchanged) ===");
{
  const header = read("src/components/Header.tsx");
  assert.match(header, /NAV_LINKS/);
  assert.match(header, /QuoteNavLink|Get a Quote|MOBILE_QUICK_LINKS/);
  console.log("OK  public Header marketing nav preserved");
}

console.log("\n=== 4. Booking cards: groups + completed Evidence prominence ===");
{
  const panel = read("src/components/OwnerPaidBookingsPanel.tsx");
  assert.match(panel, /uppercase tracking-wider text-white\/40">\s*Journey\s*</);
  assert.match(panel, /uppercase tracking-wider text-white\/40">\s*Customer\s*</);
  assert.match(panel, /uppercase tracking-wider text-white\/40">\s*Admin\s*</);
  assert.match(panel, /View Journey Evidence/);
  assert.match(panel, /journeyCompleted \?|status === "completed"/);
  assert.match(panel, /bg-sky-500/);
  assert.match(panel, /text-navy/);
  console.log("OK  control groups + completed journey Evidence CTA");
}

console.log("\n=== 5. Journey Evidence layout + no logic changes ===");
{
  const client = read("src/components/OwnerJourneyEvidenceClient.tsx");
  assert.match(client, /Historical route map|Recorded route map/);
  assert.match(client, /Download Journey Evidence PDF/);
  assert.match(client, /break-words/);
  assert.match(client, /LiveTrackMap/);
  assert.match(client, /Not recorded/);

  const handlers = read("workers/addresses/src/journey-handlers.ts");
  assert.match(handlers, /handleJourneyEvidenceRequest/);
  assert.match(handlers, /ownerAuthorized/);
  console.log("OK  evidence presentation only; API remains owner-only");
}

console.log("\nAll owner mobile UI checks passed.");
