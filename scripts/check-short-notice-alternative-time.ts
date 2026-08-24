/**
 * Regression: Offer alternative time workflow for short-notice bookings.
 * Run: npx tsx scripts/check-short-notice-alternative-time.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildShortNoticeAlternativeOfferEmail } from "../shared/short-notice-alternative-email";
import {
  SHORT_NOTICE_STATUSES,
  isShortNoticeActiveOnDashboard,
  isShortNoticeArchivedRecord,
  isShortNoticeOpenStatus,
  isShortNoticePayable,
  sanitizeCustomerResponseNote,
} from "../shared/short-notice-booking";
import { materialJourneyFingerprint } from "../shared/booking-notice";
import {
  buildShortNoticeAcceptUrl,
  buildShortNoticePayUrl,
  isAllowedShortNoticeSiteOrigin,
  resolveShortNoticeSiteOrigin,
  shouldAutoSendPaymentLinkEmail,
} from "../workers/addresses/src/short-notice-handlers";
import { calculateQuote } from "../src/lib/quote";
import { SALOON_VEHICLE } from "../src/lib/vehicle-selection";

const root = path.resolve(import.meta.dirname, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function check(label: string, fn: () => void) {
  try {
    fn();
    console.log(`OK  ${label}`);
  } catch (error) {
    console.error(`FAIL  ${label}`);
    throw error;
  }
}

check("Status model includes ALTERNATIVE_OFFERED / DECLINED and open-list rules", () => {
  assert.ok(SHORT_NOTICE_STATUSES.includes("SHORT_NOTICE_ALTERNATIVE_OFFERED"));
  assert.ok(SHORT_NOTICE_STATUSES.includes("SHORT_NOTICE_ALTERNATIVE_DECLINED"));
  assert.equal(isShortNoticeOpenStatus("SHORT_NOTICE_ALTERNATIVE_OFFERED"), true);
  assert.equal(isShortNoticeOpenStatus("SHORT_NOTICE_AWAITING_APPROVAL"), true);
  assert.equal(isShortNoticeOpenStatus("SHORT_NOTICE_APPROVED"), true);
  assert.equal(isShortNoticeOpenStatus("SHORT_NOTICE_DECLINED"), false);
  assert.equal(isShortNoticeOpenStatus("SHORT_NOTICE_ALTERNATIVE_DECLINED"), false);
});

check("Soft-remove / archive helpers keep records without hard delete", () => {
  const base = {
    reference: "MATNI-SN-1",
    paymentToken: "pay",
    status: "SHORT_NOTICE_APPROVED" as const,
    amount: 45,
    currency: "GBP",
    amountLabel: "£45.00",
    booking: {} as never,
    materialFingerprint: "x",
    createdAt: "2026-08-24T00:00:00.000Z",
    updatedAt: "2026-08-24T00:00:00.000Z",
  };
  assert.equal(isShortNoticeActiveOnDashboard(base), true);
  assert.equal(
    isShortNoticeActiveOnDashboard({
      ...base,
      removedFromDashboardAt: "2026-08-24T01:00:00.000Z",
    }),
    false,
  );
  assert.equal(
    isShortNoticeArchivedRecord({
      ...base,
      removedFromDashboardAt: "2026-08-24T01:00:00.000Z",
    }),
    true,
  );
  assert.equal(
    isShortNoticeArchivedRecord({
      ...base,
      status: "SHORT_NOTICE_ALTERNATIVE_DECLINED",
    }),
    true,
  );
  assert.equal(isShortNoticeArchivedRecord(base), false);
});

check("Alternative offer email: Accept & pay + Decline CTAs, no GET mutation", () => {
  const email = buildShortNoticeAlternativeOfferEmail({
    customerName: "Jill Example",
    customerEmail: "jill@example.com",
    pickupLabel: "Belfast City Hall",
    dropoffLabel: "BFS",
    originalDate: "2026-08-21",
    originalTime: "14:00",
    offeredDate: "2026-08-22",
    offeredTime: "15:00",
    amountLabel: "£55.00",
    reference: "MATNI-SN-TEST",
    acceptUrl:
      "https://www.myairporttaxini.co.uk/accept-alternative-time/?token=abc123",
    ownerNote: "We can do 3pm",
  });
  assert.match(email.subject, /Alternative pickup time for your My Airport Taxi NI journey/);
  assert.match(email.text, /Hi Jill,/);
  assert.match(email.text, /2026-08-21 14:00/);
  assert.match(email.text, /2026-08-22 15:00/);
  assert.match(email.text, /Price: £55\.00/);
  assert.match(email.text, /Accept new pickup time & pay/);
  assert.match(email.text, /Decline new pickup time/);
  assert.match(email.text, /No payment will be taken unless you accept/);
  assert.match(email.html, /Accept new pickup time &amp; pay/);
  assert.match(email.html, /Decline new pickup time/);
  assert.match(email.html, /accept-alternative-time\/\?token=abc123/);
  assert.match(email.html, /We can do 3pm/);
});

check("Customer note sanitizer strips tags and never requires a note", () => {
  assert.equal(sanitizeCustomerResponseNote(""), "");
  assert.equal(sanitizeCustomerResponseNote(null), "");
  assert.equal(sanitizeCustomerResponseNote("<b>Hello</b> world"), "Hello world");
  assert.equal(sanitizeCustomerResponseNote("  after 10:30am  "), "after 10:30am");
  assert.equal(sanitizeCustomerResponseNote("x".repeat(600)).length, 500);
});

check("Offered alternative is not payable until accepted/approved", () => {
  const now = Date.now();
  const offered = {
    reference: "MATNI-SN-ALT",
    paymentToken: "pay",
    acceptToken: "accept",
    status: "SHORT_NOTICE_ALTERNATIVE_OFFERED" as const,
    amount: 55,
    currency: "GBP",
    amountLabel: "£55.00",
    booking: {
      customerName: "Jill",
      customerEmail: "jill@example.com",
      tripDate: "2026-08-21",
      tripTime: "14:00",
    } as never,
    materialFingerprint: "x",
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    offeredDate: "2026-08-22",
    offeredTime: "15:00",
    paymentExpiresAt: new Date(now + 3_600_000).toISOString(),
  };
  assert.equal(isShortNoticePayable(offered), false);
  assert.equal(
    shouldAutoSendPaymentLinkEmail(
      offered,
      buildShortNoticePayUrl("https://www.myairporttaxini.co.uk", "pay"),
    ),
    false,
  );
});

check("Friday → Saturday alternative keeps the same quoted fare", () => {
  const cityHall = "Belfast City Hall, Belfast BT1 5GS";
  const friday = calculateQuote(cityHall, "BFS", SALOON_VEHICLE, false, {
    outboundDate: "2026-08-21",
    outboundTime: "14:00",
  });
  const saturday = calculateQuote(cityHall, "BFS", SALOON_VEHICLE, false, {
    outboundDate: "2026-08-22",
    outboundTime: "15:00",
  });
  assert.ok(friday && saturday);
  assert.equal(saturday!.amount, friday!.amount);
  assert.equal(friday!.premiumApplied, false);
  assert.equal(saturday!.premiumApplied, false);

  const amount = friday!.amount;
  const before = materialJourneyFingerprint({
    pickupLabel: cityHall,
    dropoffLabel: "BFS",
    tripDate: "2026-08-21",
    tripTime: "14:00",
    vehicle: SALOON_VEHICLE,
    amount,
  });
  const after = materialJourneyFingerprint({
    pickupLabel: cityHall,
    dropoffLabel: "BFS",
    tripDate: "2026-08-22",
    tripTime: "15:00",
    vehicle: SALOON_VEHICLE,
    amount,
  });
  assert.notEqual(before, after);
});

check("Worker + UI wiring for offer / accept / decline / collapse", () => {
  const handlers = read("workers/addresses/src/short-notice-handlers.ts");
  const index = read("workers/addresses/src/index.ts");
  const panel = read("src/components/OwnerShortNoticePanel.tsx");
  const api = read("src/lib/short-notice-api.ts");
  const acceptPage = read("src/app/accept-alternative-time/AcceptAlternativeTimeClient.tsx");
  const store = read("workers/addresses/src/short-notice-store.ts");

  assert.match(handlers, /handleOwnerOfferAlternativeTime/);
  assert.match(handlers, /handlePublicAcceptAlternativeTime/);
  assert.match(handlers, /handlePublicDeclineAlternativeTime/);
  assert.match(handlers, /handleOwnerWithdrawAlternativeOffer/);
  assert.match(handlers, /handleOwnerResendAlternativeEmail/);
  assert.match(handlers, /handleOwnerRemoveFromDashboard/);
  assert.match(handlers, /handleOwnerRestoreToDashboard/);
  assert.match(handlers, /handleOwnerListArchivedShortNotice/);
  assert.match(handlers, /buildShortNoticeAcceptUrl/);
  assert.match(handlers, /acceptedAlternativeAt/);
  assert.match(handlers, /SHORT_NOTICE_ALTERNATIVE_DECLINED/);
  assert.match(handlers, /sanitizeCustomerResponseNote/);
  assert.match(handlers, /customerResponseNote/);
  assert.match(handlers, /removedFromDashboardAt/);
  const offerFn = handlers.slice(
    handlers.indexOf("export async function handleOwnerOfferAlternativeTime"),
    handlers.indexOf("export async function handleOwnerResendAlternativeEmail"),
  );
  assert.doesNotMatch(offerFn, /createCheckout|SUMUP_API|payments\/checkout/i);
  assert.match(offerFn, /sendAlternativeOfferEmail/);
  const declineFn = handlers.slice(
    handlers.indexOf("export async function handlePublicDeclineAlternativeTime"),
    handlers.indexOf("export function publicAlternativeOfferSummary"),
  );
  assert.doesNotMatch(declineFn, /createCheckout|SUMUP_API|sendPaymentLinkEmail/i);
  assert.doesNotMatch(
    handlers.slice(
      handlers.indexOf("export async function handleOwnerRemoveFromDashboard"),
      handlers.indexOf("export async function handleOwnerRestoreToDashboard"),
    ),
    /createCheckout|SUMUP_API|trySendBrandedCustomerEmail|refund/i,
  );
  assert.match(index, /offer-alternative/);
  assert.match(index, /accept-alternative/);
  assert.match(index, /decline-alternative/);
  assert.match(index, /withdraw-alternative/);
  assert.match(index, /resend-alternative-email/);
  assert.match(index, /remove-from-dashboard/);
  assert.match(index, /restore-to-dashboard/);
  assert.match(index, /short-notice\/archived/);
  assert.match(panel, /Approve requested time/);
  assert.match(panel, /Offer alternative time/);
  assert.match(panel, /Decline — no availability/);
  assert.match(panel, /Resend alternative-time email/);
  assert.match(panel, /Change offered time/);
  assert.match(panel, /Withdraw offer/);
  assert.match(panel, /AWAITING OWNER APPROVAL|AWAITING CUSTOMER RESPONSE/);
  assert.match(panel, /APPROVED — AWAITING PAYMENT/);
  assert.match(panel, /View \/ Manage ▼/);
  assert.match(panel, /View \/ Manage ▲/);
  assert.match(panel, /data-owner-sn-card="collapsed"/);
  assert.match(panel, /expandedRefs/);
  assert.doesNotMatch(panel, /▼ View booking/);
  // Collapsed cards must not render the secure pay URL (only expanded branch does).
  const collapsedIdx = panel.indexOf('data-owner-sn-card="collapsed"');
  const expandedMarker = panel.indexOf('data-owner-sn-card="expanded-toggle"');
  assert.ok(collapsedIdx > 0 && expandedMarker > collapsedIdx);
  const collapsedSlice = panel.slice(collapsedIdx, expandedMarker);
  assert.doesNotMatch(collapsedSlice, /Secure payment link|Copy pay link|break-all text-xs/);
  assert.match(panel, /Customer message/);
  assert.match(panel, /Remove from dashboard/);
  assert.match(panel, /Yes — remove/);
  assert.match(panel, /Archived \/ Removed bookings/);
  assert.match(panel, /Restore to dashboard/);
  // Archived fetch failure must not blank active short-notice list.
  assert.match(panel, /fetchArchivedShortNoticeBookings/);
  assert.match(panel, /setArchived\(\[\]\)/);
  assert.match(api, /offerAlternativeShortNoticeTime/);
  assert.match(api, /acceptAlternativeShortNoticeTime/);
  assert.match(api, /declineAlternativeShortNoticeTime/);
  assert.match(api, /customerNote/);
  assert.match(api, /removeShortNoticeFromDashboard/);
  assert.match(api, /restoreShortNoticeToDashboard/);
  assert.match(api, /fetchArchivedShortNoticeBookings/);
  assert.match(acceptPage, /Accept new pickup time & pay/);
  assert.match(acceptPage, /Decline new pickup time/);
  assert.match(acceptPage, /Message for your driver \(optional\)/);
  assert.match(acceptPage, /Thanks for letting us know/);
  assert.match(acceptPage, /Request another journey\/time/);
  assert.match(acceptPage, /window\.location\.assign/);
  assert.match(acceptPage, /already been paid and confirmed/);
  assert.doesNotMatch(acceptPage, /useEffect\(\(\) => \{\s*void handleAccept/);
  assert.match(store, /getShortNoticeByAcceptToken/);
  assert.match(store, /listArchivedShortNoticeBookings/);
  assert.match(store, /isShortNoticeActiveOnDashboard|shortNoticeArchivedIndexKey/);
});

check("Accept URL helper points at accept-alternative-time page", () => {
  assert.equal(
    buildShortNoticeAcceptUrl("https://www.myairporttaxini.co.uk", "tok"),
    "https://www.myairporttaxini.co.uk/accept-alternative-time/?token=tok",
  );
});

check("Site origin resolver prefers preview Origin over production fallback", () => {
  assert.equal(
    isAllowedShortNoticeSiteOrigin(
      "https://my-airport-taxi-ni-quote-git-cursor-no-weekend-b-cc80fd-colin15.vercel.app",
    ),
    true,
  );
  assert.equal(isAllowedShortNoticeSiteOrigin("https://evil.example.com"), false);
  const preview =
    "https://my-airport-taxi-ni-quote-git-cursor-no-weekend-b-cc80fd-colin15.vercel.app";
  const req = new Request("https://worker.example/owner/short-notice/offer-alternative", {
    method: "POST",
    headers: { Origin: preview },
  });
  assert.equal(
    resolveShortNoticeSiteOrigin(req, {}, "https://www.myairporttaxini.co.uk"),
    preview,
  );
  assert.equal(
    resolveShortNoticeSiteOrigin(
      new Request("https://worker.example/x", { method: "POST" }),
      { siteOrigin: preview },
      "https://www.myairporttaxini.co.uk",
    ),
    preview,
  );
});

check("Client sends siteOrigin so emailed accept links hit the live preview", () => {
  const api = read("src/lib/short-notice-api.ts");
  assert.match(api, /function currentSiteOrigin/);
  assert.match(api, /siteOrigin: currentSiteOrigin\(\)/);
  assert.match(api, /offerAlternativeShortNoticeTime/);
  assert.match(api, /acceptAlternativeShortNoticeTime/);
  assert.match(api, /declineAlternativeShortNoticeTime/);
});

check("Shared alternative email synced into Worker", () => {
  assert.equal(
    fs.existsSync(path.join(root, "workers/addresses/shared/short-notice-alternative-email.ts")),
    true,
  );
  const booking = read("workers/addresses/shared/short-notice-booking.ts");
  assert.match(booking, /SHORT_NOTICE_ALTERNATIVE_OFFERED/);
  assert.match(booking, /SHORT_NOTICE_ALTERNATIVE_DECLINED/);
  assert.match(booking, /acceptToken/);
  assert.match(booking, /originalRequestedDate/);
  assert.match(booking, /customerResponseNote/);
  assert.match(booking, /sanitizeCustomerResponseNote/);
});

console.log("\nAll short-notice alternative-time checks passed.");
