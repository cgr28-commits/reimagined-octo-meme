#!/usr/bin/env node
/**
 * WP-B0 isolation guard for the Private Tours preview (staging Cloudflare account only).
 * Used by .github/workflows/deploy-tours-preview.yml. Never used by production deploys.
 * Prints no secret values: only ids that are already public in the repository, HTTP codes and verdicts.
 *
 *   --self-test                 offline: proves the guard FAILS on the three forbidden inputs
 *   --check-workflow            static check of the tours preview workflow (secret allowlist, triggers, uses:)
 *   --check-config <file>       rendered wrangler config must be staging-only (account, KV, DO, routes, email)
 *   --check-stripe              STRIPE_SECRET_KEY / STRIPE_PUBLISHABLE_KEY env must be Stripe TEST keys (or empty)
 *   --probe-token               the staging API token must NOT reach the production account
 *   --check-deployed            the deployed preview Worker's bindings must be staging-only
 *
 * Exit code 0 = pass, 1 = fail.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const STAGING_ACCOUNT_ID = "ecad568dc411e28a3e435ef40b36c2b5";
export const PRODUCTION_ACCOUNT_ID = "36c5c88df4c1f0259413d555f2679f3c";
export const PREVIEW_WORKER_NAME = "reimagined-octo-meme-tours-preview";
export const PRODUCTION_WORKER_NAME = "reimagined-octo-meme";
export const WORKFLOW_FILE = ".github/workflows/deploy-tours-preview.yml";
export const PRODUCTION_WRANGLER = "workers/addresses/wrangler.toml";
/** Public ids already committed in the repository (production account + production KV). */
const KNOWN_PRODUCTION_IDS = [PRODUCTION_ACCOUNT_ID, "53fa3cc2bd46436f90ae19200e599ea1", "869e2c2e02004d4a88c9cfbf563f1d6a"];

/** The ONLY secrets the tours preview workflow may reference. All are staging-only credentials. */
export const ALLOWED_SECRETS = [
  "STAGING_CLOUDFLARE_API_TOKEN",
  "STAGING_STRIPE_SECRET_KEY",
  "STAGING_STRIPE_PUBLISHABLE_KEY",
  "STAGING_STRIPE_WEBHOOK_SECRET",
  "TOURS_PREVIEW_TESTER_EMAIL",
  "TOURS_PREVIEW_OWNER_KEY",
  "TOURS_PREVIEW_RESEND_API_KEY",
  "GITHUB_TOKEN",
];
/** Third-party actions the workflow may use (no reusable workflows, no local actions). */
export const ALLOWED_USES = ["actions/checkout@v4", "actions/setup-node@v4"];

const errors = [];
const fail = (message) => errors.push(message);

/** Every production resource id: the known ids plus every 32-hex `id = "…"` in the production wrangler.toml. */
export function productionIds(wranglerText = "") {
  const ids = new Set(KNOWN_PRODUCTION_IDS);
  for (const match of wranglerText.matchAll(/\bid\s*=\s*"([a-f0-9]{32})"/gi)) ids.add(match[1].toLowerCase());
  for (const match of wranglerText.matchAll(/\bpreview_id\s*=\s*"([a-f0-9]{32})"/gi)) ids.add(match[1].toLowerCase());
  return [...ids];
}

/** Pure: assertions on a rendered Worker config + environment. Returns a list of failures. */
export function assertConfigIsStagingOnly({ config, accountIdEnv = "", stripeKey = "", productionWrangler = "" }) {
  const problems = [];
  const active = config
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
  const lower = active.toLowerCase();
  if (accountIdEnv && accountIdEnv !== STAGING_ACCOUNT_ID) problems.push(`CLOUDFLARE_ACCOUNT_ID is not the staging account (${accountIdEnv === PRODUCTION_ACCOUNT_ID ? "it is the PRODUCTION account" : "unknown account"}).`);
  const accountLine = /^account_id\s*=\s*"([^"]+)"$/m.exec(active);
  if (!accountLine) problems.push("Config has no account_id pin.");
  else if (accountLine[1] !== STAGING_ACCOUNT_ID) problems.push(`Config account_id is not the staging account (${accountLine[1] === PRODUCTION_ACCOUNT_ID ? "PRODUCTION account id" : "unknown"}).`);
  for (const id of productionIds(productionWrangler)) if (lower.includes(id.toLowerCase())) problems.push(`Production resource id ${id} appears in the preview config (namespace or account).`);
  if (!new RegExp(`^name\\s*=\\s*"${PREVIEW_WORKER_NAME}"$`, "m").test(active)) problems.push(`Worker name must be ${PREVIEW_WORKER_NAME}.`);
  if (new RegExp(`^name\\s*=\\s*"${PRODUCTION_WORKER_NAME}"$`, "m").test(active)) problems.push("Config uses the production Worker name.");
  if (/^\s*(routes?|custom_domains?)\s*=|^\s*\[\[routes\]\]|\[\[?(env\.[^\]]+\.)?routes?\]\]/m.test(active)) problems.push("Config declares routes or custom domains (production routes must stay untouched).");
  if (lower.includes("myairporttaxini.co.uk")) problems.push("Config mentions the production domain myairporttaxini.co.uk.");
  if (/script_name\s*=/.test(active)) problems.push("A binding points at another Worker script (script_name): shared Durable Objects are not allowed.");
  if (/\[\[(services|d1_databases|r2_buckets|queues\.producers|hyperdrive|vectorize|analytics_engine_datasets)\]\]/.test(active)) problems.push("Unexpected binding type in the preview config (only KV and its own Durable Objects are allowed).");
  if (/send_email/.test(active)) problems.push("Preview must not bind Cloudflare Email.");
  if (/REPLACE_WITH_/.test(active)) problems.push("Unfilled placeholder in the preview config.");
  if (!/^PREVIEW_ENVIRONMENT\s*=\s*"bespoke-preview"$/m.test(active)) problems.push("PREVIEW_ENVIRONMENT missing (the Worker refuses to run without it).");
  if (!/^PAYMENT_PROVIDER\s*=\s*"stripe-test"$/m.test(active)) problems.push("PAYMENT_PROVIDER must be stripe-test.");
  if (stripeKey && !/^(sk|rk)_test_/.test(stripeKey)) problems.push("Stripe key is not a TEST key (sk_test_/rk_test_).");
  return problems;
}

/** Pure: static analysis of the workflow text. */
export function assertWorkflowIsStagingOnly(text) {
  const problems = [];
  const noComments = text
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
  const referenced = new Set([...noComments.matchAll(/\bsecrets\.([A-Za-z0-9_]+)/g)].map((m) => m[1]));
  for (const name of referenced) if (!ALLOWED_SECRETS.includes(name)) problems.push(`Workflow references a secret outside the staging allowlist: ${name}`);
  if (/\bsecrets\s*\[/.test(noComments) || /toJSON\(\s*secrets\s*\)/i.test(noComments) || /\bsecrets\s*\}\}/.test(noComments)) problems.push("Workflow reads secrets dynamically (indexing or toJSON): not allowed.");
  if (/secrets\s*:\s*inherit/.test(noComments)) problems.push("Workflow uses `secrets: inherit`.");
  if (/\bworkflow_call\b|\bworkflow_run\b/.test(noComments)) problems.push("Workflow must not be reusable or chained (workflow_call / workflow_run).");
  for (const match of noComments.matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)) {
    if (!ALLOWED_USES.includes(match[1])) problems.push(`Workflow uses a non-allowlisted action or reusable workflow: ${match[1]}`);
  }
  if (/pull_request_target|\bpull_request\b/.test(noComments.split(/^jobs:/m)[0])) problems.push("Workflow must not trigger on pull requests (push on tours/** and workflow_dispatch only).");
  const triggers = noComments.split(/^jobs:/m)[0];
  if (!/branches:\s*\n\s*-\s*["']?tours\/\*\*["']?/.test(triggers)) problems.push("Push trigger must be limited to tours/**.");
  if (/branches:\s*\[?\s*["']?(main|\*\*?)["']?/.test(triggers)) problems.push("Push trigger includes main or a wildcard.");
  if (!/^\s*contents:\s*read\s*$/m.test(noComments)) problems.push("Workflow permissions must be contents: read.");
  if (/contents:\s*write|id-token:\s*write|actions:\s*write/.test(noComments)) problems.push("Workflow requests write permissions.");
  if (/^\s*environment:\s*(?!staging\s*$)\S+/m.test(noComments)) problems.push("Workflow uses an environment other than the staging environment.");
  if (!new RegExp(`ecad568dc411e28a3e435ef40b36c2b5`).test(noComments)) problems.push("Workflow does not pin the staging account id.");
  if (noComments.includes(PRODUCTION_ACCOUNT_ID)) problems.push("Workflow contains the production account id.");
  if (/vars\.CLOUDFLARE|secrets\.CLOUDFLARE_/.test(noComments)) problems.push("Workflow references the production Cloudflare credentials.");
  if (!/persist-credentials:\s*false/.test(noComments)) problems.push("Checkout must set persist-credentials: false.");
  return problems;
}

function report(title, problems) {
  if (problems.length === 0) {
    console.log(`✓ ${title}`);
    return true;
  }
  for (const problem of problems) console.error(`::error::${title}: ${problem}`);
  return false;
}

/** Offline proof that the guard fails closed. Returns true when every negative test fails as it must. */
export function selfTest(goodConfig, productionWrangler) {
  const results = [];
  const expectFail = (label, problems, needle) => {
    const ok = problems.length > 0 && problems.some((p) => p.includes(needle));
    results.push(ok);
    console.log(`${ok ? "✓" : "✗"} negative test — ${label}: ${ok ? "guard FAILED as required" : "guard did NOT fail (BAD)"}`);
  };
  const baseline = assertConfigIsStagingOnly({ config: goodConfig, accountIdEnv: STAGING_ACCOUNT_ID, stripeKey: "sk_test_x", productionWrangler });
  results.push(baseline.length === 0);
  console.log(`${baseline.length === 0 ? "✓" : "✗"} baseline staging config passes${baseline.length ? ": " + baseline.join(" | ") : ""}`);
  expectFail("production account id", assertConfigIsStagingOnly({ config: goodConfig.replace(STAGING_ACCOUNT_ID, PRODUCTION_ACCOUNT_ID), accountIdEnv: PRODUCTION_ACCOUNT_ID, stripeKey: "sk_test_x", productionWrangler }), "account");
  const prodKv = productionIds(productionWrangler).find((id) => id !== PRODUCTION_ACCOUNT_ID) ?? "53fa3cc2bd46436f90ae19200e599ea1";
  expectFail("production KV namespace id", assertConfigIsStagingOnly({ config: goodConfig + `\n[[kv_namespaces]]\nbinding = "X"\nid = "${prodKv}"\n`, accountIdEnv: STAGING_ACCOUNT_ID, stripeKey: "sk_test_x", productionWrangler }), "Production resource id");
  expectFail("live Stripe key", assertConfigIsStagingOnly({ config: goodConfig, accountIdEnv: STAGING_ACCOUNT_ID, stripeKey: "sk_live_" + "x".repeat(10), productionWrangler }), "not a TEST key");
  expectFail("route on the production domain", assertConfigIsStagingOnly({ config: goodConfig + '\nroutes = [{ pattern = "www.myairporttaxini.co.uk/*", zone_name = "myairporttaxini.co.uk" }]\n', accountIdEnv: STAGING_ACCOUNT_ID, productionWrangler }), "routes");
  expectFail("shared Durable Object from another script", assertConfigIsStagingOnly({ config: goodConfig + '\n[[durable_objects.bindings]]\nname = "X"\nclass_name = "Y"\nscript_name = "reimagined-octo-meme"\n', accountIdEnv: STAGING_ACCOUNT_ID, productionWrangler }), "script_name");
  const goodWorkflow = readFileSync(WORKFLOW_FILE, "utf8");
  const wf = assertWorkflowIsStagingOnly(goodWorkflow);
  results.push(wf.length === 0);
  console.log(`${wf.length === 0 ? "✓" : "✗"} baseline workflow passes the secret allowlist${wf.length ? ": " + wf.join(" | ") : ""}`);
  expectFail("workflow referencing a production secret", assertWorkflowIsStagingOnly(goodWorkflow + "\n      X: ${{ secrets.STRIPE_SECRET_KEY }}\n"), "outside the staging allowlist");
  expectFail("workflow with secrets: inherit", assertWorkflowIsStagingOnly(goodWorkflow + "\n    secrets: inherit\n"), "inherit");
  expectFail("workflow calling a reusable workflow", assertWorkflowIsStagingOnly(goodWorkflow + "\n    uses: ./.github/workflows/deploy-worker.yml\n"), "non-allowlisted");
  expectFail("workflow reading all secrets", assertWorkflowIsStagingOnly(goodWorkflow + "\n      X: ${{ toJSON(secrets) }}\n"), "dynamically");
  return results.every(Boolean);
}

async function cf(path, token) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, success: body.success === true, result: body.result };
}

/** The staging token must not reach production: list of accounts is staging-only, production reads are refused. */
async function probeToken() {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const problems = [];
  if (!token) return ["CLOUDFLARE_API_TOKEN (staging) is not set."];
  const accounts = await cf("/accounts?per_page=50", token);
  if (accounts.success) {
    const ids = (accounts.result ?? []).map((a) => a.id);
    console.log(`Staging token can see ${ids.length} account(s): ${ids.map((id) => (id === STAGING_ACCOUNT_ID ? "staging" : id === PRODUCTION_ACCOUNT_ID ? "PRODUCTION" : "other")).join(", ")}`);
    if (ids.some((id) => id !== STAGING_ACCOUNT_ID)) problems.push("The staging token can see an account other than staging.");
  } else {
    console.log(`Account list not permitted for the staging token (HTTP ${accounts.status}): fine.`);
  }
  for (const [label, path] of [
    ["production Workers", `/accounts/${PRODUCTION_ACCOUNT_ID}/workers/scripts`],
    ["production KV", `/accounts/${PRODUCTION_ACCOUNT_ID}/storage/kv/namespaces`],
    ["production Pages", `/accounts/${PRODUCTION_ACCOUNT_ID}/pages/projects`],
  ]) {
    const probe = await cf(path, token);
    console.log(`Staging token → ${label} read: HTTP ${probe.status}, success=${probe.success}`);
    if (probe.success) problems.push(`The staging token CAN read ${label}.`);
  }
  const staging = await cf(`/accounts/${STAGING_ACCOUNT_ID}/workers/scripts`, token);
  console.log(`Staging token → staging Workers read: HTTP ${staging.status}, success=${staging.success}`);
  if (!staging.success) problems.push("The staging token cannot read the staging account.");
  return problems;
}

/** The deployed preview Worker may only be bound to the two preview KV namespaces and its own Durable Objects. */
async function checkDeployed() {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const expectedKv = (process.env.EXPECTED_KV_IDS || "").split(",").filter(Boolean);
  const problems = [];
  const settings = await cf(`/accounts/${STAGING_ACCOUNT_ID}/workers/scripts/${PREVIEW_WORKER_NAME}/settings`, token);
  if (!settings.success) return [`Could not read the deployed preview Worker settings (HTTP ${settings.status}).`];
  const bindings = settings.result?.bindings ?? [];
  const productionWrangler = readFileSync(PRODUCTION_WRANGLER, "utf8");
  const prodIds = productionIds(productionWrangler).map((id) => id.toLowerCase());
  const summary = {};
  for (const binding of bindings) {
    summary[binding.type] = (summary[binding.type] ?? 0) + 1;
    if (binding.type === "kv_namespace") {
      if (prodIds.includes(String(binding.namespace_id).toLowerCase())) problems.push(`KV binding ${binding.name} points at a PRODUCTION namespace.`);
      if (expectedKv.length && !expectedKv.includes(binding.namespace_id)) problems.push(`KV binding ${binding.name} is not one of the preview namespaces.`);
    } else if (binding.type === "durable_object_namespace") {
      if (binding.script_name && binding.script_name !== PREVIEW_WORKER_NAME) problems.push(`Durable Object binding ${binding.name} belongs to another Worker (${binding.script_name}).`);
    } else if (["service", "d1", "r2_bucket", "queue", "hyperdrive", "send_email"].includes(binding.type)) {
      problems.push(`Unexpected ${binding.type} binding ${binding.name}.`);
    }
  }
  console.log(`Deployed bindings by type: ${JSON.stringify(summary)}`);
  return problems;
}

async function main() {
  const [mode, arg] = process.argv.slice(2);
  const productionWrangler = readFileSync(PRODUCTION_WRANGLER, "utf8");
  let ok = true;
  if (mode === "--self-test") {
    const template = readFileSync("workers/addresses/wrangler.bespoke-preview.toml", "utf8")
      .replace('name = "reimagined-octo-meme-bespoke-preview"', `name = "${PREVIEW_WORKER_NAME}"`)
      .replaceAll(/REPLACE_WITH_BESPOKE_PREVIEW_TRACKING_STORE_ID/g, "a".repeat(32))
      .replaceAll(/REPLACE_WITH_BESPOKE_PREVIEW_BOOKING_COUNTER_ID/g, "b".repeat(32))
      .replaceAll("REPLACE_WITH_TESTER_EMAIL", "preview-tester@example.invalid");
    ok = selfTest(template, productionWrangler);
  } else if (mode === "--check-workflow") {
    ok = report("workflow uses staging secrets only", assertWorkflowIsStagingOnly(readFileSync(WORKFLOW_FILE, "utf8")));
  } else if (mode === "--check-config") {
    ok = report("preview config is staging-only", assertConfigIsStagingOnly({ config: readFileSync(arg, "utf8"), accountIdEnv: process.env.CLOUDFLARE_ACCOUNT_ID || "", stripeKey: process.env.STRIPE_SECRET_KEY || "", productionWrangler }));
  } else if (mode === "--check-stripe") {
    const problems = [];
    const secret = process.env.STRIPE_SECRET_KEY || "";
    const publishable = process.env.STRIPE_PUBLISHABLE_KEY || "";
    if (secret && !/^(sk|rk)_test_/.test(secret)) problems.push("Stripe secret key is not a TEST key.");
    if (publishable && !/^pk_test_/.test(publishable)) problems.push("Stripe publishable key is not a TEST key.");
    ok = report("Stripe keys are test-mode only", problems);
  } else if (mode === "--probe-token") {
    ok = report("staging token has no production access", await probeToken());
  } else if (mode === "--check-deployed") {
    ok = report("deployed preview Worker bindings are staging-only", await checkDeployed());
  } else {
    console.error("Usage: tours-preview-guard.mjs --self-test | --check-workflow | --check-config <file> | --check-stripe | --probe-token | --check-deployed");
    ok = false;
  }
  process.exit(ok ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
