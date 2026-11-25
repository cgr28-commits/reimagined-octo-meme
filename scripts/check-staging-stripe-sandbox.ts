import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

(globalThis as any).__MATNI_STAGING_SANDBOX__ = true; // what wrangler.dashboard-staging.toml defines
const realFetchBefore = globalThis.fetch;

(async () => {
  const sb = await import("../workers/addresses/src/staging-sandbox");
  const pp = await import("../workers/addresses/src/payment-provider");
  assert.equal(sb.STAGING_SANDBOX, true);
  assert.notEqual(globalThis.fetch, realFetchBefore, "global fetch is replaced in staging");

  const h = (auth?: string) => new Headers(auth ? { authorization: auth } : {});
  const d = sb.sandboxDecision;
  const TEST = "Bearer sk_test_51ABCdefGHIjklMNO";
  const LIVE = "Bearer sk_live_51ABCdefGHIjklMNO";
  // Stripe
  assert.equal(d("https://api.stripe.com/v1/checkout/sessions", "POST", h(TEST)), "allow_stripe_test");
  assert.equal(d("https://api.stripe.com/v1/checkout/sessions/cs_test_1", "GET", h("Bearer rk_test_abcdefgh12")), "allow_stripe_test");
  assert.equal(d("https://api.stripe.com/v1/checkout/sessions", "POST", h(LIVE)), "block", "live key refused");
  assert.equal(d("https://api.stripe.com/v1/checkout/sessions", "POST", h("Bearer rk_live_abcdefgh12")), "block", "live restricted key refused");
  assert.equal(d("https://api.stripe.com/v1/charges", "POST", h()), "block", "no key refused");
  assert.equal(d("https://api.stripe.com/v1/charges", "POST", h("Bearer pk_test_abcdefgh12")), "block", "publishable key is not a secret key");
  assert.equal(d("https://api.stripe.com.evil.test/v1/x", "POST", h(TEST)), "block", "look-alike host refused");
  assert.equal(d("http://api.stripe.com/v1/x", "POST", h(TEST)), "block", "plain http refused");
  assert.equal(d("https://api.stripe.com/files", "POST", h(TEST)), "block", "outside /v1/");
  // Google look-ups only
  assert.equal(d("https://places.googleapis.com/v1/places:autocomplete", "POST", h()), "allow_google_lookup");
  assert.equal(d("https://places.googleapis.com/v1/places:searchText", "POST", h()), "allow_google_lookup");
  assert.equal(d("https://places.googleapis.com/v1/places/ChIJabc_123-x", "GET", h()), "allow_google_lookup");
  assert.equal(d("https://maps.googleapis.com/maps/api/geocode/json?address=x", "GET", h()), "allow_google_lookup");
  // Everything that could reach a customer, driver, calendar or ad account stays blocked
  for (const url of [
    "https://api.resend.com/emails", "https://waba.360dialog.io/v1/messages", "https://graph.facebook.com/v20.0/1/messages",
    "https://www.googleapis.com/calendar/v3/calendars/x/events", "https://googleads.googleapis.com/v17/customers/1:uploadClickConversions",
    "https://api.sumup.com/v0.1/checkouts", "https://api.web3forms.com/submit", "https://example.com/",
    "https://places.googleapis.com/v1/places/abc/photos/x/media", "https://maps.googleapis.com/maps/api/place/photo",
  ]) assert.equal(d(url, "POST", h(TEST)), "block", url);

  // The patched fetch: allowed calls pass through to the real fetch; others get the 503 sandbox response.
  const seen: string[] = [];
  const fake = (async (input: RequestInfo | URL) => { seen.push(String(input)); return new Response("{}", { status: 200 }); }) as typeof fetch;
  const f = sb.makeSandboxFetch(fake);
  assert.equal((await f("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { Authorization: TEST } })).status, 200);
  assert.equal((await f("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { Authorization: LIVE } })).status, 503);
  const email = await f("https://api.resend.com/emails", { method: "POST", body: "{}" });
  assert.equal(email.status, 503);
  assert.equal(email.headers.get("x-matni-staging-sandbox"), "blocked");
  assert.deepEqual(seen, ["https://api.stripe.com/v1/checkout/sessions"], "only the test-mode Stripe call left the Worker");
  assert.ok(sb.recentBlockedOutbound().some((r) => r.url === "https://api.resend.com/emails"));

  // Provider switch in staging: any customer, test key only.
  const testEnv = { STRIPE_SECRET_KEY: "sk_test_51ABCdefGHIjklMNO" };
  assert.equal(pp.stripeActiveFor(testEnv, "someone@example.com"), true, "staging: test key takes every booking");
  assert.equal(pp.stripeActiveFor({ ...testEnv, PAYMENT_PROVIDER: "stripe" }, "someone@example.com"), true);
  assert.equal(pp.stripeActiveFor({ STRIPE_SECRET_KEY: "sk_live_51ABCdefGHIjklMNO", PAYMENT_PROVIDER: "stripe" }, "someone@example.com"), false, "staging never activates a live key");
  assert.equal(pp.stripeActiveFor({}, "someone@example.com"), false);

  // Production is untouched: the flag is a build-time define that production never sets.
  const toml = readFileSync("workers/addresses/wrangler.toml", "utf8");
  assert.ok(!toml.includes("__MATNI_STAGING_SANDBOX__"), "production wrangler.toml does not define the sandbox");
  const staging = readFileSync("workers/addresses/wrangler.dashboard-staging.toml", "utf8");
  assert.ok(/account_id = "ecad568dc411e28a3e435ef40b36c2b5"/.test(staging) && !/crons = \[".+"\]/.test(staging));
  console.log("PASS staging sandbox: Stripe test-only allowlist, Google look-ups only, everything else blocked");
})().catch((e) => { console.error("FAIL", e); process.exit(1); });
