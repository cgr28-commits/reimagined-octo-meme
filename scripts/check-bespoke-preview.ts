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

  console.log("\nAll preview isolation checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
