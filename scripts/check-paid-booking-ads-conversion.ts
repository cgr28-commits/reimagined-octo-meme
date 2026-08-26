/**
 * Regression checks for server-side Paid Booking Google Ads click conversions.
 * Run: npx tsx scripts/check-paid-booking-ads-conversion.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_GOOGLE_ADS_CUSTOMER_ID,
  DEFAULT_GOOGLE_ADS_PAID_BOOKING_CONVERSION_ACTION_ID,
  formatGoogleAdsConversionDateTime,
  isGoogleAdsClickConversionConfigured,
  pickAdsClickIdentifier,
  resolveGoogleAdsCustomerId,
  resolvePaidBookingConversionActionId,
  uploadPaidBookingClickConversion,
} from "../shared/google-ads-click-conversions";
import { DEFAULT_GOOGLE_ADS_ID } from "../src/lib/google-ads";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

async function main() {
  console.log("=== Account vs website tag IDs ===");
  assert.equal(DEFAULT_GOOGLE_ADS_ID, "AW-18303631278");
  assert.equal(DEFAULT_GOOGLE_ADS_CUSTOMER_ID, "4955115517");
  assert.equal(DEFAULT_GOOGLE_ADS_PAID_BOOKING_CONVERSION_ACTION_ID, "7733724411");
  assert.notEqual(
    DEFAULT_GOOGLE_ADS_CUSTOMER_ID,
    DEFAULT_GOOGLE_ADS_ID.replace(/^AW-/, ""),
    "customer ID must not be the AW- tag number",
  );
  assert.equal(resolveGoogleAdsCustomerId({}), "4955115517");
  assert.equal(resolvePaidBookingConversionActionId({}), "7733724411");
  assert.equal(
    resolveGoogleAdsCustomerId({ GOOGLE_ADS_CUSTOMER_ID: "495-511-5517" }),
    "4955115517",
  );
  console.log("OK  tag AW-18303631278 ≠ customer 4955115517; action 7733724411");

  console.log("=== Click id selection ===");
  assert.deepEqual(pickAdsClickIdentifier({ gclid: "abc", wbraid: "wb", gbraid: "gb" }), {
    type: "gclid",
    value: "abc",
  });
  assert.deepEqual(pickAdsClickIdentifier({ wbraid: "wb", gbraid: "gb" }), {
    type: "wbraid",
    value: "wb",
  });
  assert.deepEqual(pickAdsClickIdentifier({ gbraid: "gb" }), {
    type: "gbraid",
    value: "gb",
  });
  assert.equal(pickAdsClickIdentifier({ utm_source: "google" }), null);
  console.log("OK  gclid > wbraid > gbraid; UTMs alone are not enough");

  console.log("=== Conversion datetime format ===");
  const formatted = formatGoogleAdsConversionDateTime(new Date("2026-01-15T12:00:00.000Z"));
  assert.match(formatted, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  console.log("OK ", formatted);

  console.log("=== Config gate ===");
  assert.equal(isGoogleAdsClickConversionConfigured({}), false);
  assert.equal(
    isGoogleAdsClickConversionConfigured({
      GOOGLE_ADS_DEVELOPER_TOKEN: "dev",
      GOOGLE_ADS_CLIENT_ID: "id",
      GOOGLE_ADS_CLIENT_SECRET: "secret",
      GOOGLE_ADS_REFRESH_TOKEN: "refresh",
    }),
    true,
    "OAuth secrets alone are enough; customer/action IDs have code defaults",
  );
  console.log("OK  Worker OAuth secrets required; customer/action IDs defaulted");

  console.log("=== Upload skips without click id / config ===");
  {
    const skipped = await uploadPaidBookingClickConversion(
      {
        GOOGLE_ADS_DEVELOPER_TOKEN: "dev",
        GOOGLE_ADS_CLIENT_ID: "id",
        GOOGLE_ADS_CLIENT_SECRET: "secret",
        GOOGLE_ADS_REFRESH_TOKEN: "refresh",
        GOOGLE_ADS_CUSTOMER_ID: "4955115517",
        GOOGLE_ADS_PAID_BOOKING_CONVERSION_ACTION_ID: "7733724411",
      },
      {
        orderId: "PAY-1",
        conversionValue: 50,
        attribution: { utm_source: "google" },
      },
    );
    assert.equal(skipped.status, "skipped_no_click_id");
  }
  {
    const skipped = await uploadPaidBookingClickConversion(
      {},
      { orderId: "PAY-1", conversionValue: 50, attribution: { gclid: "x" } },
    );
    assert.equal(skipped.status, "skipped_not_configured");
  }
  console.log("OK  upload refuses missing click id or secrets");

  console.log("=== Wire-up, Option A, and no tag-as-customer docs ===");
  const finalize = read("workers/addresses/src/finalize-paid-checkout.ts");
  assert.match(finalize, /maybeUploadPaidBookingAdsConversion/);
  assert.doesNotMatch(finalize, /window\.gtag|gtag\(/);
  const helper = read("workers/addresses/src/paid-booking-ads-conversion.ts");
  assert.match(helper, /googleAdsPaidConversionSentAt/);
  assert.match(helper, /shouldSkipUpload/);
  assert.match(helper, /isRefundTest/);
  assert.match(helper, /isAmendmentTopUp/);
  const browserAds = read("src/lib/google-ads.ts");
  assert.match(browserAds, /const purchaseConversionLabel = "";/);
  assert.match(browserAds, /Option A/);
  assert.doesNotMatch(
    browserAds,
    /purchaseConversionLabel =\s*\n?\s*env\("NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_CONVERSION_LABEL"\)/,
  );

  const envExample = read("env.example");
  assert.match(envExample, /GOOGLE_ADS_CUSTOMER_ID=4955115517/);
  assert.match(envExample, /GOOGLE_ADS_PAID_BOOKING_CONVERSION_ACTION_ID=7733724411/);
  assert.match(envExample, /Do NOT use the AW- tag number 18303631278/);
  assert.doesNotMatch(envExample, /GOOGLE_ADS_CUSTOMER_ID=18303631278/);

  const sharedModule = read("shared/google-ads-click-conversions.ts");
  const workerModule = read("workers/addresses/shared/google-ads-click-conversions.ts");
  for (const source of [sharedModule, workerModule, envExample]) {
    assert.doesNotMatch(
      source,
      /GOOGLE_ADS_CUSTOMER_ID[^\n]{0,40}18303631278/,
      "must not set/document AW-tag digits as GOOGLE_ADS_CUSTOMER_ID",
    );
    assert.match(source, /4955115517/);
  }
  assert.match(sharedModule, /7733724411/);
  assert.match(workerModule, /7733724411/);
  console.log("OK  Worker uploads after PAID; browser send_to off; IDs corrected");

  console.log("\nAll Paid Booking Ads conversion checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
