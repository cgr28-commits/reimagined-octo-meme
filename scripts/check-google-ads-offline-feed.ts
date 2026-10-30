/** Google Ads scheduled-upload file: only consented, active, ad-clicked paid bookings. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  OFFLINE_FEED_CONVERSION_NAME,
  buildOfflineFeedCsv,
  offlineFeedRowFor,
  parseBasicAuth,
  safeEqual,
} from "../shared/google-ads-offline-feed";

const now = Date.parse("2026-10-30T18:00:00Z");
const base = {
  paymentReference: "TAAA6Z7Q2C3",
  createdAt: "2026-10-20T12:00:35.669Z",
  status: "confirmed",
  amount: 70,
  currency: "GBP",
  attribution: { gclid: "Cj0KCQjwexampleGCLID_abc-123" },
} as never as Parameters<typeof offlineFeedRowFor>[0];

const row = offlineFeedRowFor(base, now);
assert.ok(row);
assert.equal(row.conversionTime, "2026-10-20 12:00:35");
assert.equal(row.value, 70);
assert.equal(row.orderId, "TAAA6Z7Q2C3");

const variants: Array<[string, Record<string, unknown>]> = [
  ["no click id", { attribution: { utm_source: "google" } }],
  ["refunded", { status: "refunded", refundedAt: "2026-10-21T00:00:00Z" }],
  ["cancelled", { status: "cancelled", cancelledAt: "2026-10-21T00:00:00Z" }],
  ["refund test", { isRefundTest: true }],
  ["legacy pre-consent click id", { googleAdsPaidConversionStatus: "skipped_no_consent" }],
  ["older than 60 days", { createdAt: "2026-08-01T10:00:00Z" }],
  ["bad gclid", { attribution: { gclid: "=HYPERLINK(1)" } }],
];
for (const [label, patch] of variants) {
  assert.equal(offlineFeedRowFor({ ...base, ...patch } as typeof base, now), null, label);
}
console.log("OK  only active, consented, ad-clicked bookings in the last 60 days");

const totalFare = offlineFeedRowFor({ ...base, totalFare: 140, amount: 70 } as typeof base, now);
assert.equal(totalFare?.value, 140, "Return bookings report the full fare");

const { csv, rows } = buildOfflineFeedCsv(
  [base, base, { ...base, paymentReference: "TAAA66P3ZVT", attribution: undefined } as typeof base],
  now,
);
assert.equal(rows, 1, "Duplicates and bookings without a click are left out");
const lines = csv.trim().split("\r\n");
assert.equal(lines[0], "Parameters:TimeZone=+0000");
assert.equal(
  lines[1],
  "Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency,Order ID,Ad User Data,Ad Personalization",
);
assert.equal(
  lines[2],
  `Cj0KCQjwexampleGCLID_abc-123,${OFFLINE_FEED_CONVERSION_NAME},2026-10-20 12:00:35,70.00,GBP,TAAA6Z7Q2C3,Granted,Granted`,
);
assert.equal(buildOfflineFeedCsv([], now).rows, 0);
console.log("OK  CSV matches the Google Ads click-import template");

const auth = parseBasicAuth(`Basic ${btoa("googleads:pa:ss")}`);
assert.deepEqual(auth, { username: "googleads", password: "pa:ss" });
assert.equal(parseBasicAuth("Bearer x"), null);
assert.equal(safeEqual("abc", "abc"), true);
assert.equal(safeEqual("abc", "abd"), false);
console.log("OK  feed password check");

const worker = readFileSync(new URL("../workers/addresses/src/index.ts", import.meta.url), "utf8");
assert.match(worker, /"\/ads\/paid-bookings\.csv"/);
assert.match(worker, /handleOwnerAdsFeed\(request, env, request\.headers\.get\("Origin"\), true\)/);
const handler = readFileSync(new URL("../workers/addresses/src/google-ads-offline-feed.ts", import.meta.url), "utf8");
assert.match(handler, /ownerAuthorized\(request, env\)/);
assert.match(handler, /WWW-Authenticate/);
console.log("OK  routes wired; owner-only credentials; Basic auth on the file");
