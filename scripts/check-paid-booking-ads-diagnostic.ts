import assert from "node:assert/strict";
import { handlePaidBookingAdsDiagnostic } from "../workers/addresses/src/paid-booking-ads-diagnostic";
import { paidBookingRefKey } from "../shared/paid-booking-record";
async function main() {
const originalFetch = globalThis.fetch;
const record = { paymentReference: "PAY-VALIDATE", status: "confirmed", amount: 58, currency: "GBP", createdAt: "2026-10-01T12:00:00Z", attribution: { gclid: "private-click" }, googleAdsPaidConversionStatus: "failed", googleAdsPaidConversionLastError: "Bad Request" };
let writes = 0, calls = 0;
const store = { get: async (key: string) => key === paidBookingRefKey(record.paymentReference) ? structuredClone(record) : null, put: async () => { writes++; throw new Error("Validation must not write"); } } as unknown as KVNamespace;
const env = { OWNER_ACCESS_KEY: "test-owner", DRIVER_ACCESS_KEY: "test-driver", TRACKING_STORE: store, GOOGLE_ADS_DEVELOPER_TOKEN: "test-dev", GOOGLE_ADS_CLIENT_ID: "test-id", GOOGLE_ADS_CLIENT_SECRET: "test-secret", GOOGLE_ADS_REFRESH_TOKEN: "test-refresh" };
const request = (key: string, method = "POST") => new Request("https://worker.example/paid-bookings/ads-diagnostic", { method, headers: { "X-Owner-Key": key, "Content-Type": "application/json" }, ...(method === "POST" ? { body: JSON.stringify({ paymentReference: record.paymentReference }) } : {}) });
try {
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    calls++;
    if (String(url).includes("oauth2.googleapis.com")) return Response.json({ access_token: "private-access" });
    const body = JSON.parse(String(init?.body));
    assert.equal(body.validateOnly, true);
    assert.equal(body.conversions[0].orderId, record.paymentReference);
    assert.equal(body.conversions[0].conversionDateTime, "2026-10-01 13:00:00+01:00");
    return Response.json({}); // Google validation success intentionally has no imported results.
  }) as typeof fetch;
  assert.equal((await handlePaidBookingAdsDiagnostic(request("bad"), env, null)).status, 401);
  assert.equal((await handlePaidBookingAdsDiagnostic(request("test-driver"), env, null)).status, 401);
  assert.equal((await handlePaidBookingAdsDiagnostic(request("test-owner", "GET"), env, null)).status, 405);
  assert.equal(calls, 0);
  const response = await handlePaidBookingAdsDiagnostic(request("test-owner"), env, null);
  const text = await response.text();
  assert.equal(JSON.parse(text).status, "validated");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.ok(!text.includes("private-click"));
  assert.ok(!text.includes("private-access"));
  assert.equal(writes, 0);
  assert.equal(record.googleAdsPaidConversionStatus, "failed");
  assert.equal(calls, 2);
  console.log("PASS: owner-only validation, validateOnly forced, original ID/time preserved, no imports, no writes, no credentials/clicks returned");
} finally { globalThis.fetch = originalFetch; }

}
main().catch(error => { console.error(error); process.exit(1); });
