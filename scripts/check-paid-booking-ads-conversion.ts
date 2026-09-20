/**
 * Regression checks for server-side Paid Booking conversions.
 * Run: npx tsx scripts/check-paid-booking-ads-conversion.ts
 *
 * Uses mocked HTTP only. Does not charge a card or upload production conversions.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_GOOGLE_ADS_CUSTOMER_ID,
  DEFAULT_GOOGLE_ADS_PAID_BOOKING_CONVERSION_ACTION_ID,
  DATA_MANAGER_EVENTS_INGEST_URL,
  GOOGLE_ADS_API_VERSION,
  adsApiUploadHasMatchingResult,
  classifyPaidBookingAdsRecovery,
  extractGoogleAdsPartialFailureMessage,
  formatGoogleAdsConversionDateTime,
  isAdsApiOfflineUploadRestricted,
  isGoogleAdsClickConversionConfigured,
  isRetryableGoogleAdsHttpStatus,
  pickAdsClickIdentifier,
  resolveGoogleAdsCustomerId,
  resolvePaidBookingConversionActionId,
  summarizePaidBookingAdsRecovery,
  uploadPaidBookingClickConversion,
} from "../shared/google-ads-click-conversions";
import { shouldSkipPaidBookingAdsUpload } from "../workers/addresses/src/paid-booking-ads-conversion";
import { DEFAULT_GOOGLE_ADS_ID } from "../src/lib/google-ads";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const configuredEnv = {
  GOOGLE_ADS_CLIENT_ID: "id",
  GOOGLE_ADS_CLIENT_SECRET: "secret",
  GOOGLE_ADS_REFRESH_TOKEN: "refresh",
  GOOGLE_ADS_CUSTOMER_ID: "4955115517",
  GOOGLE_ADS_PAID_BOOKING_CONVERSION_ACTION_ID: "7734768680",
};

type FetchCall = { url: string; init?: RequestInit };

function mockFetch(handler: (url: string, init?: RequestInit) => Response): {
  calls: FetchCall[];
  restore: () => void;
} {
  const originalFetch = globalThis.fetch;
  const calls: FetchCall[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    return handler(url, init);
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
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
    resolvePaidBookingConversionActionId({
      GOOGLE_ADS_PAID_BOOKING_CONVERSION_ACTION_ID: "77347686808",
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
      GOOGLE_ADS_CLIENT_ID: "id",
      GOOGLE_ADS_CLIENT_SECRET: "secret",
      GOOGLE_ADS_REFRESH_TOKEN: "refresh",
    }),
    true,
    "OAuth client/secret/refresh are enough; developer token is optional",
  );
  assert.equal(
    isGoogleAdsClickConversionConfigured({
      GOOGLE_ADS_DEVELOPER_TOKEN: "dev",
      GOOGLE_ADS_CLIENT_ID: "id",
    }),
    false,
  );
  console.log("OK  Worker OAuth secrets required; developer token optional");

  console.log("=== Missing attribution / denied consent ===");
  {
    const skipped = await uploadPaidBookingClickConversion(configuredEnv, {
      orderId: "PAY-1",
      conversionValue: 50,
      attribution: { utm_source: "google" },
    });
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

  console.log("=== Successful verified payment via Data Manager ===");
  {
    const { calls, restore } = mockFetch((url) => {
      if (url === "https://oauth2.googleapis.com/token") {
        return jsonResponse({ access_token: "access" });
      }
      return jsonResponse({ requestId: "req-paid-1" });
    });
    try {
      const uploaded = await uploadPaidBookingClickConversion(configuredEnv, {
        orderId: "SUMUP-TXN-1",
        conversionValue: 88,
        currencyCode: "GBP",
        attribution: { gclid: "click-1" },
        conversionTime: new Date("2026-09-01T12:00:00.000Z"),
      });
      assert.equal(uploaded.status, "accepted");
      assert.equal(uploaded.channel, "data_manager");
      assert.equal(uploaded.requestId, "req-paid-1");
      assert.equal(calls[1]?.url, DATA_MANAGER_EVENTS_INGEST_URL);
      const body = JSON.parse(String(calls[1]?.init?.body)) as {
        destinations: Array<{
          operatingAccount: { accountId: string };
          productDestinationId: string;
        }>;
        events: Array<{
          transactionId: string;
          currency: string;
          conversionValue: number;
          eventSource: string;
          adIdentifiers: { gclid?: string };
          eventTimestamp: string;
        }>;
      };
      assert.equal(body.destinations[0]?.operatingAccount.accountId, "4955115517");
      assert.equal(body.destinations[0]?.productDestinationId, "7734768680");
      assert.equal(body.events[0]?.transactionId, "SUMUP-TXN-1");
      assert.equal(body.events[0]?.currency, "GBP");
      assert.equal(body.events[0]?.conversionValue, 88);
      assert.equal(body.events[0]?.eventSource, "WEB");
      assert.equal(body.events[0]?.adIdentifiers.gclid, "click-1");
      assert.equal(body.events[0]?.eventTimestamp, "2026-09-01T12:00:00.000Z");
      assert.equal(
        calls.some((call) => call.url.includes("uploadClickConversions")),
        false,
        "successful Data Manager ingest must not also hit Ads API",
      );
    } finally {
      restore();
    }
  }
  console.log("OK  Data Manager ingest uses paid amount, GBP, payment timestamp, transaction id");

  console.log("=== Failed / pending payment never uploads ===");
  const finalize = read("workers/addresses/src/finalize-paid-checkout.ts");
  assert.match(finalize, /if \(!isSumUpCheckoutPaid\(checkout\)\)/);
  assert.match(finalize, /Payment has not been completed yet/);
  const firstTimeUploadIndex = finalize.lastIndexOf(
    "await maybeUploadPaidBookingAdsConversion({",
  );
  const unpaidReturnIndex = finalize.indexOf('error: "Payment has not been completed yet"');
  assert.ok(unpaidReturnIndex > 0 && firstTimeUploadIndex > unpaidReturnIndex);
  console.log("OK  finalize returns before Ads upload when SumUp is not PAID");

  console.log("=== Customer does not return from SumUp ===");
  const workerIndex = read("workers/addresses/src/index.ts");
  const recover = read("workers/addresses/src/recover-paid-checkouts.ts");
  assert.match(workerIndex, /handlePaymentWebhookRequest/);
  assert.match(workerIndex, /finalizePaidCheckout/);
  assert.match(workerIndex, /recoverPaidButUnfinalizedCheckouts/);
  assert.match(recover, /resolveBookingForCheckout/);
  assert.match(recover, /finalizePaidCheckout/);
  assert.match(finalize, /pending\.booking\?\.attribution \?\? booking\.attribution/);
  assert.match(finalize, /resolvedAttribution/);
  console.log("OK  webhook + recovery cron finalize without the browser return");

  console.log("=== Return booking paid in one transaction ===");
  assert.match(finalize, /orderId: paymentReference|paymentReference,/);
  const helper = read("workers/addresses/src/paid-booking-ads-conversion.ts");
  assert.match(helper, /orderId: paymentReference/);
  assert.match(helper, /isAmendmentTopUp/);
  assert.match(helper, /isRefundTest/);
  console.log("OK  one paymentReference is one conversion; amendments/refund tests skipped");

  console.log("=== Duplicate webhook / retry is terminal after accept ===");
  const firstRecord = {
    paymentReference: "SUMUP-TXN-1",
    googleAdsPaidConversionStatus: "accepted" as const,
    googleAdsPaidConversionSentAt: "2026-09-01T12:00:01.000Z",
    attribution: { gclid: "click-1" },
  };
  assert.equal(shouldSkipPaidBookingAdsUpload(firstRecord as never), true);
  assert.equal(
    shouldSkipPaidBookingAdsUpload({
      googleAdsPaidConversionStatus: "skipped_no_click_id",
      attribution: { utm_source: "google" },
    } as never),
    true,
  );
  assert.equal(
    shouldSkipPaidBookingAdsUpload(
      {
        googleAdsPaidConversionStatus: "skipped_no_click_id",
        attribution: { utm_source: "google" },
      } as never,
      { gclid: "later-click" },
    ),
    false,
    "later genuine click id must be allowed to retry",
  );
  console.log("OK  accepted/sent/duplicate skip; skipped_no_click_id can retry if a click id appears");

  console.log("=== Google Ads partial failure is not a success ===");
  assert.equal(
    extractGoogleAdsPartialFailureMessage({
      details: [
        {
          errors: [
            {
              errorCode: { conversionUploadError: "NO_CONVERSION_ACTION_FOUND" },
              message: "The conversion action is not enabled",
            },
          ],
        },
      ],
    }),
    "NO_CONVERSION_ACTION_FOUND: The conversion action is not enabled",
  );
  assert.equal(
    adsApiUploadHasMatchingResult([], "PAY-1"),
    false,
  );
  assert.equal(
    adsApiUploadHasMatchingResult([{ orderId: "PAY-1" }], "PAY-1"),
    true,
  );
  {
    const { restore } = mockFetch((url) => {
      if (url === "https://oauth2.googleapis.com/token") {
        return jsonResponse({ access_token: "access" });
      }
      if (url === DATA_MANAGER_EVENTS_INGEST_URL) {
        return jsonResponse(
          {
            error: {
              status: "PERMISSION_DENIED",
              message: "Request had insufficient authentication scopes.",
            },
          },
          403,
        );
      }
      return jsonResponse({
        partialFailureError: {
          details: [
            {
              errors: [
                {
                  errorCode: { conversionUploadError: "INVALID_CONVERSION_ACTION_TYPE" },
                  message: "Conversion action type is not UPLOAD_CLICKS",
                },
              ],
            },
          ],
        },
        results: [{}],
      });
    });
    try {
      const failed = await uploadPaidBookingClickConversion(configuredEnv, {
        orderId: "PAY-PARTIAL",
        conversionValue: 40,
        attribution: { gclid: "click-partial" },
      });
      assert.equal(failed.status, "failed");
      assert.equal(failed.channel, "ads_api");
      assert.match(String(failed.error), /INVALID_CONVERSION_ACTION_TYPE|UPLOAD_CLICKS/);
    } finally {
      restore();
    }
  }
  {
    const { calls, restore } = mockFetch((url) => {
      if (url === "https://oauth2.googleapis.com/token") {
        return jsonResponse({ access_token: "access" });
      }
      if (url === DATA_MANAGER_EVENTS_INGEST_URL) {
        return jsonResponse(
          { error: { message: "Request had insufficient authentication scopes." } },
          403,
        );
      }
      return jsonResponse({ results: [] });
    });
    try {
      const failed = await uploadPaidBookingClickConversion(
        {
          ...configuredEnv,
          GOOGLE_ADS_CUSTOMER_ID: "18303631278",
          GOOGLE_ADS_PAID_BOOKING_CONVERSION_ACTION_ID: "7733724411",
          GOOGLE_ADS_DEVELOPER_TOKEN: "dev",
        },
        {
          orderId: "PAY-EMPTY",
          conversionValue: 75,
          attribution: { gclid: "click-empty" },
          conversionTime: new Date("2026-09-01T12:00:00.000Z"),
        },
      );
      assert.equal(failed.status, "failed");
      assert.match(String(failed.error), /no matching conversion result/);
      const adsCall = calls.find((call) => call.url.includes("uploadClickConversions"));
      assert.equal(
        adsCall?.url,
        "https://googleads.googleapis.com/v25/customers/4955115517:uploadClickConversions",
      );
      const adsBody = JSON.parse(String(adsCall?.init?.body)) as {
        customerId: string;
        partialFailure: boolean;
        conversions: Array<{ conversionAction: string; orderId: string }>;
      };
      assert.equal(adsBody.customerId, "4955115517");
      assert.equal(adsBody.partialFailure, true);
      assert.equal(
        adsBody.conversions[0]?.conversionAction,
        "customers/4955115517/conversionActions/7734768680",
      );
    } finally {
      restore();
    }
  }
  console.log("OK  HTTP 200 + empty/partial results are failed, not sent");

  console.log("=== Retryable Data Manager outage stays pending ===");
  {
    const { restore } = mockFetch((url) => {
      if (url === "https://oauth2.googleapis.com/token") {
        return jsonResponse({ access_token: "access" });
      }
      return jsonResponse({ error: { message: "backend unavailable" } }, 503);
    });
    try {
      const pending = await uploadPaidBookingClickConversion(configuredEnv, {
        orderId: "PAY-RETRY",
        conversionValue: 30,
        attribution: { wbraid: "wb-1" },
      });
      assert.equal(pending.status, "pending");
      assert.equal(pending.channel, "data_manager");
      assert.equal(pending.clickIdType, "wbraid");
    } finally {
      restore();
    }
  }
  assert.equal(isRetryableGoogleAdsHttpStatus(429), true);
  assert.equal(isRetryableGoogleAdsHttpStatus(400), false);
  assert.equal(
    isAdsApiOfflineUploadRestricted("CUSTOMER_NOT_ALLOWLISTED_FOR_THIS_FEATURE"),
    true,
  );
  console.log("OK  429/5xx are pending; allowlist restriction is detected");

  console.log("=== Historical recovery dry-run never uploads ===");
  const summary = summarizePaidBookingAdsRecovery([
    {
      paymentReference: "PAID-OK",
      googleAdsPaidConversionStatus: "accepted",
      googleAdsPaidConversionSentAt: "2026-09-02T10:00:00.000Z",
      attribution: { gclid: "g1" },
      amount: 50,
      createdAt: "2026-09-02T09:59:00.000Z",
    },
    {
      paymentReference: "PAID-ELIGIBLE",
      googleAdsPaidConversionStatus: "failed",
      attribution: { gclid: "g2" },
      amount: 70,
      createdAt: "2026-09-03T09:59:00.000Z",
    },
    {
      paymentReference: "ORGANIC",
      attribution: { utm_source: "direct" },
      amount: 40,
      createdAt: "2026-09-03T09:59:00.000Z",
    },
    {
      paymentReference: "REFUND-TEST",
      isRefundTest: true,
      attribution: { gclid: "g3" },
      amount: 1,
      createdAt: "2026-09-03T09:59:00.000Z",
    },
    {
      paymentReference: "NO-TIME",
      attribution: { gclid: "g4" },
      amount: 60,
    },
  ]);
  assert.equal(summary.alreadyUploaded, 1);
  assert.equal(summary.eligible, 1);
  assert.equal(summary.ineligible, 3);
  assert.equal(
    classifyPaidBookingAdsRecovery({
      attribution: { gclid: "g2" },
      amount: 70,
      createdAt: "2026-09-03T09:59:00.000Z",
      googleAdsPaidConversionStatus: "failed",
    }).class,
    "eligible",
  );
  assert.match(helper, /classifyRecentPaidBookingAdsRecovery/);
  assert.match(helper, /Never uploads and never changes payment dates/);
  assert.match(helper, /Historical never-attempted records/);
  console.log("OK  dry-run classifies eligible / already-uploaded / ineligible");

  console.log("=== Source wiring and overlap with browser purchase ===");
  assert.match(finalize, /maybeUploadPaidBookingAdsConversion/);
  assert.doesNotMatch(finalize, /window\.gtag|gtag\(/);
  assert.match(helper, /googleAdsPaidConversionSentAt/);
  assert.match(helper, /shouldSkipPaidBookingAdsUpload/);
  assert.match(helper, /retryRecentPaidBookingAdsConversions/);
  assert.match(helper, /days:\s*30/);
  assert.match(helper, /conversionTime:\s*createdAt/);
  assert.match(workerIndex, /retryRecentPaidBookingAdsConversions\(env\)/);
  assert.match(workerIndex, /googleAdsPaidBookingUploadConfigured/);
  const browserAds = read("src/lib/google-ads.ts");
  assert.match(browserAds, /DEFAULT_PURCHASE_CONVERSION_LABEL/);
  assert.match(browserAds, /NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_CONVERSION_LABEL/);

  const envExample = read("env.example");
  assert.match(envExample, /GOOGLE_ADS_CUSTOMER_ID=4955115517/);
  assert.match(envExample, /GOOGLE_ADS_PAID_BOOKING_CONVERSION_ACTION_ID=7734768680/);
  assert.match(envExample, /Do NOT use the AW- tag number 18303631278/);
  assert.match(envExample, /datamanager/);
  assert.doesNotMatch(envExample, /GOOGLE_ADS_CUSTOMER_ID=18303631278/);

  const sharedModule = read("shared/google-ads-click-conversions.ts");
  assert.match(sharedModule, /DATA_MANAGER_EVENTS_INGEST_URL/);
  assert.match(sharedModule, /customerId: prepared.customerId/);
  assert.match(sharedModule, /no matching conversion result/);
  assert.match(sharedModule, /STALE_GOOGLE_ADS_CUSTOMER_IDS/);
  assert.match(sharedModule, /GOOGLE_ADS_API_VERSION = "v25"/);

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
  console.log("OK  browser purchase stays a separate action; server upload is Data Manager first");

  console.log("\nAll Paid Booking Ads conversion checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
