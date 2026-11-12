/**
 * Isolated preview: configuration audit + outbound guard (no deploy, no network).
 * Run: npx tsx scripts/check-bespoke-preview.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Base "network": records every call that gets past the guard.
const reached: string[] = [];
(globalThis as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const req = new Request(input as RequestInfo, init);
  reached.push(`${req.method} ${new URL(req.url).hostname}`);
  return Response.json({ id: "ok" });
}) as typeof fetch;

const TESTER = "tester@example.com";
const goodEnv = {
  PREVIEW_ENVIRONMENT: "bespoke-preview",
  STRIPE_SECRET_KEY: "sk_test_preview",
  PREVIEW_EMAIL_ALLOWLIST: TESTER,
  PREVIEW_SITE_ORIGIN: "https://matni-bespoke-preview.pages.dev",
};

async function main() {
  const preview = await import("../workers/addresses/src/preview-entry");
  const entry = preview.default;

  console.log("=== Refuses to run when misconfigured ===");
  const req = () => new Request("https://preview.example/addresses");
  assert.equal((await entry.fetch(req(), { ...goodEnv, PREVIEW_ENVIRONMENT: undefined } as never)).status, 503);
  assert.equal((await entry.fetch(req(), { ...goodEnv, STRIPE_SECRET_KEY: "sk_live_real" } as never)).status, 503, "live Stripe key refused");
  assert.equal((await entry.fetch(req(), { ...goodEnv, STRIPE_SECRET_KEY: "rk_live_real" } as never)).status, 503);
  assert.equal((await entry.fetch(req(), { ...goodEnv, PREVIEW_EMAIL_ALLOWLIST: "" } as never)).status, 503);
  assert.equal(preview.previewMisconfiguration(goodEnv), null);
  for (const bad of ["https://*.pages.dev", "*", "https://matni-bespoke-preview.pages.dev/", "http://matni-bespoke-preview.pages.dev", "https://x.pages.dev/path", "https://x.pages.dev:8443", ""]) {
    assert.notEqual(preview.previewMisconfiguration({ ...goodEnv, PREVIEW_SITE_ORIGIN: bad }), null, `origin "${bad}" refused`);
  }
  let jobsRan = false;
  const origScheduled = (await import("../workers/addresses/src/index")).default.scheduled;
  void origScheduled;
  await entry.scheduled({ cron: "*/5 * * * *", scheduledTime: Date.now() } as never, { ...goodEnv, STRIPE_SECRET_KEY: "sk_live_x" } as never, { waitUntil() { jobsRan = true; } } as never);
  assert.equal(jobsRan, false, "no scheduled jobs on a misconfigured preview");

  console.log("=== CORS: only the one preview website ===");
  const site = goodEnv.PREVIEW_SITE_ORIGIN;
  const pre = (origin: string) =>
    entry.fetch(new Request("https://preview.example/bespoke-quotes/view", { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "POST" } }), goodEnv as never);
  const okPre = await pre(site);
  assert.equal(okPre.status, 204);
  assert.equal(okPre.headers.get("Access-Control-Allow-Origin"), site);
  assert.match(okPre.headers.get("Access-Control-Allow-Headers") ?? "", /X-Owner-Key/);
  for (const other of ["https://www.myairporttaxini.co.uk", "https://my-airport-taxi-ni-preview.pages.dev", "https://evil.example", "https://matni-bespoke-preview.pages.dev.evil.example"]) {
    const r = await pre(other);
    assert.equal(r.status, 403, `${other} preflight refused`);
    assert.equal(r.headers.get("Access-Control-Allow-Origin"), null);
    const get = await entry.fetch(new Request("https://preview.example/bespoke-quotes/view", { method: "POST", headers: { Origin: other, "Content-Type": "application/json" }, body: "{}" }), goodEnv as never);
    assert.equal(get.headers.get("Access-Control-Allow-Origin"), null, `${other} cannot read preview responses`);
  }
  const fromSite = await entry.fetch(new Request("https://preview.example/bespoke-quotes/view", { method: "POST", headers: { Origin: site, "Content-Type": "application/json" }, body: "{}" }), goodEnv as never);
  assert.equal(fromSite.headers.get("Access-Control-Allow-Origin"), site);
  const prodCors = readFileSync("shared/google-places.ts", "utf8");
  assert.ok(!prodCors.includes("matni-bespoke-preview"), "production CORS allow-list unchanged");
  assert.ok(!/["'`]\*["'`]/.test(readFileSync("workers/addresses/src/preview-entry.ts", "utf8").replace(/value\.includes\("\*"\)/, "")), "no wildcard origin in the preview entry");

  console.log("=== Default-deny outbound guard ===");
  preview.installPreviewOutboundGuard(goodEnv);
  const call = async (url: string, init: RequestInit = {}) => {
    const before = reached.length;
    const res = await fetch(url, init);
    return { status: res.status, reached: reached.length > before };
  };
  const json = (body: unknown, auth?: string): RequestInit => ({
    method: "POST",
    headers: { "Content-Type": "application/json", ...(auth ? { Authorization: auth } : {}) },
    body: JSON.stringify(body),
  });
  for (const blocked of [
    "https://api.sumup.com/v0.1/checkouts",
    "https://formsubmit.co/ajax/bookings@myairporttaxini.co.uk",
    "https://api.web3forms.com/submit",
    "https://api.mailchannels.net/tx/v1/send",
    "https://graph.facebook.com/v23.0/123/messages",
    "https://waba-v2.360dialog.io/messages",
    "https://googleads.googleapis.com/v17/customers",
    "https://aerodatabox.p.rapidapi.com/flights",
    "https://api.anthropic.com/v1/messages",
    "https://reimagined-octo-meme.cgr28.workers.dev/bookings",
    "https://www.myairporttaxini.co.uk/",
  ]) {
    const r = await call(blocked, { method: "POST", body: "{}" });
    assert.equal(r.status, 403, blocked);
    assert.equal(r.reached, false, `${blocked} must not leave the preview`);
  }
  // Stripe: test key only.
  assert.equal((await call("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { Authorization: "Bearer sk_live_real" } })).reached, false);
  assert.equal((await call("https://api.stripe.com/v1/checkout/sessions", { method: "POST" })).reached, false, "no key → blocked");
  assert.equal((await call("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { Authorization: "Bearer sk_test_preview" } })).reached, true);
  // Resend: every recipient must be a tester.
  assert.equal((await call("https://api.resend.com/emails", json({ to: "bookings@myairporttaxini.co.uk", subject: "x" }, "Bearer re_x"))).reached, false, "real mailbox blocked");
  assert.equal((await call("https://api.resend.com/emails", json({ to: "real.customer@gmail.com", subject: "x" }))).reached, false, "real customer blocked");
  assert.equal((await call("https://api.resend.com/emails", json({ to: `Tester <${TESTER}>`, bcc: ["bookings@myairporttaxini.co.uk"], subject: "x" }))).reached, false, "hidden copy to a real mailbox blocked");
  assert.equal((await call("https://api.resend.com/emails", json({ to: [`Tester <${TESTER}>`], subject: "x" }))).reached, true, "tester allowed");
  // Address search / Turnstile / calendar allowed.
  for (const ok of ["https://places.googleapis.com/v1/places:autocomplete", "https://challenges.cloudflare.com/turnstile/v0/siteverify", "https://oauth2.googleapis.com/token", "https://www.googleapis.com/calendar/v3/calendars/x/events"]) {
    assert.equal((await call(ok, { method: "POST", body: "{}" })).reached, true, ok);
  }

  console.log("=== Existing jobs with hard-coded addresses are contained ===");
  // The existing unfinished-payment job alerts the hard-coded bookings@ mailbox.
  const { processUnfinishedPayments } = await import("../workers/addresses/src/unfinished-payment");
  const kv = new Map<string, string>();
  const KV = {
    async get(k: string, t?: unknown) {
      const v = kv.get(k) ?? null;
      return v !== null && (t === "json" || (t as { type?: string })?.type === "json") ? JSON.parse(v) : v;
    },
    async put(k: string, v: string) {
      kv.set(k, v);
    },
    async delete(k: string) {
      kv.delete(k);
    },
    async list(o: { prefix?: string } = {}) {
      return { keys: [...kv.keys()].filter((k) => k.startsWith(o.prefix ?? "")).map((name) => ({ name })), list_complete: true, cursor: "" };
    },
  } as unknown as KVNamespace;
  kv.set(
    "pending-checkout:cs_test_old",
    JSON.stringify({
      checkoutId: "cs_test_old",
      checkoutReference: "matni-x",
      amount: 45,
      createdAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
      booking: { customerName: "Real Person", customerEmail: "real.person@gmail.com", mobileNumber: "07700900000", pickupLabel: "A", dropoffLabel: "B", tripDate: "2026-12-01", tripTime: "10:00", vehicle: "Business Class" },
    }),
  );
  const blockedBefore = preview.previewBlockedCalls.length;
  const reachedBefore = reached.length;
  await processUnfinishedPayments({ TRACKING_STORE: KV, RESEND_API_KEY: "re_preview", ...goodEnv } as never).catch(() => undefined);
  const newBlocked = preview.previewBlockedCalls.slice(blockedBefore);
  assert.ok(newBlocked.length > 0, "the job tried to email and was blocked");
  assert.ok(reached.slice(reachedBefore).every((r) => !/resend|formsubmit|web3forms|mailchannels/.test(r)), "no email left the preview");

  console.log("=== Preview configuration audit ===");
  const toml = readFileSync("workers/addresses/wrangler.bespoke-preview.toml", "utf8");
  const prodToml = readFileSync("workers/addresses/wrangler.toml", "utf8");
  const ids = [...prodToml.matchAll(/^id = "([0-9a-f]{32})"/gm)].map((m) => m[1]);
  assert.ok(ids.length >= 2);
  for (const id of ids) assert.ok(!toml.includes(id), "no production KV id on preview");
  assert.match(toml, /^name = "reimagined-octo-meme-bespoke-preview"$/m, "separate Worker (separate Durable Objects)");
  assert.notEqual(/^name = "(.+)"$/m.exec(prodToml)?.[1], "reimagined-octo-meme-bespoke-preview");
  assert.match(toml, /^main = "src\/preview-entry\.ts"$/m, "guarded entry");
  assert.match(toml, /^PREVIEW_ENVIRONMENT = "bespoke-preview"$/m);
  assert.match(toml, /^PAYMENT_PROVIDER = "stripe-test"$/m);
  assert.match(toml, /^crons = \["\*\/5 \* \* \* \*"\]$/m, "no hourly jobs");
  assert.ok(!/^\[\[send_email\]\]/m.test(toml), "no Cloudflare Email binding");
  assert.ok(!/^\[\[routes\]\]|^route\s*=|^routes\s*=/m.test(toml), "no production routes / custom domains");
  assert.ok(!/^\[env\./m.test(toml));
  for (const name of ["BOOKING_TO_EMAIL", "BOOKING_NOTIFICATION_EMAIL", "OWNER_EMAIL_COPY_ADDRESS", "PREVIEW_EMAIL_ALLOWLIST", "BESPOKE_EMAIL_ALLOWLIST", "STRIPE_TEST_EMAILS"]) {
    assert.match(toml, new RegExp(`^${name} = "REPLACE_WITH_TESTER_EMAIL"$`, "m"), `${name} points at the tester`);
  }
  for (const secret of ["SUMUP_API_KEY", "D360_API_KEY", "WHATSAPP_ACCESS_TOKEN", "GOOGLE_ADS_DEVELOPER_TOKEN", "AERODATABOX_RAPIDAPI_KEY", "WEB3FORMS_ACCESS_KEY"]) {
    assert.ok(!new RegExp(`^${secret}\\s*=`, "m").test(toml), `${secret} never configured on preview`);
  }
  for (const wf of readFileSync(".github/workflows/deploy-worker.yml", "utf8").split("\n")) {
    assert.ok(!wf.includes("bespoke-preview"), "no workflow deploys the preview");
  }
  assert.ok(!readFileSync("workers/addresses/src/index.ts", "utf8").includes("preview-entry"), "production entry never loads the preview guard");
  for (const cls of ["RefundCoordinator", "QuoteLeadCoordinator", "MeetGreetCoordinator", "ConsentLedger", "BespokeQuoteCoordinator"]) {
    assert.equal(typeof (preview as Record<string, unknown>)[cls], "function", `${cls} exported from the preview entry`);
  }

  console.log("=== Hostnames, CORS origin and Stripe return URLs are consistent ===");
  const v = (name: string) => new RegExp(`^${name} = "([^"]*)"$`, "m").exec(toml)?.[1] ?? "";
  const previewSite = v("PREVIEW_SITE_ORIGIN");
  assert.equal(previewSite, "https://matni-bespoke-preview.pages.dev");
  assert.equal(v("SITE_ORIGIN"), previewSite, "customer links / Stripe return URLs use the preview site");
  assert.equal(v("TURNSTILE_ALLOWED_HOSTNAMES"), new URL(previewSite).hostname);
  const workerName = /^name = "(.+)"$/m.exec(toml)![1];
  const buildScript = readFileSync("scripts/build-bespoke-preview-site.mjs", "utf8");
  assert.ok(buildScript.includes(`https://${workerName}.cgr28.workers.dev`), "site build pinned to the preview Worker");
  // Stripe: the return URL and the card page are built from SITE_ORIGIN (never the live site).
  const paymentSrc = readFileSync("workers/addresses/src/bespoke-payment.ts", "utf8");
  assert.match(paymentSrc, /returnUrl: `\$\{site\}\$\{BESPOKE_QUOTATION_PATH\}\?paid=1`/);
  assert.match(paymentSrc, /siteOrigin: site,/);
  assert.match(paymentSrc, /const site = siteOrigin\(env\);/);
  // The LIVE Worker refuses the preview website's origin (its allow-list is unchanged).
  const { isAllowedBrowserOrigin } = await import("../shared/google-places");
  assert.equal(isAllowedBrowserOrigin(previewSite), false, "production Worker does not accept the preview site");
  assert.equal(isAllowedBrowserOrigin("https://www.myairporttaxini.co.uk"), true);

  console.log("=== Preview lives in the separate Staging account ===");
  const { renderPreviewConfig, STAGING_ACCOUNT_ID, LIVE_IDS, KV_TITLES } = await import("./bespoke-preview-prepare.mjs");
  assert.match(toml, new RegExp(`^account_id = "${STAGING_ACCOUNT_ID}"$`, "m"), "preview config pinned to the staging account");
  const liveToml = readFileSync("workers/addresses/wrangler.toml", "utf8");
  assert.ok(liveToml.includes(LIVE_IDS[0]) && !liveToml.includes(STAGING_ACCOUNT_ID), "live config stays on the live account");
  assert.ok(!/TURNSTILE_TEST_KEYS|PREVIEW_ENVIRONMENT/.test(liveToml), "live config never enables preview-only switches");
  const good = { trackingId: "a".repeat(32), counterId: "b".repeat(32), siteHost: "matni-bespoke-preview.pages.dev", testerEmails: "tester@example.com" };
  const rendered = renderPreviewConfig(toml, good);
  assert.ok(!/REPLACE_WITH_/.test(rendered.split("\n").filter((l: string) => !/^\s*#/.test(l)).join("\n")), "all placeholders filled");
  assert.match(rendered, /^PREVIEW_SITE_ORIGIN = "https:\/\/matni-bespoke-preview\.pages\.dev"$/m);
  // A different Pages address is applied to all three settings together.
  const moved = renderPreviewConfig(toml, { ...good, siteHost: "matni-bespoke-preview-abc.pages.dev" });
  for (const name of ["PREVIEW_SITE_ORIGIN", "SITE_ORIGIN"]) assert.match(moved, new RegExp(`^${name} = "https://matni-bespoke-preview-abc\\.pages\\.dev"$`, "m"));
  assert.match(moved, /^TURNSTILE_ALLOWED_HOSTNAMES = "matni-bespoke-preview-abc\.pages\.dev"$/m);
  // Refusals: live ids, live account, the live mailbox, a non-Pages host, bad ids.
  assert.throws(() => renderPreviewConfig(toml, { ...good, trackingId: LIVE_IDS[1] }), /Live resource id/);
  assert.throws(() => renderPreviewConfig(toml.replace(STAGING_ACCOUNT_ID, LIVE_IDS[0]), good), /staging account|Live resource id/);
  assert.throws(() => renderPreviewConfig(toml, { ...good, testerEmails: "bookings@myairporttaxini.co.uk" }), /bookings mailbox/);
  assert.throws(() => renderPreviewConfig(toml, { ...good, siteHost: "www.myairporttaxini.co.uk" }), /Unexpected preview site host/);
  assert.throws(() => renderPreviewConfig(toml, { ...good, counterId: good.trackingId }), /KV namespace ids/);
  assert.ok(Object.values(KV_TITLES).every((t) => /bespoke-preview/.test(String(t))), "preview KV namespaces are clearly named");

  console.log("=== Preview deploy workflow guards ===");
  const wf = readFileSync(".github/workflows/deploy-bespoke-preview.yml", "utf8");
  assert.ok(wf.includes(`STAGING_ACCOUNT_ID: ${STAGING_ACCOUNT_ID}`), "workflow targets the staging account");
  assert.ok(!wf.includes(LIVE_IDS[0]), "workflow never names the live account");
  const tokens = [...wf.matchAll(/CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.([A-Z_]+) \}\}/g)].map((m) => m[1]);
  assert.ok(tokens.length >= 3 && tokens.every((t) => t === "STAGING_CLOUDFLARE_API_TOKEN"), "only the staging-account token is ever used");
  assert.ok(!/wrangler\.toml|--env production|deploy-worker|github-pages/.test(wf.replace(/^\s*#.*$/gm, "")), "no live Worker config or GitHub Pages in the preview workflow");
  assert.match(wf, /-c "\$WRANGLER_CONFIG"/, "Worker commands use the generated preview config");
  assert.match(wf, /\^\(sk\|rk\)_test_/, "Stripe secret must be a TEST key");
  // Existing repository Stripe keys are reused only behind the same TEST-key checks; the live webhook secret is never read.
  assert.match(wf, /EXISTING_STRIPE_SECRET_KEY" \| grep -Eq '\^\(sk\|rk\)_test_'/, "existing secret key reused only if it is a test key");
  assert.match(wf, /EXISTING_STRIPE_PUBLISHABLE_KEY" \| grep -Eq '\^pk_test_'/, "existing publishable key reused only if it is a test key");
  assert.ok(!/secrets\.STRIPE_WEBHOOK_SECRET\b/.test(wf), "the live webhook secret is never used by the preview");
  assert.match(wf, /^    environment: staging$/m, "preview runs in the protected staging environment (owner approves each run)");
  // Whatever the source, the Stripe keys must pass the TEST-key checks before the deploy.
  const guardAt = wf.indexOf("BESPOKE_PREVIEW_STRIPE_SECRET_KEY is not a Stripe TEST key");
  assert.ok(guardAt > wf.indexOf('STRIPE_TEST_SECRET_KEY="$STAGING_STRIPE_SECRET_KEY"') && guardAt < wf.indexOf("npx wrangler deploy -c"), "sandbox keys are format-checked before deploying");
  assert.match(wf, /::add-mask::\$address/, "tester addresses are masked in the public log");
  assert.match(wf, /cp scripts\/bespoke-preview-gate\.js out\/_worker\.js/, "website is deployed behind the private link");
  assert.match(wf, /\[ "\$CODE" != "401" \]/, "deploy fails unless the site answers 401 without the link");
  assert.match(wf, /rm -f out\/CNAME/, "live domain marker removed from the preview site");
  for (const live of ["deploy-pages.yml", "deploy-worker.yml"]) {
    const text = readFileSync(`.github/workflows/${live}`, "utf8");
    assert.ok(!/bespoke-preview|NEXT_PUBLIC_BESPOKE_PUBLIC_PAGES|TURNSTILE_TEST_KEYS/.test(text), `${live} has nothing to do with the preview`);
  }

  console.log("=== Private-link gate ===");
  const gateSrc = readFileSync("scripts/bespoke-preview-gate.js", "utf8");
  assert.match(gateSrc, /ACCESS_CODE_SHA256 = "[a-f0-9]{64}"/, "only a hash is stored");
  const gate = (await import("./bespoke-preview-gate.js")).default as { fetch: (r: Request, e: unknown) => Promise<Response> };
  const assets = { ASSETS: { fetch: async () => new Response("<h1>site</h1>", { headers: { "Content-Type": "text/html" } }) } };
  const noLink = await gate.fetch(new Request("https://preview.example/events/"), assets);
  assert.equal(noLink.status, 401, "no link → private page");
  assert.ok(!(await noLink.text()).includes("<h1>site</h1>"));
  assert.equal((await gate.fetch(new Request("https://preview.example/events/?k=wrong-code"), assets)).status, 401);
  assert.equal((await gate.fetch(new Request("https://preview.example/_next/static/app.js", { headers: { Cookie: "matni_preview=wrong" } }), assets)).status, 401, "assets are gated too");
  // A code that matches a test hash is accepted, sets a cookie and is removed from the address.
  const { createHash } = await import("node:crypto");
  const testCode = "test-code-for-check";
  const patched = gateSrc.replace(/ACCESS_CODE_SHA256 = "[a-f0-9]{64}"/, `ACCESS_CODE_SHA256 = "${createHash("sha256").update(testCode).digest("hex")}"`);
  const testGate = (await import(`data:text/javascript;base64,${Buffer.from(patched).toString("base64")}`)).default as typeof gate;
  const first = await testGate.fetch(new Request(`https://preview.example/events/?k=${testCode}&event=abc`), assets);
  assert.equal(first.status, 302);
  assert.equal(first.headers.get("Location"), "/events/?event=abc", "access code removed from the address");
  const cookie = first.headers.get("Set-Cookie") ?? "";
  assert.match(cookie, /HttpOnly; Secure; SameSite=Lax/);
  const through = await testGate.fetch(new Request("https://preview.example/events/", { headers: { Cookie: cookie.split(";")[0] } }), assets);
  assert.equal(through.status, 200);
  assert.equal(through.headers.get("X-Robots-Tag"), "noindex, nofollow");
  const csp = through.headers.get("Content-Security-Policy") ?? "";
  assert.ok(csp.includes("script-src") && csp.includes("connect-src"), "preview pages carry a content security policy");
  assert.ok(!/google|doubleclick|gtag|facebook/i.test(csp), "no advertising or analytics hosts are allowed on the preview");
  assert.ok(!/cgr28\.workers\.dev|myairporttaxini/.test(csp), "the live Worker and live site are not allowed data sources");

  console.log("=== Turnstile test keys: preview only ===");
  const { verifyTurnstileToken } = await import("../shared/turnstile");
  const testingAnswer = (async () => Response.json({ success: true, hostname: "example.com", metadata: { result_with_testing_key: true } })) as typeof fetch;
  const base = { secret: "s", token: "t", expectedAction: "bespoke_quote_request", allowedHostnames: ["www.myairporttaxini.co.uk"], fetchImpl: testingAnswer };
  assert.deepEqual(await verifyTurnstileToken(base), { ok: false, reason: "testing_key_not_allowed" }, "live rejects Cloudflare test keys");
  assert.deepEqual(await verifyTurnstileToken({ ...base, allowTestingKey: true }), { ok: true }, "preview accepts them");
  const realWrongHost = (async () => Response.json({ success: true, hostname: "evil.example", action: "bespoke_quote_request" })) as typeof fetch;
  assert.equal((await verifyTurnstileToken({ ...base, fetchImpl: realWrongHost, allowTestingKey: true })).ok, false, "a real widget is still fully checked on preview");
  const handlerSrc = readFileSync("workers/addresses/src/bespoke-quote-handlers.ts", "utf8");
  assert.match(handlerSrc, /allowTestingKey: env\.PREVIEW_ENVIRONMENT === "bespoke-preview" && env\.TURNSTILE_TEST_KEYS === "1"/);
  assert.match(toml, /^TURNSTILE_TEST_KEYS = "1"$/m);

  console.log("\nAll preview isolation checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
