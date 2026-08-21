/**
 * Owner Dashboard agreed layout — tool switcher + Jobs section order.
 * No flight/Cirium. Offline only.
 * Run: npx tsx scripts/check-owner-dashboard-layout.ts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

console.log("=== 1. Top tool switcher ===");
{
  const switcher = read("src/components/OwnerDashboardToolSwitcher.tsx");
  assert.match(switcher, /"jobs"/);
  assert.match(switcher, /"personal-quotes"/);
  assert.match(switcher, /"same-fare"/);
  assert.match(switcher, /Same Fare Test/);
  assert.match(switcher, /role="tablist"/);

  const page = read("src/app/driver/DriverPageClient.tsx");
  assert.match(page, /OwnerDashboardToolSwitcher/);
  assert.match(page, /useState<OwnerDashboardToolTab>\("jobs"\)/);
  assert.match(page, /ownerToolTab === "personal-quotes"/);
  assert.match(page, /ownerToolTab === "same-fare"/);
  assert.match(page, /ownerToolTab === "jobs"/);
  assert.equal(
    /isOwnerView && savedKey \? \(\s*<OwnerPersonalQuotesPanel/.test(page),
    false,
    "Personal Quotes must not always render",
  );
  assert.equal(
    /isOwnerView && savedKey \? \(\s*<OwnerAmendmentTestPanel/.test(page),
    false,
    "Same Fare Test must not always render",
  );
  assert.doesNotMatch(page, /OwnerFlightStatusPanel/, "no flight panel in layout PR");
  assert.match(page, /SERVICE_FLAGS\.liveDriverTracking && job\.sharingActive/);
  console.log("OK  Jobs default · exclusive tools · no flight panel");
}

console.log("\n=== 2. Jobs section order: Upcoming → Refunds Pending → Completed ===");
{
  const panel = read("src/components/OwnerPaidBookingsPanel.tsx");
  assert.match(panel, /Upcoming Jobs/);
  assert.match(panel, /Refunds Pending/);
  assert.match(panel, /Completed Jobs/);
  assert.match(panel, /refundsPending/);
  assert.match(panel, /groupCompletedBookingsByDay/);
  assert.match(panel, /isOwnerOperationalTestBooking/);
  assert.doesNotMatch(panel, /OwnerFlightStatusPanel/);

  const upcomingAt = panel.indexOf("<h3 className=\"text-base font-bold text-white\">Upcoming Jobs</h3>");
  const refundsAt = panel.indexOf(
    "<h3 className=\"text-base font-bold text-amber-100\">Refunds Pending</h3>",
  );
  const completedAt = panel.indexOf(
    "<h3 className=\"text-base font-bold text-white\">Completed Jobs</h3>",
  );
  assert.ok(
    upcomingAt > 0 && refundsAt > upcomingAt && completedAt > refundsAt,
    "section order must be Upcoming → Refunds Pending → Completed",
  );
  console.log("OK  section order + test exclusion + no flight UI");
}

console.log("\n=== 3. Preview /owner/ routing (Vercel SSO root fix) ===");
{
  const nextConfig = read("next.config.ts");
  assert.match(nextConfig, /owner-dashboard-layout-refunds/);
  assert.match(nextConfig, /destination:\s*"\/owner\/"/);
  assert.match(nextConfig, /VERCEL_ENV/);
  assert.match(nextConfig, /isGithubPages \|\| !isOwnerLayoutRefundsPreview/);
  assert.ok(
    existsSync(join(root, "src/app/owner/page.tsx")),
    "/owner/ page must exist",
  );
  const ownerPage = read("src/app/owner/page.tsx");
  assert.match(ownerPage, /portal="owner"/);
  assert.match(ownerPage, /DriverPageClient/);
  console.log("OK  preview root → /owner/ · owner page renders portal=owner");
}

console.log("\nAll owner dashboard layout checks passed.");

