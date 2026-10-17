/** Real conversion/store functions with in-memory KV and mocked OAuth/Ads/SumUp. */
import assert from "node:assert/strict";
import { consent, mockKv, mockConsentNamespace } from "./measurement-test-helpers";
import { makeAttributionTouch } from "../shared/ads-attribution";
import {
  savePaidBookingRecord,
  getPaidBookingRecord,
} from "../workers/addresses/src/paid-booking-store";
import {
  savePendingCheckout,
  getPendingCheckout,
} from "../workers/addresses/src/pending-checkout-store";
import {
  maybeUploadPaidBookingAdsConversion,
  retryRecentPaidBookingAdsConversions,
} from "../workers/addresses/src/paid-booking-ads-conversion";
import { handleMeasurementWithdrawal } from "../workers/addresses/src/measurement-consent";
import { finalizePaidCheckout } from "../workers/addresses/src/finalize-paid-checkout";
import { marketingReportRow } from "../shared/marketing-report";
import { handleMarketingReport } from "../workers/addresses/src/marketing-report";
import { saveBookingJob } from "../workers/addresses/src/booking-job-store";
import type { PaidBookingRecord } from "../shared/paid-booking-record";
async function main() {
  const kv = mockKv();
  const { withConsistentConsentLedger } = await import("../workers/addresses/src/consent-ledger");
  const store = withConsistentConsentLedger(kv as unknown as KVNamespace, await mockConsentNamespace() as unknown as DurableObjectNamespace)!;
  const uploads: any[] = [];
  let fail = false;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("oauth2.googleapis.com"))
      return new Response(JSON.stringify({ access_token: "TEST" }));
    if (url.includes("googleads.googleapis.com")) {
      uploads.push(JSON.parse(String(init?.body)).conversions[0]);
      return fail
        ? new Response('{"error":{"message":"mock failure"}}', { status: 503 })
        : new Response('{"results":[{"orderId":"TEST"}]}');
    }
    throw Error(`Unexpected external call blocked: ${url}`);
  };
  // Fictional configuration only; a flag or credentials alone cannot enable uploads.
  const { isGoogleAdsClickConversionConfigured } = await import("../shared/google-ads-click-conversions");
  assert.equal(isGoogleAdsClickConversionConfigured({ GOOGLE_ADS_PAID_UPLOAD_VERIFIED: "false" }), false);
  const grant = consent();
  const touch = makeAttributionTouch({
    gclid: "TEST-CLICK",
    utm_source: "google",
    utm_medium: "cpc",
  });
  const attribution = {
    gclid: "TEST-CLICK",
    utm_source: "google",
    utm_medium: "cpc",
    consent: grant,
    firstTouch: touch,
    lastTouch: touch,
  };
  const env = {
    TRACKING_STORE: store,
    GOOGLE_ADS_PAID_UPLOAD_VERIFIED: "true",
    GOOGLE_ADS_CUSTOMER_ID: "1234567890",
    GOOGLE_ADS_PAID_BOOKING_CONVERSION_ACTION_ID: "9876543210",
    GOOGLE_ADS_DEVELOPER_TOKEN: "TEST",
    GOOGLE_ADS_CLIENT_ID: "TEST",
    GOOGLE_ADS_CLIENT_SECRET: "TEST",
    GOOGLE_ADS_REFRESH_TOKEN: "TEST",
  };
  assert.equal(isGoogleAdsClickConversionConfigured(env), true);
  assert.equal(isGoogleAdsClickConversionConfigured({ ...env, GOOGLE_ADS_PAID_UPLOAD_VERIFIED: "false" }), false);
  assert.equal(isGoogleAdsClickConversionConfigured({ ...env, GOOGLE_ADS_CUSTOMER_ID: undefined }), false);
  assert.equal(isGoogleAdsClickConversionConfigured({ ...env, GOOGLE_ADS_PAID_BOOKING_CONVERSION_ACTION_ID: undefined }), false);
  assert.equal(isGoogleAdsClickConversionConfigured({ ...env, GOOGLE_ADS_CUSTOMER_ID: "AW-EXAMPLE" }), false);
  const make = (ref: string) =>
    ({
      paymentReference: ref,
      checkoutId: `checkout-${ref}`,
      customerReference: `customer-${ref}`,
      createdAt: new Date().toISOString(),
      amount: 50,
      totalFare: 50,
      originalAmount: 50,
      amountPaidLabel: "£50.00",
      currency: "GBP",
      status: "paid",
      paymentStatus: "paid",
      operationalStatus: "confirmed",
      customerName: "Fictional",
      customerEmail: "audit@example.invalid",
      mobileNumber: "07700900000",
      tripDate: "2026-12-01",
      tripTime: "10:00",
      calendarEventIds: [],
      transactionId: "TEST-TX",
      transactionCode: "TEST-CODE",
      attribution,
    }) as PaidBookingRecord;
  const deposit = { ...make("TEST-DEPOSIT"), amount: 10, originalAmount: 10, totalFare: 50, cashBalanceDue: 40, amountRefunded: 5 };
  assert.equal(marketingReportRow(deposit, true).collected, 10);
  assert.equal(marketingReportRow(deposit, true).fare, 50);
  assert.equal(marketingReportRow(deposit, true).refunded, 5);
  assert.equal(marketingReportRow({ ...deposit, cashCollectedAt: new Date().toISOString() }, true).collected, 50);
  await savePaidBookingRecord(store, make("TEST-ONE"));
  assert.equal(
    JSON.parse(kv.m.get("booking:ref:TEST-ONE")!).attribution,
    undefined,
    "no click IDs in long-lived operational record",
  );
  assert.ok(kv.ttls.get("measurement:paid:TEST-ONE")! <= 90 * 86400);
  await maybeUploadPaidBookingAdsConversion({
    env,
    paymentReference: "TEST-ONE",
    amount: 50,
  });
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].orderId, "TEST-ONE");
  assert.deepEqual(uploads[0].consent, {
    adUserData: "GRANTED",
  });
  await maybeUploadPaidBookingAdsConversion({
    env,
    paymentReference: "TEST-ONE",
    amount: 50,
  });
  assert.equal(uploads.length, 1, "webhook repeat does not upload twice");
  await saveBookingJob(store, { id: "TEST-UNPAID-REQUEST", kind: "booking-request", status: "awaiting_payment", createdAt: new Date().toISOString() } as any);
  const deniedReport = await handleMarketingReport(new Request("https://audit.invalid/owner/marketing-attribution"), { TRACKING_STORE: store, OWNER_ACCESS_KEY: "TEST-OWNER" }, null);
  assert.equal(deniedReport.status, 401);
  const report = await handleMarketingReport(new Request("https://audit.invalid/owner/marketing-attribution", { headers: { "X-Owner-Key": "TEST-OWNER" } }), { TRACKING_STORE: store, OWNER_ACCESS_KEY: "TEST-OWNER" }, null);
  const reportBody = await report.json() as any;
  assert.equal(reportBody.rows.length, 1);
  assert.equal(reportBody.unpaidRequests, 1);
  assert.equal(reportBody.totalRecordedBookings, 2);
  assert.ok(!JSON.stringify(reportBody).includes("TEST-CLICK"));

  await maybeUploadPaidBookingAdsConversion({
    env,
    paymentReference: "UNPAID-NONEXISTENT",
    amount: 50,
    attribution,
  });
  assert.equal(uploads.length, 1);
  await savePaidBookingRecord(store, {
    ...make("TEST-CANCEL"),
    cancelledAt: new Date().toISOString(),
  });
  await maybeUploadPaidBookingAdsConversion({
    env,
    paymentReference: "TEST-CANCEL",
    amount: 50,
  });
  assert.equal(uploads.length, 1);
  await savePaidBookingRecord(store, {
    ...make("TEST-NOCONSENT"),
    attribution: { gclid: "LEGACY" },
  });
  await maybeUploadPaidBookingAdsConversion({
    env,
    paymentReference: "TEST-NOCONSENT",
    amount: 50,
  });
  assert.equal(uploads.length, 1);
  fail = true;
  await savePaidBookingRecord(store, make("TEST-RETRY"));
  await maybeUploadPaidBookingAdsConversion({
    env,
    paymentReference: "TEST-RETRY",
    amount: 50,
  });
  assert.equal(
    (await getPaidBookingRecord(store, "TEST-RETRY"))
      ?.googleAdsPaidConversionStatus,
    "failed",
  );
  fail = false;
  await retryRecentPaidBookingAdsConversions(env);
  assert.equal(
    (await getPaidBookingRecord(store, "TEST-RETRY"))
      ?.googleAdsPaidConversionStatus,
    "sent",
  );
  assert.equal(
    (await getPaidBookingRecord(store, "TEST-RETRY"))
      ?.googleAdsPaidConversionAttempts,
    2,
  );
  const booking = {
    customerName: "Fictional",
    customerEmail: "audit@example.invalid",
    mobileNumber: "07700900000",
    attribution,
  } as any;
  await savePendingCheckout(store, {
    checkoutId: "TEST-PENDING",
    checkoutReference: "TEST",
    amount: 50,
    booking,
    createdAt: new Date().toISOString(),
  });
  assert.equal(
    (await getPendingCheckout(store, "TEST-PENDING"))?.booking.attribution
      ?.gclid,
    "TEST-CLICK",
  );
  assert.equal(
    JSON.parse(kv.m.get("pending-checkout:TEST-PENDING")!).booking.attribution,
    undefined,
  );
  await savePaidBookingRecord(store, make("TEST-REVOKED"));
  const before = uploads.length;
  const revoked = await handleMeasurementWithdrawal(
    new Request("https://audit.invalid/measurement/withdraw", {
      method: "POST",
      body: JSON.stringify({ ids: [grant.id] }),
    }),
    store,
    null,
  );
  assert.equal(revoked.status, 200);
  assert.equal(
    (await getPendingCheckout(store, "TEST-PENDING"))?.booking.attribution,
    undefined,
  );
  await maybeUploadPaidBookingAdsConversion({
    env,
    paymentReference: "TEST-REVOKED",
    amount: 50,
    attribution,
  });
  assert.equal(uploads.length, before);
  const row = marketingReportRow(make("TEST-REPORT"), false);
  assert.equal(row.source, "Unknown");
  assert.equal(row.collected, 50);
  // Paid webhook recovery needs no browser session. Existing verified record is enough.
  const fresh = consent();
  const webhookRecord = {
    ...make("TEST-WEBHOOK"),
    attribution: { ...attribution, consent: fresh },
  };
  await savePaidBookingRecord(store, webhookRecord);
  const args = {
    env: { ...env, SUMUP_API_KEY: "TEST" },
    checkoutId: webhookRecord.checkoutId,
    booking,
    logPaidBookingCalendar: async () => ({ logged: true }),
  };
  const result = await finalizePaidCheckout(args);
  assert.equal(result.paid, true);
  assert.equal(result.alreadyFinalized, true);
  assert.equal(uploads.at(-1).orderId, "TEST-WEBHOOK");
  const count = uploads.length;
  await finalizePaidCheckout(args);
  assert.equal(uploads.length, count);

  // First successful checkout and notification delivery, with no browser return.
  const fullBooking = {
    ...booking,
    attribution: { ...attribution, consent: consent() },
    tripLabel: "Airport drop-off",
    pickupLabel: "Fictional Belfast address",
    dropoffLabel: "Belfast International Airport",
    tripDate: "2026-12-01",
    tripTime: "10:00",
    passengers: 1,
    suitcases: 1,
    vehicle: "Saloon",
    returnJourney: false,
    airportCode: "BFS",
    isFromAirport: false,
  };
  let emails = 0;
  const newEnv = {
    ...env,
    SUMUP_API_KEY: "TEST",
    EMAIL: {
      send: async () => {
        emails++;
        return { messageId: "MOCK" };
      },
    },
  };
  const newCheckout = {
    id: "TEST-NEW-CHECKOUT",
    status: "PAID",
    amount: 50,
    currency: "GBP",
    checkout_reference: "TEST-NEW-REFERENCE",
    transaction_id: "TEST-NEW-ID",
    transaction_code: "TEST-NEW-CODE",
  };
  await savePendingCheckout(store, {
    checkoutId: newCheckout.id,
    checkoutReference: "TEST-NEW-REFERENCE",
    amount: 50,
    booking: fullBooking,
    createdAt: new Date().toISOString(),
  });
  const success = await finalizePaidCheckout({
    env: newEnv,
    checkoutId: newCheckout.id,
    booking: fullBooking,
    checkout: newCheckout,
    logPaidBookingCalendar: async () => ({ logged: true, eventIds: [] }),
  });
  assert.equal(success.paid, true);
  assert.equal(success.customerEmailSent, true);
  assert.equal(success.ownerEmailSent, true);
  assert.ok(emails >= 2);
  assert.equal(success.purchase?.transactionId, success.paymentReference);
  const uploaded = uploads.length,
    notified = emails;
  await finalizePaidCheckout({
    env: newEnv,
    checkoutId: newCheckout.id,
    booking: fullBooking,
    checkout: newCheckout,
    logPaidBookingCalendar: async () => ({ logged: true, eventIds: [] }),
  });
  assert.equal(uploads.length, uploaded);
  assert.equal(emails, notified);
  const unpaid = await finalizePaidCheckout({
    env: newEnv,
    checkoutId: "TEST-UNPAID",
    booking: fullBooking,
    checkout: { ...newCheckout, id: "TEST-UNPAID", status: "PENDING" },
    logPaidBookingCalendar: async () => ({ logged: true }),
  });
  assert.equal(unpaid.paid, false);
  assert.equal(uploads.length, uploaded);
  console.log(
    "PASS first SumUp PAID checkout, customer/owner notification mocks, no return, duplicate webhook, unpaid SumUp rejection",
  );
  console.log(
    "PASS backend evidence/withdrawal, expiring sidecars, unpaid/cancelled exclusion, stable server order ID, failed upload/retry, no browser return and duplicate finalize recovery",
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
