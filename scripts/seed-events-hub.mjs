/**
 * Adds the owner-approved events in src/data/events-hub-seed.json to the live Events list
 * (dashboard → Events) and publishes them. Safe to re-run: events that already exist are
 * left alone (so later dashboard edits are never overwritten).
 *
 * Needs OWNER_ACCESS_KEY. Waits for the Worker that accepts Dublin venues to be deployed.
 */
import { readFileSync } from "node:fs";

const BASE = (process.env.WORKER_BASE_URL || "https://reimagined-octo-meme.cgr28.workers.dev").replace(/\/$/, "");
const KEY = process.env.OWNER_ACCESS_KEY || "";
if (!KEY) {
  console.error("OWNER_ACCESS_KEY is missing.");
  process.exit(1);
}
const seed = JSON.parse(readFileSync(new URL("../src/data/events-hub-seed.json", import.meta.url), "utf8"));
const headers = { "Content-Type": "application/json", Accept: "application/json", "X-Owner-Key": KEY };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function action(body) {
  const res = await fetch(`${BASE}/owner/belfast-events/action`, { method: "POST", headers, body: JSON.stringify(body) });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

let added = 0;
let skipped = 0;
for (const event of seed.events) {
  const fields = { ...event, ownWordsConfirmed: true, sourceNote: "Added by Claude for the owner, 15 Nov 2026" };
  let created = null;
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const r = await action({ action: "create", fields });
    if (r.status === 201) {
      created = r.json.record;
      break;
    }
    if (r.status === 409) break;
    // 400 on a Dublin venue = the new Worker isn't deployed yet: wait and retry.
    console.log(`Waiting for the Worker (${event.title} ${event.date}: ${r.status} ${JSON.stringify(r.json.errors || r.json.error || "")})`);
    await sleep(30_000);
  }
  if (!created) {
    skipped += 1;
    console.log(`Already listed: ${event.title} ${event.date}`);
    continue;
  }
  const p = await action({ action: "publish", id: created.id, expectedVersion: created.version });
  if (p.status !== 200) {
    console.error(`Publish failed for ${created.id}: ${p.status} ${JSON.stringify(p.json)}`);
    process.exit(1);
  }
  added += 1;
  console.log(`Added and published: ${created.id}`);
}
console.log(`Done: ${added} added, ${skipped} already listed.`);
