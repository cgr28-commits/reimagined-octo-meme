/** "Your quote is waiting" follow-up: queued on contact leads, sent once ~1 hour later. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  QUOTE_FOLLOWUP_QUEUE_KEY,
  buildQuoteFollowUpEmail,
  enqueueQuoteContactFollowUp,
  processQuoteContactFollowUps,
  type QuoteFollowUpEntry,
} from "../workers/addresses/src/quote-contact-followup";
import type { QuoteLeadDetails } from "../shared/quote-lead";
import { paidBookingCreatedDayIndexKey } from "../workers/addresses/shared/paid-booking-record";

function memoryStore() {
  const kv = new Map<string, string>();
  let reads = 0;
  const store = {
    kv,
    reads: () => reads,
    async get(key: string, type?: string) {
      reads++;
      const v = kv.get(key);
      if (v == null) return null;
      return type === "json" ? JSON.parse(v) : v;
    },
    async put(key: string, value: string) {
      kv.set(key, value);
    },
    async delete(key: string) {
      kv.delete(key);
    },
    async list(opts: { prefix?: string } = {}) {
      const keys = [...kv.keys()].filter((k) => k.startsWith(opts.prefix ?? "")).map((name) => ({ name }));
      return { keys, list_complete: true, cursor: undefined };
    },
  };
  return store;
}

const details = (overrides: Partial<QuoteLeadDetails> = {}): QuoteLeadDetails => ({
  tripLabel: "Airport drop-off",
  pickupLabel: "City Hall, Belfast",
  dropoffLabel: "Dublin Airport",
  returnJourney: false,
  tripDate: "2026-12-01",
  passengers: 2,
  suitcases: 2,
  vehicle: "Saloon (1–4 passengers)",
  estimatedPrice: "£236",
  isAirportTrip: true,
  quoteTransactionId: "txn-1",
  customerName: "Sarah Jones",
  customerEmail: "sarah@example.com",
  ...overrides,
});

const sent: Array<Record<string, unknown>> = [];
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname === "api.resend.com") {
    sent.push(JSON.parse(String(init?.body ?? "{}")));
    return Response.json({ id: "mock" });
  }
  throw new Error(`Unexpected request ${url.href}`);
}) as typeof fetch;

async function main() {
  const store = memoryStore();
  const env = { TRACKING_STORE: store as unknown as KVNamespace, RESEND_API_KEY: "test", SITE_ORIGIN: "https://www.myairporttaxini.co.uk" };
  const t0 = new Date("2026-11-02T18:00:00Z");

  // Queues once per quote and once a day per email; ignores missing/bad emails.
  assert.equal(await enqueueQuoteContactFollowUp(env.TRACKING_STORE, details(), t0), true);
  assert.equal(await enqueueQuoteContactFollowUp(env.TRACKING_STORE, details(), t0), false, "same quote not queued twice");
  assert.equal(await enqueueQuoteContactFollowUp(env.TRACKING_STORE, details({ quoteTransactionId: "txn-2" }), t0), false, "same email within a day");
  assert.equal(await enqueueQuoteContactFollowUp(env.TRACKING_STORE, details({ quoteTransactionId: "txn-3", customerEmail: "" }), t0), false);
  assert.equal(await enqueueQuoteContactFollowUp(env.TRACKING_STORE, details({ quoteTransactionId: "txn-4", customerEmail: "not-an-email" }), t0), false);

  // Not due yet: one read, nothing sent.
  const before = store.reads();
  let r = await processQuoteContactFollowUps(env, new Date(t0.getTime() + 30 * 60 * 1000));
  assert.equal(r.sent, 0);
  assert.equal(store.reads() - before, 1, "an idle run costs a single KV read");

  // Due: sent once, with a link back to the quote, never again.
  r = await processQuoteContactFollowUps(env, new Date(t0.getTime() + 61 * 60 * 1000));
  assert.equal(r.sent, 1);
  assert.equal(sent.length, 1);
  assert.match(String(sent[0].subject), /Your transfer quote is waiting/);
  assert.match(String(sent[0].text), /City Hall, Belfast → Dublin Airport/);
  assert.match(String(sent[0].text), /£236/);
  assert.match(String(sent[0].text), /myairporttaxini\.co\.uk\/#quote/);
  r = await processQuoteContactFollowUps(env, new Date(t0.getTime() + 120 * 60 * 1000));
  assert.equal(r.sent, 0, "only one follow-up per quote");

  // Skipped when they have since booked.
  const store2 = memoryStore();
  const env2 = { ...env, TRACKING_STORE: store2 as unknown as KVNamespace };
  await enqueueQuoteContactFollowUp(env2.TRACKING_STORE, details({ quoteTransactionId: "txn-b", customerEmail: "booked@example.com" }), t0);
  const ref = "PAY-1";
  // listRecentPaidBookings reads the index for the real London "today".
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  store2.kv.set(`booking:ref:${ref}`, JSON.stringify({ paymentReference: ref, customerEmail: "Booked@example.com", createdAt: "2026-11-02T18:20:00Z", status: "confirmed" }));
  store2.kv.set(`booking:index:created-day-backfilled:v1`, "x");
  // Created-day index key as written by savePaidBookingRecord.
  store2.kv.set(paidBookingCreatedDayIndexKey(day), JSON.stringify([ref]));
  r = await processQuoteContactFollowUps(env2, new Date(t0.getTime() + 61 * 60 * 1000));
  assert.equal(r.sent, 0);
  assert.equal(r.skipped, 1, "no follow-up after they booked");

  // Skipped when the pickup is too close.
  const store3 = memoryStore();
  const env3 = { ...env, TRACKING_STORE: store3 as unknown as KVNamespace };
  await enqueueQuoteContactFollowUp(env3.TRACKING_STORE, details({ quoteTransactionId: "txn-c", tripDate: "2026-11-02", tripTime: "21:00" }), t0);
  r = await processQuoteContactFollowUps(env3, new Date(t0.getTime() + 61 * 60 * 1000));
  assert.equal(r.skipped, 1, "no follow-up when pickup is under 3 hours away");
  const q3 = JSON.parse(store3.kv.get(QUOTE_FOLLOWUP_QUEUE_KEY)!) as QuoteFollowUpEntry[];
  assert.match(String(q3[0].skipped), /too soon/);

  // Email copy.
  const email = buildQuoteFollowUpEmail({
    entry: { ...q3[0], name: "Sarah Jones" },
    url: "https://example.com/book",
    priceLabel: "£230",
  });
  assert.match(email.text, /^Hi Sarah,/);
  assert.match(email.text, /Your fixed price of £230 is ready to book/);
  assert.match(email.html, /Book my transfer/);
  assert.doesNotMatch(email.text + email.html, /Mercedes/);

  // Wiring.
  const index = readFileSync("workers/addresses/src/index.ts", "utf8");
  assert.match(index, /kind === "contact"[\s\S]{0,200}enqueueQuoteContactFollowUp/);
  assert.match(index, /processQuoteContactFollowUps\(env/);

  console.log("check-quote-contact-followup: OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
