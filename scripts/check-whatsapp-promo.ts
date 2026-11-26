import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { savePromoSettings, type PromoDb } from "../workers/addresses/src/promo-store";
import { extractWhatsAppEmail, handleWhatsAppPromoMessage, isWhatsAppPromoRequest } from "../workers/addresses/src/whatsapp-promo";

let failed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  try { await fn(); console.log(`✓ ${name}`); } catch (e) { failed++; console.error(`✗ ${name}\n  ${(e as Error).message}`); }
}

// D1 shim over node:sqlite + the real migration; KV shim.
const sqlite = new DatabaseSync(":memory:");
sqlite.exec(readFileSync("workers/addresses/migrations/driver-db/0005_promo_codes.sql", "utf8"));
const make = (sql: string, values: unknown[] = []): unknown => ({
  bind: (...v: unknown[]) => make(sql, v),
  first: async () => sqlite.prepare(sql).get(...(values as never[])) ?? null,
  all: async () => ({ results: sqlite.prepare(sql).all(...(values as never[])) }),
  run: async () => sqlite.prepare(sql).run(...(values as never[])),
});
const d1 = { prepare: (sql: string) => make(sql) } as unknown as PromoDb;
const kvData = new Map<string, string>();
const kv = {
  async get(k: string, type?: string) { const v = kvData.get(k); return v === undefined ? null : type === "json" ? JSON.parse(v) : v; },
  async put(k: string, v: string) { kvData.set(k, v); },
  async delete(k: string) { kvData.delete(k); },
};
const env = { DRIVER_DB: d1, TRACKING_STORE: kv, PROMO_HASH_SECRET: "s", PROMO_PREVIEW_MODE: "1" } as never;
const ask = (phone: string, text: string) => handleWhatsAppPromoMessage(env, phone, text);

async function main() {
await check("recognises code requests, ignores ordinary chat and the book-now 5% offer", () => {
  for (const t of ["Can I get the promo code?", "do you have a discount code", "I saw the Christmas gift offer", "send me the 5% code", "voucher please"]) assert.ok(isWhatsAppPromoRequest(t), t);
  for (const t of ["Belfast airport to Lisburn tomorrow", "I'd like to book with the 5% discount", "any discount?", "thanks"]) assert.ok(!isWhatsAppPromoRequest(t), t);
  assert.equal(extractWhatsAppEmail("it's Jo.Bloggs+x@Example.co.uk thanks"), "jo.bloggs+x@example.co.uk");
});
await check("not about a code: no reply (assistant carries on)", async () => {
  assert.equal(await ask("447700900001", "Dublin airport to Belfast on Friday"), null);
});
await check("asks for the email, then sends the code in the chat", async () => {
  const q = await ask("447700900002", "Can I get the promo code?");
  assert.match(q!, /email address/i);
  const a = await ask("447700900002", "jo@example.com");
  assert.match(a!, /Here's your \d+% off code: \*[A-Z0-9-]+\*/);
  assert.match(a!, /before 1 June 2027/);
  assert.match(a!, /Have a promo code\?/);
});
await check("email in the same message sends the code straight away", async () => {
  assert.match((await ask("447700900003", "promo code please, sam@example.com"))!, /off code: \*/);
});
await check("bad email is asked for again", async () => {
  await ask("447700900004", "discount code");
  assert.match((await ask("447700900004", "jo@example"))!, /doesn't look like an email|name@example/i);
});
await check("same number cannot collect codes for other emails", async () => {
  assert.match((await ask("447700900002", "promo code other@example.com"))!, /already been sent to this number/);
});
await check("same email asking again is pointed to the code already sent", async () => {
  assert.match((await ask("447700900002", "promo code jo@example.com"))!, /already sent your code/);
});
await check("promo switched off: no code", async () => {
  await savePromoSettings(d1, { enabled: false }, new Date());
  assert.match((await ask("447700900009", "promo code zed@example.com"))!, /no offer code running/i);
});
if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
  console.log("\nAll WhatsApp promo checks passed");
}
main();
