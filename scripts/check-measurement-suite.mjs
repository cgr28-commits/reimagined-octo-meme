// All test data is fictional; individual tests must explicitly mock external services.
import { spawnSync } from "node:child_process";
const tests = [
  "conversion-tracking",
  "measurement-shutdown",
  "consent-ledger",
  "fresh-visit-address-reset",
  "ads-click-id-retention",
  "sumup-booking-conversion",
  "paid-booking-ads-conversion",
  "google-ads-request-quote",
  "quote-funnel-analytics",
  "deposit-cash",
  "child-seats-booking-sumup",
  "pricing-confirmation",
  "pricing-vehicle-quote-flow",
  "airport-fixed-costs",
  "public-minibus-capacity",
  "review-request",
  "owner-email-bcc",
  "sumup-transaction-metadata",
  "start-new-quote",
  "ad-fraud-monitoring"
];
let failures = 0;
for (const test of tests) {
  const result = spawnSync(process.execPath, ["--require", "./scripts/deny-measurement-test-network.cjs", "--import", "tsx", `scripts/check-${test}.ts`], { encoding: "utf8", timeout: 120000 });
  console.log(`${result.status === 0 ? "PASS" : "FAIL"} ${test}`);
  if (result.status !== 0) { failures++; console.error(result.stdout, result.stderr, result.error || ""); }
}
console.log(`${tests.length - failures}/${tests.length} suites passed`);
process.exitCode = failures ? 1 : 0;
