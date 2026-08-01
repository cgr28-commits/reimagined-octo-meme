import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const aliasWorkerName = "my-airport-taxi-ni";
const defaultAccountId = "36c5c88df4c1f0259413d555f2679f3c";
const workerDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const isWorkersCi = process.env.WORKERS_CI === "1" || process.env.CI === "true";

if (process.env.ENSURING_ALIAS_WORKER === "1") {
  console.log("Alias worker deploy already in progress, skipping nested build step.");
  process.exit(0);
}

console.log(`Ensuring alias worker "${aliasWorkerName}" exists for service binding...`);
console.log(
  "Deploy context:",
  JSON.stringify({
    workersCi: process.env.WORKERS_CI ?? null,
    hasCloudflareApiToken: Boolean(process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN),
    ciOverride: process.env.WRANGLER_CI_OVERRIDE_NAME ?? null,
  }),
);

async function uploadAliasWorkerViaApi() {
  const accountId =
    process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ||
    process.env.CF_ACCOUNT_ID?.trim() ||
    defaultAccountId;
  const token =
    process.env.CLOUDFLARE_API_TOKEN?.trim() || process.env.CF_API_TOKEN?.trim();

  if (!token) {
    return false;
  }

  const script = `export default {
  fetch() {
    return new Response("ok", { status: 200 });
  },
};`;

  const metadata = JSON.stringify({
    main_module: "index.js",
    compatibility_date: "2024-11-01",
    bindings: [],
  });

  const form = new FormData();
  form.append(
    "metadata",
    new Blob([metadata], { type: "application/json" }),
    "metadata.json",
  );
  form.append(
    "index.js",
    new Blob([script], { type: "application/javascript+module" }),
    "index.js",
  );

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${aliasWorkerName}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: form,
    },
  );

  const payload = await response.json();

  if (!response.ok || !payload.success) {
    throw new Error(
      `Cloudflare API upload failed: ${JSON.stringify(payload.errors ?? payload)}`,
    );
  }

  console.log(`Alias worker "${aliasWorkerName}" uploaded via Cloudflare API.`);
  return true;
}

function uploadAliasWorkerViaWrangler() {
  const aliasEnv = { ...process.env, ENSURING_ALIAS_WORKER: "1" };
  delete aliasEnv.WRANGLER_CI_OVERRIDE_NAME;

  execSync(`npx wrangler deploy --config wrangler.alias.toml --name ${aliasWorkerName}`, {
    cwd: workerDir,
    stdio: "inherit",
    env: aliasEnv,
  });

  console.log(`Alias worker "${aliasWorkerName}" deployed via Wrangler.`);
}

try {
  const uploadedViaApi = await uploadAliasWorkerViaApi();

  if (!uploadedViaApi) {
    uploadAliasWorkerViaWrangler();
  }
} catch (error) {
  if (isWorkersCi) {
    console.error(
      `Alias worker deploy failed in Workers CI: ${error instanceof Error ? error.message : error}`,
    );
    process.exit(1);
  }

  console.log("Alias worker deploy skipped locally (no Cloudflare credentials).");
}
