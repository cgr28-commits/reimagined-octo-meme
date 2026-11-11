/** Run: npx tsx scripts/check-staging-sandbox.ts */
import assert from "node:assert/strict";
import { STAGING_SANDBOX, makeSandboxFetch, recentBlockedOutbound } from "../workers/addresses/src/staging-sandbox";
import { isAllowedBrowserOrigin, isDashboardStagingPagesHost } from "../shared/google-places";

async function main() {
  // Without the staging build define, the sandbox is off and fetch is untouched.
  assert.equal(STAGING_SANDBOX, false);
  assert.equal(isAllowedBrowserOrigin("https://matni-dashboard-staging.pages.dev"), false, "prod/preview must not trust the staging origin");
  assert.equal(isDashboardStagingPagesHost("matni-dashboard-staging.pages.dev"), true);
  assert.equal(isDashboardStagingPagesHost("abc123.matni-dashboard-staging.pages.dev"), true);
  assert.equal(isDashboardStagingPagesHost("matni-dashboard-staging-x7k.pages.dev"), true);
  assert.equal(isDashboardStagingPagesHost("evil-matni-dashboard-staging.pages.dev"), false);
  assert.equal(isDashboardStagingPagesHost("matni-dashboard-staging.pages.dev.evil.com"), false);
  const blocked = makeSandboxFetch();
  const res = await blocked("https://api.resend.com/emails?key=secret", { method: "POST", body: "{}" });
  assert.equal(res.status, 503);
  assert.equal(res.headers.get("x-matni-staging-sandbox"), "blocked");
  const log = recentBlockedOutbound();
  assert.equal(log.at(-1)?.url, "https://api.resend.com/emails", "query string never logged");
  assert.equal(log.at(-1)?.method, "POST");
  console.log("check-staging-sandbox: all checks passed");
}
main().catch((e) => { console.error(e); process.exit(1); });
