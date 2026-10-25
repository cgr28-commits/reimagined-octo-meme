/**
 * WhatsApp Business API quote assistant — webhook security, parsing and conversation flow.
 * Run: npx tsx scripts/check-whatsapp-quote-bot.ts
 */

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import {
  normalizeWhatsAppNumber,
  parseWhatsAppWebhook,
  sendWhatsAppText,
  verifyWhatsAppSignature,
  whatsAppCloudConfigured,
  whatsAppVerifyChallenge,
} from "../shared/whatsapp-cloud";
import {
  decideWhatsAppReply,
  detectWhatsAppIntent,
  extractClockTimes,
  parseWeekdayDate,
  whatsAppDraftToQuoteBody,
  type WhatsAppConversation,
} from "../shared/whatsapp-quote-bot";
import { addCalendarDays } from "../shared/quick-quote-parse";
import { todayLondonDate } from "../shared/uk-time";
import { processWhatsAppWebhook } from "../workers/addresses/src/whatsapp-handlers";

async function main() {
  // Wednesday 2026-10-28 09:00 London (GMT).
  const now = new Date("2026-10-28T09:00:00Z");

  console.log("=== Signature ===");
  const secret = "app-secret";
  const body = JSON.stringify({ hello: "world" });
  const sig = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  assert.equal(await verifyWhatsAppSignature(body, sig, secret), true);
  assert.equal(await verifyWhatsAppSignature(body + " ", sig, secret), false);
  assert.equal(await verifyWhatsAppSignature(body, sig, "other"), false);
  assert.equal(await verifyWhatsAppSignature(body, null, secret), false);
  assert.equal(await verifyWhatsAppSignature(body, "sha1=abc", secret), false);

  console.log("=== Verify handshake ===");
  const ok = new URL("https://x/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=tok&hub.challenge=123");
  assert.equal(whatsAppVerifyChallenge(ok, "tok"), "123");
  assert.equal(whatsAppVerifyChallenge(ok, "nope"), null);
  assert.equal(
    whatsAppVerifyChallenge(new URL("https://x/?hub.mode=unsubscribe&hub.verify_token=tok&hub.challenge=1"), "tok"),
    null,
  );

  console.log("=== Config gate ===");
  assert.equal(whatsAppCloudConfigured({}), false);
  assert.equal(
    whatsAppCloudConfigured({
      WHATSAPP_ACCESS_TOKEN: "a",
      WHATSAPP_PHONE_NUMBER_ID: "b",
      WHATSAPP_APP_SECRET: "c",
      WHATSAPP_VERIFY_TOKEN: "d",
    }),
    true,
  );
  assert.equal(normalizeWhatsAppNumber("+44 7700 900123"), "447700900123");

  console.log("=== Webhook payload parsing ===");
  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              contacts: [{ wa_id: "447700900123", profile: { name: "Sam Taylor" } }],
              messages: [
                { id: "wamid.1", from: "447700900123", timestamp: "1", type: "text", text: { body: " hi " } },
                { id: "wamid.2", from: "447700900123", timestamp: "2", type: "image" },
              ],
              statuses: [{ id: "wamid.out", status: "delivered" }],
            },
          },
          {
            field: "smb_message_echoes",
            value: { message_echoes: [{ id: "wamid.3", from: "447549815538", to: "447700900999", timestamp: "3" }] },
          },
        ],
      },
    ],
  };
  const parsed = parseWhatsAppWebhook(payload);
  assert.equal(parsed.messages.length, 2);
  assert.deepEqual(
    { ...parsed.messages[0] },
    { id: "wamid.1", from: "447700900123", profileName: "Sam Taylor", timestamp: 1, type: "text", text: "hi" },
  );
  assert.equal(parsed.messages[1].text, "");
  assert.deepEqual(parsed.echoes, [{ id: "wamid.3", to: "447700900999", timestamp: 3 }]);
  assert.deepEqual(parseWhatsAppWebhook({ object: "page" }), { messages: [], echoes: [] });

  console.log("=== Date / time helpers ===");
  assert.deepEqual(extractClockTimes("Friday at 5am"), ["05:00"]);
  assert.deepEqual(extractClockTimes("14/11/2026 05:00"), ["05:00"], "year is never a time");
  assert.deepEqual(extractClockTimes("out 5.30pm back 17:45"), ["17:30", "17:45"]);
  assert.deepEqual(extractClockTimes("14.11.2026"), []);
  assert.equal(parseWeekdayDate("on Friday", now), "2026-10-30");
  assert.equal(parseWeekdayDate("wednesday", now), "2026-11-04", "same weekday means next week");
  assert.equal(parseWeekdayDate("Sunnyside Road", now), null);

  console.log("=== Intents ===");
  assert.equal(detectWhatsAppIntent("YES!"), "confirm");
  assert.equal(detectWhatsAppIntent("agent"), "agent");
  assert.equal(detectWhatsAppIntent("can I speak to a human"), "agent");
  assert.equal(detectWhatsAppIntent("new"), "reset");
  assert.equal(detectWhatsAppIntent("yes from BT1 to BFS"), null);

  console.log("=== Greeting ===");
  let d = decideWhatsAppReply(null, "Hi", { now, profileName: "Sam Taylor" });
  assert.equal(d.action, "none");
  assert.match(d.reply, /^Hi Sam, thanks for messaging My Airport Taxi NI/);

  console.log("=== One message with everything ===");
  d = decideWhatsAppReply(
    null,
    "How much from BT9 6AA to Belfast International on Friday at 5am, 2 passengers 2 suitcases, one way",
    { now },
  );
  assert.equal(d.conversation.stage, "confirming");
  assert.equal(d.conversation.draft.outboundDate, "2026-10-30");
  assert.equal(d.conversation.draft.outboundTime, "05:00");
  assert.equal(d.conversation.draft.airportCode, "BFS");
  assert.equal(d.conversation.draft.fromAirport, false);
  assert.match(d.reply, /BT9 6AA/);
  assert.match(d.reply, /Belfast International Airport/);
  assert.match(d.reply, /Fri 30 Oct 2026 at 05:00/);
  assert.match(d.reply, /Reply \*YES\*/);
  d = decideWhatsAppReply(d.conversation, "yes", { now });
  assert.equal(d.action, "quote");
  const quoteBody = whatsAppDraftToQuoteBody(d.conversation.draft);
  assert.equal(quoteBody.journeyMode, "one-way");
  assert.equal(quoteBody.priceSource, "website-pricing-engine");
  assert.equal(quoteBody.vehicleChoice, "Saloon");
  assert.equal(quoteBody.discountType, undefined, "assistant never applies discounts");

  console.log("=== Step-by-step conversation ===");
  let c: WhatsAppConversation | null = null;
  const say = (text: string) => {
    const result = decideWhatsAppReply(c, text, { now });
    c = result.conversation;
    return result;
  };
  say("hello");
  assert.match(say("I need a taxi to Belfast City Airport").reply, /pick you up/);
  assert.equal(c!.awaiting, "pickupAddress");
  assert.match(say("12 Main Street, Lisburn BT28 1AA").reply, /What date/);
  assert.equal(c!.draft.pickupAddress, "12 Main Street, Lisburn BT28 1AA", "bare reply keeps full address");
  assert.equal(c!.draft.dropoffAddress, "Belfast City Airport");
  assert.match(say("tomorrow").reply, /What time/);
  assert.equal(c!.draft.outboundDate, addCalendarDays(todayLondonDate(now), 1));
  assert.match(say("7").reply, /How many passengers/);
  assert.equal(c!.draft.outboundTime, "07:00");
  assert.match(say("blah").reply, /^Sorry, I didn't catch that\. How many passengers/);
  assert.match(say("3").reply, /suitcases/);
  assert.match(say("none").reply, /one way, or do you need a return/);
  assert.equal(c!.draft.suitcases, 0);
  assert.match(say("return please").reply, /date is your return/);
  assert.match(say("5/11/2026").reply, /What time should we pick you up for the return/);
  assert.match(say("6:30pm").reply, /Return:\* Thu 5 Nov 2026 at 18:30/);
  assert.equal(c!.stage, "confirming");

  console.log("=== Corrections after confirming ===");
  assert.match(say("actually 2 passengers").reply, /Passengers:\* 2/);
  assert.equal(c!.stage, "confirming");
  assert.equal(say("yes").action, "quote");

  console.log("=== Switching a quoted one-way to a return ===");
  c = decideWhatsAppReply(
    null,
    "From BT9 6AA to Belfast International on 14/11/2026 at 5am, 2 passengers 2 suitcases, one way",
    { now },
  ).conversation;
  c = { ...c!, stage: "quoted" };
  say("make it a return on 20/11/2026 at 9pm");
  assert.equal(c!.draft.outboundDate, "2026-11-14", "outward leg untouched");
  assert.equal(c!.draft.outboundTime, "05:00");
  assert.equal(c!.draft.returnDate, "2026-11-20");
  assert.equal(c!.draft.returnTime, "21:00");
  assert.equal(c!.stage, "confirming");

  console.log("=== Validation ===");
  d = decideWhatsAppReply(null, "From BT1 1AA to Dublin Airport on 01/10/2026 at 9am, 2 people 1 bag one way", { now });
  assert.match(d.reply, /in the past/);
  assert.equal(d.conversation.draft.outboundDate, undefined);
  d = decideWhatsAppReply(null, "From BT1 1AA to Dublin Airport tomorrow at 9am, 6 people 6 bags one way", { now });
  assert.equal(d.action, "handoff");

  console.log("=== Agent and reset ===");
  assert.equal(decideWhatsAppReply(c, "AGENT", { now }).action, "handoff");
  const reset = decideWhatsAppReply(c, "new", { now });
  assert.deepEqual(reset.conversation.draft, {});
  assert.match(reset.reply, /fixed price/);

  console.log("=== Worker processing (KV + Meta API stubbed) ===");
  const kv = new Map<string, string>();
  const store = {
    async get(key: string, type?: string) {
      const v = kv.get(key);
      if (v == null) return null;
      return type === "json" ? JSON.parse(v) : v;
    },
    async put(key: string, value: string) {
      kv.set(key, value);
    },
  } as unknown as KVNamespace;
  const sent: Array<{ to: string; body: string }> = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    if (String(url).startsWith("https://graph.facebook.com/")) {
      const msg = JSON.parse(String(init?.body));
      sent.push({ to: msg.to, body: msg.text.body });
      return new Response(JSON.stringify({ messages: [{ id: "wamid.out" }] }), { status: 200 });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
  const env = {
    TRACKING_STORE: store,
    WHATSAPP_ACCESS_TOKEN: "t",
    WHATSAPP_PHONE_NUMBER_ID: "123",
    WHATSAPP_APP_SECRET: "s",
    WHATSAPP_VERIFY_TOKEN: "v",
  };
  const ts = String(Math.floor(Date.now() / 1000));
  const inbound = (id: string, text: string, from = "447700900123") => ({
    object: "whatsapp_business_account",
    entry: [{ changes: [{ field: "messages", value: { messages: [{ id, from, timestamp: ts, type: "text", text: { body: text } }] } }] }],
  });
  try {
    await processWhatsAppWebhook(inbound("m1", "hi"), env);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, "447700900123");
    assert.match(sent[0].body, /fixed price/);

    await processWhatsAppWebhook(inbound("m1", "hi"), env);
    assert.equal(sent.length, 1, "redelivered message is ignored");

    // Owner replies from the WhatsApp Business app → assistant pauses for that customer.
    await processWhatsAppWebhook(
      {
        object: "whatsapp_business_account",
        entry: [{ changes: [{ field: "smb_message_echoes", value: { message_echoes: [{ id: "e1", to: "447700900123", timestamp: ts }] } }] }],
      },
      env,
    );
    await processWhatsAppWebhook(inbound("m2", "from BT1 to BFS"), env);
    assert.equal(sent.length, 1, "no bot reply while owner is handling the chat");

    await processWhatsAppWebhook(inbound("m3", "hi", "447700900555"), { ...env, WHATSAPP_BOT_ENABLED: "false" });
    assert.equal(sent.length, 1, "kill switch silences the assistant");

    await processWhatsAppWebhook(inbound("m4", "agent", "447700900777"), env);
    assert.match(sent.at(-1)!.body, /member of our team/);
    assert.ok(kv.has("whatsapp:paused:447700900777"));

    const result = await sendWhatsAppText({}, "1", "x");
    assert.equal(result.sent, false);
  } finally {
    globalThis.fetch = realFetch;
  }

  console.log("\nAll WhatsApp quote assistant checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
