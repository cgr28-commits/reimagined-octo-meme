/**
 * Regression checks for server-side Paid Booking Google Ads click conversions.
 * Run: npx tsx scripts/check-paid-booking-ads-conversion.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  formatGoogleAdsConversionDateTime,
  isGoogleAdsClickConversionConfigured,
  pickAdsClickIdentifier,
  uploadPaidBookingClickConversion,
} from "../shared/google-ads-click-conversions";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

async function main() {
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
      GOOGLE_ADS_CUSTOMER_ID: "18303631278",
      GOOGLE_ADS_PAID_BOOKING_CONVERSION_ACTION_ID: "123",
    }),
    true,
  );
  console.log("OK  all Worker secrets required");

  console.log("=== Upload skips without click id / config ===");
  {
    const skipped = await uploadPaidBookingClickConversion(
      {
        GOOGLE_ADS_DEVELOPER_TOKEN: "dev",
        GOOGLE_ADS_CLIENT_ID: "id",
        GOOGLE_ADS_CLIENT_SECRET: "secret",
        GOOGLE_ADS_REFRESH_TOKEN: "refresh",
        GOOGLE_ADS_CUSTOMER_ID: "18303631278",
        GOOGLE_ADS_PAID_BOOKING_CONVERSION_ACTION_ID: "123",
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

  console.log("=== Wire-up and Option A guards ===");
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
  console.log("OK  Worker uploads after PAID; browser Paid Booking send_to disabled");

  console.log("\nAll Paid Booking Ads conversion checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
