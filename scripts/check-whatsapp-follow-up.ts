/**
 * WhatsApp quote reminder and the quote card's "Send this quote to my WhatsApp".
 * Run: npx tsx scripts/check-whatsapp-follow-up.ts
 */
import assert from "node:assert/strict";
import { decideWhatsAppReply, isWhatsAppSendQuoteMessage } from "../shared/whatsapp-quote-bot";
import {
  WHATSAPP_SEND_QUOTE_HEADER,
  buildWhatsAppJourneyMessage,
  whatsAppSendQuoteHref,
} from "../src/lib/whatsapp-journey-context";
import {
  buildWhatsAppFollowUpText,
  cancelWhatsAppFollowUp,
  deferWhatsAppFollowUp,
  getWhatsAppFollowUp,
  isInsideWhatsAppServiceWindow,
  isWhatsAppFollowUpOptOut,
  listDueWhatsAppFollowUps,
  scheduleWhatsAppFollowUp,
  whatsAppFollowUpDelayMs,
} from "../workers/addresses/src/whatsapp-follow-up";

type Entry = { value: string; metadata?: unknown };
function memoryKv(): KVNamespace {
  const data = new Map<string, Entry>();
  return {
    async get(key: string, type?: string) {
      const hit = data.get(key);
      if (!hit) return null;
      return type === "json" ? JSON.parse(hit.value) : hit.value;
    },
    async put(key: string, value: string, options?: { metadata?: unknown }) {
      data.set(key, { value, metadata: options?.metadata });
    },
    async delete(key: string) {
      data.delete(key);
    },
    async list({ prefix }: { prefix: string }) {
      const keys = [...data.entries()]
        .filter(([k]) => k.startsWith(prefix))
        .map(([name, e]) => ({ name, metadata: e.metadata }));
      return { keys, list_complete: true, cursor: "" };
    },
  } as unknown as KVNamespace;
}

const HOUR = 60 * 60 * 1000;

async function main() {
  // Quote card message: the assistant prices it straight away (no YES step).
  const journey = {
    pickup: "Europa Hotel, Great Victoria St, Belfast BT2 7AP, UK",
    dropoff: "Belfast International Airport, Airport Rd, Aldergrove BT29 4AB, UK",
    tripDate: "2026-11-12",
    tripTime: "06:30",
    returnJourney: false,
    passengers: 2,
    suitcases: 2,
  };
  const sendQuote = buildWhatsAppJourneyMessage(journey, WHATSAPP_SEND_QUOTE_HEADER);
  assert.ok(isWhatsAppSendQuoteMessage(sendQuote));
  const decided = decideWhatsAppReply(null, sendQuote, { now: new Date("2026-10-27T10:00:00Z") });
  assert.equal(decided.action, "quote", "priced without asking YES");
  assert.equal(decided.conversation.draft.airportCode, "BFS");
  assert.equal(decided.conversation.draft.passengers, 2);
  // The normal pre-filled message still asks the customer to confirm.
  const normal = decideWhatsAppReply(null, buildWhatsAppJourneyMessage(journey), { now: new Date("2026-10-27T10:00:00Z") });
  assert.equal(normal.action, "none");
  assert.match(normal.reply, /Reply \*YES\*/);
  assert.match(whatsAppSendQuoteHref(journey), /^https:\/\/wa\.me\/\d+\?text=Hi%2C%20please%20send%20me%20this%20quote/);

  // Delay setting.
  assert.equal(whatsAppFollowUpDelayMs(undefined), 2 * HOUR);
  assert.equal(whatsAppFollowUpDelayMs("3"), 3 * HOUR);
  assert.equal(whatsAppFollowUpDelayMs("0"), null);
  assert.equal(whatsAppFollowUpDelayMs("off"), null);

  // Scheduled after a quote, pushed back while the customer keeps chatting.
  const store = memoryKv();
  const t0 = new Date("2026-10-27T10:00:00Z");
  await scheduleWhatsAppFollowUp(
    store,
    {
      phone: "447700900123",
      name: "Sam Taylor",
      quoteId: "q".repeat(30),
      amountLabel: "£51",
      bookingUrl: "https://www.myairporttaxini.co.uk/book-quote/?id=abc",
      journeyLabel: "Europa Hotel → Belfast International Airport on 12-11-2026",
    },
    2 * HOUR,
    t0,
  );
  assert.deepEqual(await listDueWhatsAppFollowUps(store, new Date(t0.getTime() + HOUR)), []);
  assert.deepEqual(await listDueWhatsAppFollowUps(store, new Date(t0.getTime() + 2 * HOUR)), ["447700900123"]);
  await deferWhatsAppFollowUp(store, "447700900123", 2 * HOUR, new Date(t0.getTime() + 90 * 60 * 1000));
  assert.deepEqual(await listDueWhatsAppFollowUps(store, new Date(t0.getTime() + 2 * HOUR)), [], "pushed back");
  assert.deepEqual(await listDueWhatsAppFollowUps(store, new Date(t0.getTime() + 3.5 * HOUR)), ["447700900123"]);
  await deferWhatsAppFollowUp(store, "447700900999", 2 * HOUR, t0); // no quote: nothing created
  assert.equal(await getWhatsAppFollowUp(store, "447700900999"), null);

  const record = (await getWhatsAppFollowUp(store, "447700900123"))!;
  assert.ok(isInsideWhatsAppServiceWindow(record, new Date(t0.getTime() + 20 * HOUR)));
  assert.ok(!isInsideWhatsAppServiceWindow(record, new Date(t0.getTime() + 25 * HOUR)), "never outside the free window");
  const text = buildWhatsAppFollowUpText(record);
  assert.match(text, /^Hi Sam, just checking in on your quote for Europa Hotel → Belfast International Airport/);
  assert.match(text, /\*£51\*/);
  assert.match(text, /book-quote\/\?id=abc/);

  await cancelWhatsAppFollowUp(store, "447700900123");
  assert.equal(await getWhatsAppFollowUp(store, "447700900123"), null);

  for (const t of ["STOP", "no thanks", "Already booked", "booked elsewhere thanks", "not needed anymore"]) {
    assert.ok(isWhatsAppFollowUpOptOut(t), t);
  }
  for (const t of ["yes", "Can I add a child seat?", "BT9 5AB to BFS"]) {
    assert.ok(!isWhatsAppFollowUpOptOut(t), t);
  }

  console.log("All WhatsApp follow-up checks passed.");
}

void main();
