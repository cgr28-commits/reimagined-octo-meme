/**
 * Owner Dashboard agreed layout — tool switcher + Jobs section order.
 * No flight/Cirium. Offline only.
 * Run: npx tsx scripts/check-owner-dashboard-layout.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

console.log("\n=== 2. Jobs section order: Financial → Short notice → Calendar → Paid (by day) ===");
{
  const page = read("src/app/driver/DriverPageClient.tsx");
  assert.match(page, /OwnerFinancialSummaryPanel/);
  const financialAt = page.indexOf("<OwnerFinancialSummaryPanel");
  const shortNoticeAt = page.indexOf("<OwnerShortNoticePanel");
  const calendarAt = page.indexOf("<OwnerBookingCalendar");
  const paidAt = page.indexOf("<OwnerPaidBookingsPanel");
  assert.ok(
    financialAt > 0 &&
      shortNoticeAt > financialAt &&
      calendarAt > shortNoticeAt &&
      paidAt > calendarAt,
    "Jobs tab order: Financial → Short notice → Calendar → Paid bookings",
  );

  const panel = read("src/components/OwnerPaidBookingsPanel.tsx");
  assert.match(panel, /Jobs by day/);
  assert.match(panel, /Upcoming jobs/);
  assert.match(panel, /Completed jobs \(/);
  assert.match(panel, /Refunds Pending/);
  assert.match(panel, /refundsPending/);
  assert.match(panel, /groupOwnerScheduleByDay/);
  assert.match(panel, /completedOpenDays/);
  assert.match(panel, /isOwnerOperationalTestBooking/);
  assert.doesNotMatch(panel, /OwnerFlightStatusPanel/);
  assert.doesNotMatch(panel, /Website card payments/i);
  assert.doesNotMatch(panel, /Latest paid booking/);
  assert.doesNotMatch(panel, /Paid Jobs/);
  assert.doesNotMatch(
    panel,
    /OwnerFinancialSummaryPanel/,
    "financial totals live at top of Jobs tab, not buried in paid panel",
  );

  const scheduleAt = panel.indexOf('<h3 className="text-base font-bold text-white">Jobs by day</h3>');
  const refundsAt = panel.indexOf(
    '<h3 className="text-base font-bold text-amber-100">Refunds Pending</h3>',
  );
  assert.ok(
    scheduleAt > 0 && refundsAt > scheduleAt,
    "section order must be Jobs by day → Refunds Pending",
  );
  console.log("OK  financial at top of Jobs · per-day upcoming + collapsed completed → Refunds");
}

console.log("\nAll owner dashboard layout checks passed.");
