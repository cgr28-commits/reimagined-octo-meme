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
  assert.match(switcher, /"availability"/);
  assert.match(switcher, /"pricing"/);
  assert.match(switcher, /Pricing/);
  assert.match(switcher, /"personal-quotes"/);
  assert.match(switcher, /"same-fare"/);
  assert.match(switcher, /Same Fare Test/);
  assert.match(switcher, /role="tablist"/);

  const page = read("src/app/driver/DriverPageClient.tsx");
  assert.match(page, /OwnerDashboardToolSwitcher/);
  assert.match(page, /useState<OwnerDashboardToolTab>\("jobs"\)/);
  assert.match(page, /ownerToolTab === "availability"/);
  assert.match(page, /ownerToolTab === "pricing"/);
  assert.match(page, /tab === "pricing"/);
  assert.match(page, /OwnerPricingPanel/);
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
  assert.equal(
    /isOwnerView && savedKey \? \(\s*<OwnerSmartAvailabilityPanel/.test(page),
    false,
    "Availability tool must not always render",
  );
  assert.doesNotMatch(page, /OwnerFlightStatusPanel/, "no flight panel in layout PR");
  assert.match(page, /SERVICE_FLAGS\.liveDriverTracking && job\.sharingActive/);
  console.log("OK  Jobs default · exclusive tools · no flight panel");
}

console.log("\n=== 2. Jobs screen is status, selected day, and calendar ===");
{
  const page = read("src/app/driver/DriverPageClient.tsx");
  assert.match(page, /OwnerFinancialSummaryPanel/);
  const jobsStart = page.indexOf('id="owner-tool-panel-jobs"');
  const jobsEnd = page.indexOf('id="owner-tool-panel-past"');
  assert.ok(jobsStart > 0 && jobsEnd > jobsStart, "Jobs panel is before Past");
  const jobsSlice = page.slice(jobsStart, jobsEnd);
  assert.match(jobsSlice, /OwnerLiveAvailabilityCard/);
  assert.match(jobsSlice, /mode="day"/);
  assert.match(jobsSlice, /OwnerBookingCalendar/);
  assert.match(jobsSlice, /onSelectDate=/);
  assert.doesNotMatch(jobsSlice, /OwnerFinancialSummaryPanel/);
  assert.doesNotMatch(jobsSlice, /OwnerShortNoticePanel/);
  assert.doesNotMatch(jobsSlice, /OwnerBookingJobsPanel/);
  assert.doesNotMatch(jobsSlice, /Paid jobs coming up/);
  assert.match(page, /mode="past"/);
  assert.match(page, /mode="admin"/);
  assert.match(page, /ownerToolTab === "money"/);
  assert.match(page, /ownerToolTab === "requests"/);
  assert.match(page, /ownerToolTab === "enquiries"/);
  assert.match(page, /ownerToolTab === "tracking"/);

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
    "financial totals stay in Money, not inside the paid bookings panel",
  );

  const todayAt = panel.indexOf("Today’s Upcoming Jobs (");
  const todayCompletedAt = panel.indexOf("Today’s Completed Jobs (");
  const awaitingAt = panel.indexOf("Awaiting Payment (");
  const futureAt = panel.indexOf("Future Jobs (");
  const historyAt = panel.indexOf('<h4 className="text-sm font-bold text-white">Completed Jobs</h4>');
  const refundsAt = panel.indexOf('<h3 className="text-base font-bold text-amber-100">Refunds Pending</h3>');
  const finalizeAt = panel.indexOf("Recover PAID checkouts");
  assert.ok(
    todayAt > 0 &&
      todayCompletedAt > todayAt &&
      awaitingAt > todayCompletedAt &&
      futureAt > awaitingAt &&
      historyAt > futureAt &&
      refundsAt > historyAt &&
      finalizeAt > historyAt,
    "paid panel order: upcoming → today completed → awaiting → future → completed history → refunds",
  );
  assert.match(panel, /const \[todayCompletedOpen, setTodayCompletedOpen\] = useState\(false\)/);
  assert.match(panel, /data-today-completed-toggle/);
  assert.match(panel, /formatOwnerOpsMoney\(todayCompletedEarnedGbp\)\} earned/);
  assert.match(panel, /todayCompletedOpen \? \(/);
  assert.ok(
    panel.indexOf("OwnerShortNoticePanel") < 0,
    "short notice stays out of the paid bookings panel",
  );
  assert.match(panel, /selectJobsForDate/);
  assert.match(panel, /No jobs scheduled for today/);
  console.log("OK  Jobs screen is the day list · admin sections kept off it");
}

console.log("\nAll owner dashboard layout checks passed.");
