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
  GOOGLE_ADS_API_VERSION,
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
  assert.equal(DEFAULT_GOOGLE_ADS_PAID_BOOKING_CONVERSION_ACTION_ID, "7734768680");
  assert.equal(GOOGLE_ADS_API_VERSION, "v25");
  assert.notEqual(
    DEFAULT_GOOGLE_ADS_CUSTOMER_ID,
    DEFAULT_GOOGLE_ADS_ID.replace(/^AW-/, ""),
    "customer ID must not be the AW- tag number",
  );
  assert.equal(resolveGoogleAdsCustomerId({}), "4955115517");
  assert.equal(resolvePaidBookingConversionActionId({}), "7734768680");
  assert.equal(
    resolveGoogleAdsCustomerId({ GOOGLE_ADS_CUSTOMER_ID: "495-511-5517" }),
    "4955115517",
  );
  assert.equal(
    resolveGoogleAdsCustomerId({ GOOGLE_ADS_CUSTOMER_ID: "18303631278" }),
    "4955115517",
  );
  assert.equal(
    resolveGoogleAdsCustomerId({ GOOGLE_ADS_CUSTOMER_ID: "10303631278" }),
    "4955115517",
  );
  assert.equal(
    resolvePaidBookingConversionActionId({
      GOOGLE_ADS_PAID_BOOKING_CONVERSION_ACTION_ID: "77347686808",
    }),
    "7734768680",
  );
  assert.equal(
    resolvePaidBookingConversionActionId({
      GOOGLE_ADS_PAID_BOOKING_CONVERSION_ACTION_ID: "7733724411",
    }),
    "7734768680",
  );
  console.log("OK  v25; customer 4955115517; action 7734768680; stale IDs guarded");

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
        GOOGLE_ADS_PAID_BOOKING_CONVERSION_ACTION_ID: "7734768680",
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

  console.log("=== v25 upload endpoint and conversion action resource ===");
  {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url === "https://oauth2.googleapis.com/token") {
        return new Response(JSON.stringify({ access_token: "access" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ results: [{ orderId: "PAY-V25" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;
    try {
      const uploaded = await uploadPaidBookingClickConversion(
        {
          GOOGLE_ADS_DEVELOPER_TOKEN: "dev",
          GOOGLE_ADS_CLIENT_ID: "id",
          GOOGLE_ADS_CLIENT_SECRET: "secret",
          GOOGLE_ADS_REFRESH_TOKEN: "refresh",
          // Deliberately stale values must be remapped.
          GOOGLE_ADS_CUSTOMER_ID: "18303631278",
          GOOGLE_ADS_PAID_BOOKING_CONVERSION_ACTION_ID: "7733724411",
        },
        {
          orderId: "PAY-V25",
          conversionValue: 75,
          attribution: { gclid: "click-v25" },
          conversionTime: new Date("2026-09-01T12:00:00.000Z"),
        },
      );
      assert.equal(uploaded.status, "sent");
      assert.equal(
        calls[1]?.url,
        "https://googleads.googleapis.com/v25/customers/4955115517:uploadClickConversions",
      );
      const body = JSON.parse(String(calls[1]?.init?.body)) as {
        conversions: Array<{ conversionAction: string; orderId: string }>;
      };
      assert.equal(
        body.conversions[0]?.conversionAction,
        "customers/4955115517/conversionActions/7734768680",
      );
      assert.equal(body.conversions[0]?.orderId, "PAY-V25");
    } finally {
      globalThis.fetch = originalFetch;
    }
  }
  console.log("OK  v25 endpoint + corrected account/action resource");

  console.log("=== Offline fallback and browser purchase destination ===");
  const finalize = read("workers/addresses/src/finalize-paid-checkout.ts");
  assert.match(finalize, /maybeUploadPaidBookingAdsConversion/);
  assert.doesNotMatch(finalize, /window\.gtag|gtag\(/);
  const helper = read("workers/addresses/src/paid-booking-ads-conversion.ts");
  assert.match(helper, /googleAdsPaidConversionSentAt/);
  assert.match(helper, /shouldSkipUpload/);
  assert.match(helper, /isRefundTest/);
  assert.match(helper, /isAmendmentTopUp/);
  assert.match(helper, /retryRecentPaidBookingAdsConversions/);
  assert.match(helper, /days:\s*30/);
  assert.match(helper, /limit:\s*50/);
  assert.match(helper, /conversionTime:\s*createdAt/);
  assert.match(helper, /record\.originalAmount/);
  assert.match(helper, /record\.isRefundTest \|\| record\.isAmendmentTestFixture/);
  const workerIndex = read("workers/addresses/src/index.ts");
  assert.match(workerIndex, /retryRecentPaidBookingAdsConversions\(env\)/);
  const browserAds = read("src/lib/google-ads.ts");
  assert.match(browserAds, /DEFAULT_PURCHASE_CONVERSION_LABEL/);
  assert.match(browserAds, /NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_CONVERSION_LABEL/);

  const envExample = read("env.example");
  assert.match(envExample, /GOOGLE_ADS_CUSTOMER_ID=4955115517/);
  assert.match(envExample, /GOOGLE_ADS_PAID_BOOKING_CONVERSION_ACTION_ID=7734768680/);
  assert.match(envExample, /Do NOT use the AW- tag number 18303631278/);
  assert.doesNotMatch(envExample, /GOOGLE_ADS_CUSTOMER_ID=18303631278/);

  const sharedModule = read("shared/google-ads-click-conversions.ts");
  const workerModule = read("workers/addresses/shared/google-ads-click-conversions.ts");
  for (const source of [sharedModule, workerModule, envExample]) {
    assert.match(source, /4955115517/);
  }
  assert.doesNotMatch(
    envExample,
    /GOOGLE_ADS_CUSTOMER_ID\s*=\s*(?:18303631278|10303631278)/,
    "env example must not configure AW-tag digits as the customer id",
  );
  assert.match(sharedModule, /STALE_GOOGLE_ADS_CUSTOMER_IDS/);
  assert.match(workerModule, /STALE_GOOGLE_ADS_CUSTOMER_IDS/);
  assert.match(sharedModule, /GOOGLE_ADS_API_VERSION = "v25"/);
  assert.match(workerModule, /GOOGLE_ADS_API_VERSION = "v25"/);
  assert.match(sharedModule, /DEFAULT_GOOGLE_ADS_PAID_BOOKING_CONVERSION_ACTION_ID = "7734768680"/);
  assert.match(workerModule, /DEFAULT_GOOGLE_ADS_PAID_BOOKING_CONVERSION_ACTION_ID = "7734768680"/);

  const deployWorkflow = read(".github/workflows/deploy-worker.yml");
  for (const secret of [
    "GOOGLE_ADS_DEVELOPER_TOKEN",
    "GOOGLE_ADS_CLIENT_ID",
    "GOOGLE_ADS_CLIENT_SECRET",
    "GOOGLE_ADS_REFRESH_TOKEN",
    "GOOGLE_ADS_LOGIN_CUSTOMER_ID",
  ]) {
    assert.match(deployWorkflow, new RegExp(`secrets\\.${secret}`));
    assert.match(deployWorkflow, new RegExp(`wrangler secret put ${secret}`));
  }
  assert.match(
    deployWorkflow,
    /Google Ads API credentials are incomplete — existing Cloudflare Worker secrets are left unchanged/,
  );
  console.log("OK  browser Paid Booking is live; Worker upload remains a separate fallback");

  console.log("\nAll Paid Booking Ads conversion checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
