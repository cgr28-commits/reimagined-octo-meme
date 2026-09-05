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

console.log("\n=== 2. Jobs section order: Summary → Paid ops → Short notice → Calendar ===");
{
  const page = read("src/app/driver/DriverPageClient.tsx");
  assert.match(page, /OwnerFinancialSummaryPanel/);
  const financialAt = page.indexOf("<OwnerFinancialSummaryPanel");
  const paidAt = page.indexOf("<OwnerPaidBookingsPanel");
  const shortNoticeAt = page.indexOf("<OwnerShortNoticePanel");
  const calendarAt = page.indexOf("<OwnerBookingCalendar");
  const bookingJobsAt = page.indexOf("<OwnerBookingJobsPanel");
  assert.ok(
    financialAt > 0 &&
      paidAt > financialAt &&
      shortNoticeAt > paidAt &&
      calendarAt > shortNoticeAt &&
      bookingJobsAt > calendarAt,
    "Jobs tab order: Summary → Paid ops → Short notice → Calendar → Enquiry jobs",
  );

  const panel = read("src/components/OwnerPaidBookingsPanel.tsx");
  assert.match(panel, /Today’s Upcoming Jobs/);
  assert.match(panel, /Today’s Completed Jobs/);
  assert.match(panel, /Awaiting Payment/);
  assert.match(panel, /Future Jobs/);
  assert.match(panel, /Completed Jobs/);
  assert.match(panel, /Refunds Pending/);
  assert.match(panel, /refundsPending/);
  assert.match(panel, /selectTodayUpcomingLegs/);
  assert.match(panel, /groupFutureJobsByDate/);
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

  const todayAt = panel.indexOf("Today’s Upcoming Jobs (");
  const awaitingAt = panel.indexOf("Awaiting Payment (");
  const futureAt = panel.indexOf("Future Jobs (");
  const historyAt = panel.indexOf('<h4 className="text-sm font-bold text-white">Completed Jobs</h4>');
  const refundsAt = panel.indexOf('<h3 className="text-base font-bold text-amber-100">Refunds Pending</h3>');
  assert.ok(
    todayAt > 0 &&
      awaitingAt > todayAt &&
      futureAt > awaitingAt &&
      historyAt > futureAt &&
      refundsAt > historyAt,
    "paid panel order: today → awaiting → future → completed history → refunds",
  );
  console.log("OK  summary at top · today first · collapsed future/history/awaiting");
}

console.log("\nAll owner dashboard layout checks passed.");
