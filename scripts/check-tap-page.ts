/**
 * NFC / QR /tap landing + anonymous tip helpers.
 * Run: npx tsx scripts/check-tap-page.ts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyConfirmedSumUpTip,
  parseTipAmountGbp,
  planTipCheckout,
  type JourneyTipRecord,
} from "../shared/journey-tip";
import {
  applyTapEvent,
  applyTapTipPaid,
  averageTipGbp,
  buildTapTipReturnUrl,
  emptyTapMetrics,
  isTapEventName,
  TAP_BOOK_HREF,
  TAP_CONTACT_VCARD_HREF,
  TAP_GOOGLE_REVIEW_URL,
  TAP_PUBLIC_URL,
  TAP_TIP_PRESET_AMOUNTS_GBP,
  TAP_TIP_SOURCE,
  TAP_TIP_TOKEN_STRIP_SCRIPT,
  tapWhatsAppHref,
} from "../shared/tap-page";
import { DEFAULT_GOOGLE_REVIEW_URL } from "../shared/google-business-profile";
import { CONTACT_VCARD_PUBLIC_PATH } from "../shared/business-links";
import { BUSINESS_WHATSAPP_DIGITS } from "../shared/business-email";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

console.log("=== 1. Public URLs and verified contacts ===");
{
  assert.equal(TAP_PUBLIC_URL, "https://www.myairporttaxini.co.uk/tap");
  assert.equal(TAP_GOOGLE_REVIEW_URL, DEFAULT_GOOGLE_REVIEW_URL);
  assert.match(TAP_GOOGLE_REVIEW_URL, /^https:\/\/g\.page\/r\/CbzkRdTv-0hNEBM\/review$/);
  assert.equal(TAP_CONTACT_VCARD_HREF, CONTACT_VCARD_PUBLIC_PATH);
  assert.equal(TAP_BOOK_HREF, "/#quote");
  const wa = tapWhatsAppHref();
  assert.match(wa, new RegExp(`^https://wa\\.me/${BUSINESS_WHATSAPP_DIGITS}\\?text=`));
  assert.match(decodeURIComponent(wa), /Hello My Airport Taxi NI/);
  assert.doesNotMatch(wa, /wa\.me\/belfasttaxi/);
  console.log("OK  review, vCard, book, WhatsApp deep link");
}

console.log("\n=== 2. Tip presets and amount validation ===");
{
  assert.deepEqual([...TAP_TIP_PRESET_AMOUNTS_GBP], [2, 5, 10, 20]);
  for (const amount of TAP_TIP_PRESET_AMOUNTS_GBP) {
    const parsed = parseTipAmountGbp(amount);
    assert.equal(parsed.ok, true);
  }
  assert.equal(parseTipAmountGbp(0).ok, false);
  assert.equal(parseTipAmountGbp(101).ok, false);
  assert.equal(parseTipAmountGbp("7.5").ok, true);
  console.log("OK  £2/£5/£10/£20 + custom bounds reuse journey-tip parser");
}

console.log("\n=== 3. Anonymous tip record stays separate from bookings ===");
{
  const record: JourneyTipRecord = {
    tipToken: "b".repeat(32),
    trackingJobToken: "tap",
    source: TAP_TIP_SOURCE,
    requestedAt: "2026-11-20T12:00:00.000Z",
    status: "requested",
  };
  assert.equal(record.source, "tap");
  assert.equal(planTipCheckout(record, 5), "create");
  const withPending: JourneyTipRecord = {
    ...record,
    pendingCheckoutId: "cs_test_tip",
    pendingAmountGbp: 5,
    pendingCheckoutReference: `tip-${record.tipToken}-1`,
    pendingPaymentUrl: "https://example.test/pay",
  };
  assert.equal(planTipCheckout(withPending, 5, { paid: false, status: "PENDING" }), "reuse");
  assert.equal(planTipCheckout(withPending, 10, { paid: false, status: "PENDING" }), "in_progress");
  const paid = applyConfirmedSumUpTip(
    withPending,
    {
      paid: true,
      checkoutId: "cs_test_tip",
      amount: 5,
      checkoutReference: withPending.pendingCheckoutReference,
    },
    "2026-11-20T12:05:00.000Z",
  );
  assert.equal(paid.paidNow, true);
  assert.equal(paid.record.status, "paid");
  assert.equal(paid.record.amountGbp, 5);
  assert.equal(paid.record.paymentReference, undefined);
  console.log("OK  tap tips never carry a booking payment reference");
}

console.log("\n=== 4. Metrics distinguish clicks from completed tips ===");
{
  let metrics = emptyTapMetrics("2026-11-20T12:00:00.000Z");
  metrics = applyTapEvent(metrics, "visit", "2026-11-20T12:00:01.000Z");
  metrics = applyTapEvent(metrics, "review_click", "2026-11-20T12:00:02.000Z");
  metrics = applyTapEvent(metrics, "tip_open", "2026-11-20T12:00:03.000Z");
  assert.equal(metrics.visits, 1);
  assert.equal(metrics.reviewClicks, 1);
  assert.equal(metrics.tipOpens, 1);
  assert.equal(metrics.tipPaymentsCompleted, 0);
  metrics = applyTapTipPaid(metrics, 10, "2026-11-20T12:01:00.000Z");
  assert.equal(metrics.tipPaymentsCompleted, 1);
  assert.equal(metrics.tipTotalGbp, 10);
  assert.equal(metrics.tipAverageGbp, averageTipGbp(10, 1));
  assert.equal(isTapEventName("visit"), true);
  assert.equal(isTapEventName("paid"), false);
  console.log("OK  clicks ≠ completed payments");
}

console.log("\n=== 5. Return URL + token strip script ===");
{
  const token = "c".repeat(32);
  assert.equal(
    buildTapTipReturnUrl(token),
    `https://www.myairporttaxini.co.uk/tap/?tip=${token}`,
  );
  assert.match(TAP_TIP_TOKEN_STRIP_SCRIPT, /path!=="\/tap"/);
  assert.match(TAP_TIP_TOKEN_STRIP_SCRIPT, /params\.get\("tip"\)/);
  console.log("OK  tip query stripped on /tap before analytics");
}

console.log("\n=== 6. Page + Worker wiring ===");
{
  const page = read("src/app/tap/page.tsx");
  const client = read("src/app/tap/TapPageClient.tsx");
  const layout = read("src/app/layout.tsx");
  const index = read("workers/addresses/src/index.ts");
  const switcher = read("src/components/OwnerDashboardToolSwitcher.tsx");
  const ownerPanel = read("src/components/OwnerTapScanPanel.tsx");
  assert.match(page, /TapPageClient/);
  assert.match(client, /data-tap-page/);
  assert.match(client, /data-tap-action="review"/);
  assert.match(client, /data-tap-action="tip"/);
  assert.match(client, /data-tap-action="contact"/);
  assert.match(client, /data-tap-action="book"/);
  assert.match(client, /data-tap-action="whatsapp"/);
  assert.match(client, /data-tap-tip-confirm/);
  assert.match(client, /TAP_BOOK_HREF/);
  assert.match(layout, /TAP_TIP_TOKEN_STRIP_SCRIPT/);
  assert.match(index, /handleTapPublicRequest/);
  assert.match(index, /\/tap\/tip\/checkout/);
  assert.match(index, /\/owner\/tap-metrics/);
  assert.match(switcher, /tap-scan/);
  assert.match(ownerPanel, /data-owner-tap-scan/);
  assert.match(ownerPanel, /Verified payments only/);
  console.log("OK  page, owner panel, Worker routes present");
}

console.log("\n=== 7. Homepage #quote target (Book Again) ===");
{
  const hero = read("src/components/HeroSlideshow.tsx");
  const hashScroll = read("src/components/SiteHashScroll.tsx");
  const siteNav = read("src/lib/site-nav-scroll.ts");
  assert.match(hero, /id="quote"/);
  assert.match(hashScroll, /scheduleSiteNavHeadingScroll/);
  assert.match(siteNav, /href: "\/#quote"/);
  assert.match(siteNav, /navId: "quote"/);
  console.log("OK  /#quote scrolls to instant quote on homepage (incl. mobile nav path)");
}

console.log("\n=== 8. QR + plate assets ===");
{
  for (const rel of [
    "public/tap/qr.svg",
    "public/tap/qr.png",
    "public/tap/headrest-plate-150x100.svg",
    "public/tap/headrest-plate-150x100-print.svg",
    "docs/tap-nfc.md",
  ]) {
    assert.equal(existsSync(join(root, rel)), true, `missing ${rel}`);
  }
  const qrSvg = read("public/tap/qr.svg");
  assert.match(qrSvg, /<svg/);
  assert.doesNotMatch(qrSvg, /#2FBF4A|#071C38/);
  const nfc = read("docs/tap-nfc.md");
  assert.match(nfc, /https:\/\/www\.myairporttaxini\.co\.uk\/tap/);
  assert.match(nfc, /NTAG213|NTAG215/);
  console.log("OK  QR, print plate, NFC instructions");
}

console.log("\nAll tap page checks passed.");
