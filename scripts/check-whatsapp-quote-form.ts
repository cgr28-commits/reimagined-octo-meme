/**
 * Checks for the in-WhatsApp quote form (12 Nov 2026): the encrypted data endpoint (playing
 * WhatsApp's part with the public key), each screen, sending the form, and a submitted form
 * being priced in the chat.
 *
 *   npx tsx scripts/check-whatsapp-quote-form.ts
 */
import assert from "node:assert/strict";
import { parseWhatsAppWebhook } from "../shared/whatsapp-cloud";
import { WHATSAPP_QUOTE_FORM_JSON, type QuoteFormSession } from "../shared/whatsapp-quote-form";
import { isWhatsAppQuoteFormRequest, processWhatsAppWebhook } from "../workers/addresses/src/whatsapp-handlers";
import {
  answerQuoteFormRequest,
  getQuoteFormKeyPair,
  handleQuoteFormRequest,
  quoteFormSessionKey,
} from "../workers/addresses/src/whatsapp-quote-form-endpoint";

function memoryStore() {
  const kv = new Map<string, string>();
  return {
    kv,
    store: {
      async get(key: string, type?: string) {
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
      async list() {
        return { keys: [], list_complete: true };
      },
    } as never as KVNamespace,
  };
}

const b64 = (u8: ArrayBuffer | Uint8Array) => Buffer.from(u8 instanceof Uint8Array ? u8 : new Uint8Array(u8)).toString("base64");
const unb64 = (s: string) => new Uint8Array(Buffer.from(s, "base64"));

/** Encrypt a request the way WhatsApp does, with our public key. */
async function asWhatsApp(publicKeyPem: string, body: unknown) {
  const der = unb64(publicKeyPem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""));
  const pub = await crypto.subtle.importKey("spki", der, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
  const rawAes = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aes = await crypto.subtle.importKey("raw", rawAes, "AES-GCM", false, ["encrypt", "decrypt"]);
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aes, new TextEncoder().encode(JSON.stringify(body)));
  const encKey = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, pub, rawAes);
  return {
    request: { encrypted_flow_data: b64(data), encrypted_aes_key: b64(encKey), initial_vector: b64(iv) },
    async read(text: string) {
      const flipped = iv.map((b) => ~b & 0xff);
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: flipped }, aes, unb64(text));
      return JSON.parse(new TextDecoder().decode(plain));
    },
  };
}

const post = (body: unknown) =>
  new Request("https://w.test/whatsapp/quote-form", { method: "POST", body: JSON.stringify(body) });

async function main() {
  // --- The Flow JSON: every routed screen exists; the last one submits.
  const ids = WHATSAPP_QUOTE_FORM_JSON.screens.map((s) => s.id);
  for (const [from, to] of Object.entries(WHATSAPP_QUOTE_FORM_JSON.routing_model)) {
    assert.ok(ids.includes(from as never), from);
    for (const t of to) assert.ok(ids.includes(t as never), t);
  }
  const last = WHATSAPP_QUOTE_FORM_JSON.screens.at(-1)!;
  assert.equal(last.id, "SUMMARY");
  assert.equal((last as { terminal?: boolean }).terminal, true);
  console.log("OK  form JSON: screens and routes line up");

  // --- One way by default; the return date/time only show once Return is picked.
  const details = WHATSAPP_QUOTE_FORM_JSON.screens.find((s) => s.id === "DETAILS")!;
  const kids = details.layout.children as Array<Record<string, unknown>>;
  const trip = kids.find((c) => c.name === "trip")!;
  assert.equal(trip["init-value"], "one_way");
  const tripOptions = trip["data-source"] as Array<{ id: string; "on-select-action": { payload: { show_return: boolean } } }>;
  assert.equal(tripOptions.find((o) => o.id === "return")!["on-select-action"].payload.show_return, true);
  assert.equal(tripOptions.find((o) => o.id === "one_way")!["on-select-action"].payload.show_return, false);
  for (const name of ["return_date", "return_time"]) {
    assert.equal(kids.find((c) => c.name === name)!.visible, "${data.show_return}", name);
  }
  console.log("OK  return date and time are hidden until Return is picked");

  // --- Encrypted endpoint: health check and opening the form, as WhatsApp sends them.
  const { store, kv } = memoryStore();
  const env = { TRACKING_STORE: store };
  const pair = await getQuoteFormKeyPair(store);
  assert.match(pair.publicKeyPem, /BEGIN PUBLIC KEY/);
  assert.equal((await getQuoteFormKeyPair(store)).privateKey, pair.privateKey, "key pair is kept");

  const ping = await asWhatsApp(pair.publicKeyPem, { version: "3.0", action: "ping" });
  let res = await handleQuoteFormRequest(post(ping.request), env as never);
  assert.equal(res.status, 200);
  assert.deepEqual(await ping.read(await res.text()), { data: { status: "active" } });

  const token = "qf_test";
  const session: QuoteFormSession = {
    phone: "447377515059",
    createdAt: new Date().toISOString(),
    places: {},
    prefill: { pickup: "Boucher Playing Fields", dropoff: "" },
  };
  kv.set(quoteFormSessionKey(token), JSON.stringify(session));
  const init = await asWhatsApp(pair.publicKeyPem, { version: "3.0", action: "INIT", flow_token: token });
  res = await handleQuoteFormRequest(post(init.request), env as never);
  const opened = await init.read(await res.text());
  assert.equal(opened.screen, "JOURNEY");
  assert.equal(opened.data.pickup_init, "Boucher Playing Fields");

  const unknown = await asWhatsApp(pair.publicKeyPem, { version: "3.0", action: "INIT", flow_token: "qf_nope" });
  res = await handleQuoteFormRequest(post(unknown.request), env as never);
  assert.equal(res.status, 427, "an expired form is refused");

  res = await handleQuoteFormRequest(post({ ...ping.request, encrypted_aes_key: b64(new Uint8Array(256)) }), env as never);
  assert.equal(res.status, 421, "undecryptable: WhatsApp refetches the key");
  console.log("OK  encrypted endpoint: health check, opening the form, expired forms, bad keys");

  // --- Screens, with a pretend Google lookup.
  const lookup = async (typed: string) =>
    /boucher/i.test(typed)
      ? [{ placeId: "b1", address: "Boucher Playing Fields, Belfast BT12 6LR" }]
      : /mercantile/i.test(typed)
        ? [{ placeId: "m1", address: "The Mercantile Hotel, 28 Dame St, Dublin 2, D02 EF83, Ireland" }]
        : [];
  const step = (screen: string, data: Record<string, unknown>) =>
    answerQuoteFormRequest(env as never, store, { action: "data_exchange", screen, data, flow_token: token }, lookup);
  let r = await step("JOURNEY", { pickup: "Boucher playing fields", dropoff: "The Mercantile hotel Dublin" });
  assert.equal((r.response as { screen: string }).screen, "ADDRESSES");
  r = await step("ADDRESSES", { pickup_choice: "p1", dropoff_choice: "d1" });
  assert.equal((r.response as { screen: string }).screen, "DETAILS");
  assert.equal((r.response as { data: { show_return: boolean } }).data.show_return, false, "opens on one way");
  r = await step("DETAILS", { date: "2027-05-21", time: "23:00", passengers: "4", suitcases: "0", trip: "one_way" });
  assert.equal((r.response as { screen: string }).screen, "SUMMARY");
  const saved = JSON.parse(kv.get(quoteFormSessionKey(token))!) as QuoteFormSession;
  assert.equal(saved.draft?.dropoffPlaceId, "m1");
  assert.equal(saved.draft?.airportCode, undefined, "a Dublin hotel isn't Dublin Airport");
  console.log("OK  screens: addresses picked from a list, journey ready to price");

  // --- A submitted form arrives as an nfm_reply webhook.
  const submitted = parseWhatsAppWebhook({
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              messages: [
                {
                  id: "wamid.form1",
                  from: "447377515059",
                  timestamp: "1",
                  type: "interactive",
                  interactive: {
                    type: "nfm_reply",
                    nfm_reply: { name: "flow", body: "Sent", response_json: JSON.stringify({ flow_token: token, submitted: "yes" }) },
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  }).messages[0]!;
  assert.equal(submitted.type, "quote_form");
  assert.equal(submitted.formToken, token);
  console.log("OK  submitted form is recognised");

  assert.ok(isWhatsAppQuoteFormRequest("form"));
  assert.ok(isWhatsAppQuoteFormRequest("Send me the form please"));
  assert.ok(!isWhatsAppQuoteFormRequest("I'll fill in the booking form on the website later"));

  // --- In the chat: "form" sends it; submitting it prices the journey.
  const sent: Array<Record<string, unknown>> = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/whatsapp_business_encryption")) return new Response(JSON.stringify({ success: true }));
    if (u.startsWith("https://graph.facebook.com/")) {
      sent.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ messages: [{ id: `wamid.out${sent.length}` }] }), { status: 200 });
    }
    throw new Error(`unexpected fetch ${u}`);
  }) as typeof fetch;
  const chatEnv = {
    TRACKING_STORE: store,
    WHATSAPP_ACCESS_TOKEN: "t",
    WHATSAPP_PHONE_NUMBER_ID: "123",
    WHATSAPP_APP_SECRET: "s",
    WHATSAPP_VERIFY_TOKEN: "v",
    WHATSAPP_QUOTE_FORM: "447377515059",
    WHATSAPP_QUOTE_FORM_ID: "1234567890",
    WHATSAPP_QUOTE_FORM_MODE: "draft",
  };
  const ts = String(Math.floor(Date.now() / 1000));
  const text = (id: string, body: string, from = "447377515059") => ({
    object: "whatsapp_business_account",
    entry: [{ changes: [{ field: "messages", value: { messages: [{ id, from, timestamp: ts, type: "text", text: { body } }] } }] }],
  });
  try {
    await processWhatsAppWebhook(text("wamid.f1", "form"), chatEnv as never);
    const form = sent.at(-1) as { interactive?: { type?: string; action?: { parameters?: Record<string, string> } } };
    assert.equal(form.interactive?.type, "flow");
    assert.equal(form.interactive?.action?.parameters?.flow_id, "1234567890");
    assert.equal(form.interactive?.action?.parameters?.mode, "draft");
    const newToken = form.interactive!.action!.parameters!.flow_token!;
    assert.ok(kv.get(quoteFormSessionKey(newToken)), "form session saved");
    console.log("OK  'form' sends the quote form (pilot number)");

    // Not on the pilot: "form" is just text for the bot (no form sent).
    const before = sent.length;
    await processWhatsAppWebhook(text("wamid.f2", "form", "447700900123"), chatEnv as never);
    assert.ok(sent.slice(before).every((m) => (m as { interactive?: { type?: string } }).interactive?.type !== "flow"));
    console.log("OK  not sent to numbers outside the pilot");

    // Fill it in, then submit.
    const fill = (screen: string, data: Record<string, unknown>) =>
      answerQuoteFormRequest(chatEnv as never, store, { action: "data_exchange", screen, data, flow_token: newToken }, lookup);
    await fill("JOURNEY", { pickup: "Boucher", dropoff: "Mercantile" });
    await fill("ADDRESSES", { pickup_choice: "p1", dropoff_choice: "d1" });
    await fill("DETAILS", { date: "2027-05-21", time: "23:00", passengers: "4", suitcases: "0", trip: "one_way" });
    const n = sent.length;
    await processWhatsAppWebhook(
      {
        object: "whatsapp_business_account",
        entry: [
          {
            changes: [
              {
                field: "messages",
                value: {
                  messages: [
                    {
                      id: "wamid.f3",
                      from: "447377515059",
                      timestamp: ts,
                      type: "interactive",
                      interactive: { type: "nfm_reply", nfm_reply: { response_json: JSON.stringify({ flow_token: newToken }) } },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
      chatEnv as never,
    );
    const convo = JSON.parse(kv.get("whatsapp:convo:447377515059")!);
    assert.equal(convo.draft.pickupPlaceId, "b1");
    assert.equal(convo.draft.dropoffPlaceId, "m1");
    assert.ok(!kv.get(quoteFormSessionKey(newToken)), "form used once");
    assert.ok(sent.length > n, "a reply was sent after the form");
    const after = sent.slice(n).map((m) => JSON.stringify(m)).join("\n");
    assert.doesNotMatch(after, /expired/);
    console.log("OK  submitted form goes on the quote and is priced in the chat");
    console.log(`    reply: ${after.slice(0, 300)}`);

    // Submitting the same form again: expired.
    const m = sent.length;
    await processWhatsAppWebhook(
      {
        object: "whatsapp_business_account",
        entry: [{ changes: [{ field: "messages", value: { messages: [{ id: "wamid.f4", from: "447377515059", timestamp: ts, type: "interactive", interactive: { type: "nfm_reply", nfm_reply: { response_json: JSON.stringify({ flow_token: newToken }) } } }] } }] }],
      },
      chatEnv as never,
    );
    assert.match(JSON.stringify(sent.slice(m)), /expired/);
    console.log("OK  a form can't be submitted twice");
  } finally {
    globalThis.fetch = realFetch;
  }
  console.log("\nAll quote form checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
