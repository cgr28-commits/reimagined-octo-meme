#!/usr/bin/env node
// Persistent staging owner key for the tours settings Worker (staging only).
//
// The owner key is the GitHub secret TOURS_PREVIEW_OWNER_KEY. It is never generated per deploy. This script decides, WITHOUT
// printing the key, whether the Worker's TOURS_OWNER_KEY secret needs updating:
//   - missing or shorter than 24 characters  -> fail closed (exit 1)
//   - the deployed Worker already carries this key's marker -> "skip" (no secret update, no key rotation, no propagation race)
//   - otherwise (first deploy, or the GitHub secret was changed) -> "rotate"
// The marker is a plain-text binding TOURS_OWNER_KEY_ID holding 16 hex characters of a domain-separated SHA-256 of the key.
// It exists only in the staging Worker's settings (readable with the staging token); it is NOT served by any endpoint.
import { createHash } from "node:crypto";

export const MIN_KEY_LENGTH = 24;
export const MARKER_BINDING = "TOURS_OWNER_KEY_ID";
const DOMAIN = "tours-owner-key-id/1:";

export const keyId = (key) => createHash("sha256").update(`${DOMAIN}${key}`).digest("hex").slice(0, 16);

/** Pure decision. deployedId is the marker currently on the Worker ("" when the Worker or marker does not exist yet). */
export function planOwnerKey(key, deployedId) {
  if (typeof key !== "string" || key.length === 0) return { action: "fail", reason: "missing" };
  if (key.length < MIN_KEY_LENGTH) return { action: "fail", reason: "too-short" };
  const id = keyId(key);
  return { action: deployedId === id ? "skip" : "rotate", keyId: id };
}

export async function readDeployedMarker({ accountId, workerName, token, fetchImpl = fetch }) {
  const res = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}/settings`, { headers: { authorization: `Bearer ${token}` } });
  if (res.status === 404) return ""; // Worker not deployed yet
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) throw new Error(`Could not read the deployed Worker settings (HTTP ${res.status}).`);
  const b = (body.result?.bindings ?? []).find((x) => x.type === "plain_text" && x.name === MARKER_BINDING);
  return typeof b?.text === "string" ? b.text : "";
}

const HOW_TO_FIX = "Create the GitHub repository secret TOURS_PREVIEW_OWNER_KEY (24+ characters, random) at https://github.com/cgr28-commits/reimagined-octo-meme/settings/secrets/actions";

async function main() {
  const { SETTINGS_OWNER_KEY: key, CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: accountId, TOURS_SETTINGS_WORKER_NAME: workerName } = process.env;
  const early = planOwnerKey(key, "");
  if (early.action === "fail") {
    console.error(`::error::TOURS_PREVIEW_OWNER_KEY is ${early.reason === "missing" ? "missing" : `shorter than ${MIN_KEY_LENGTH} characters`}. The tours settings Worker is not deployed without it (no random fallback). ${HOW_TO_FIX}`);
    process.exit(1);
  }
  let deployed;
  try { deployed = await readDeployedMarker({ accountId, workerName, token }); } catch (e) { console.error(`::error::${e.message}`); process.exit(2); }
  const plan = planOwnerKey(key, deployed);
  console.log(`${plan.action} ${plan.keyId}`); // "skip|rotate <16 hex marker>"; the key itself is never printed
}
if (import.meta.url === `file://${process.argv[1]}`) await main();
