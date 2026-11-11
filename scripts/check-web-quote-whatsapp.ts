/**
 * Website "Send me my quote" WhatsApp message: only sent once approved, to the typed mobile,
 * with the saved-quote link, once per saved quote.
 * Run: npx tsx scripts/check-web-quote-whatsapp.ts
 */
import assert from "node:assert/strict";
import { sendWebQuoteLinkWhatsApp, whatsAppRecipient, whatsAppTemplateDefinitions } from "../workers/addresses/src/whatsapp-templates";

function memoryKv(): KVNamespace {
  const map = new Map<string, string>();
  return {
    async get(key: string, type?: string) { const v = map.get(key); return v === undefined ? null : type === "json" ? JSON.parse(v) : v; },
    async put(key: string, value: string) { map.set(key, value); },
    async delete(key: string) { map.delete(key); },
  } as unknown as KVNamespace;
}
type Call = { url: string; body?: Record<string, unknown> };
function fake360(statuses: Record<string, string>, calls: Call[]): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url.includes("/v1/configs/templates")) {
      return new Response(JSON.stringify({ waba_templates: Object.entries(statuses).map(([name, status]) => ({ name, status, language: "en_GB" })) }), { status: 200 });
    }
    if (url.endsWith("/messages")) return new Response(JSON.stringify({ messages: [{ id: "wamid.test" }] }), { status: 200 });
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
}
const input = {
  savedQuoteToken: "tok_0123456789abcdef0123456789abcdef",
  mobile: "07700 900123",
  journeyLabel: "Belfast City Hall to Dublin Airport Terminal 1",
  whenLabel: "Fri 27 Nov at 14:00",
  amountLabel: "£261",
  heldUntilLabel: "Wed 18 Nov, 02:40",
};

(async () => {
  const def = whatsAppTemplateDefinitions().find((d) => d.name === "mat_web_quote_link");
  assert.ok(def, "template is defined for Meta submission");
  const body = def!.components.find((c) => c.type === "BODY") as { text: string };
  assert.equal(new Set(body.text.match(/\{\{\d+\}\}/g)).size, 4);
  assert.doesNotMatch(body.text, /calling/i, "website wording, not the phone-call wording");
  assert.match(JSON.stringify(def!.components), /\/quote\/\?t=\{\{1\}\}/, "button opens the saved quote");
  console.log("OK  template: 4 details, website wording, saved-quote button");

  // Not approved yet → nothing is sent.
  let calls: Call[] = [];
  let env = { TRACKING_STORE: memoryKv(), D360_API_KEY: "k", WHATSAPP_PROVIDER: "360dialog" } as never;
  let r = await sendWebQuoteLinkWhatsApp(env, input, fake360({ mat_web_quote_link: "submitted" }, calls));
  assert.equal(r.sent, false);
  assert.equal(calls.filter((c) => c.url.endsWith("/messages")).length, 0);
  console.log("OK  not approved by Meta yet → no message sent");

  // Approved → one message to the typed mobile with the details and link token.
  calls = [];
  env = { TRACKING_STORE: memoryKv(), D360_API_KEY: "k", WHATSAPP_PROVIDER: "360dialog" } as never;
  const fetchOk = fake360({ mat_web_quote_link: "approved" }, calls);
  r = await sendWebQuoteLinkWhatsApp(env, input, fetchOk);
  assert.equal(r.sent, true);
  const sent = calls.filter((c) => c.url.endsWith("/messages"));
  assert.equal(sent.length, 1);
  const text = JSON.stringify(sent[0].body);
  assert.match(text, new RegExp(whatsAppRecipient(input.mobile)));
  for (const part of ["mat_web_quote_link", input.journeyLabel, input.whenLabel, input.amountLabel, input.heldUntilLabel, input.savedQuoteToken]) {
    assert.ok(text.includes(part), `message carries ${part}`);
  }
  console.log("OK  approved → sent to the typed mobile with journey, time, price, held-until and link");

  // Same saved quote again → not sent twice.
  r = await sendWebQuoteLinkWhatsApp(env, input, fetchOk);
  assert.equal(r.sent, false);
  assert.equal(calls.filter((c) => c.url.endsWith("/messages")).length, 1);
  console.log("OK  the same saved quote is never messaged twice");

  // Landline / invalid number → nothing sent.
  calls = [];
  r = await sendWebQuoteLinkWhatsApp(env, { ...input, savedQuoteToken: "tok_other", mobile: "028 9602 2952" }, fake360({ mat_web_quote_link: "approved" }, calls));
  assert.equal(r.sent, false);
  assert.equal(calls.filter((c) => c.url.endsWith("/messages")).length, 0);
  console.log("OK  landlines and invalid numbers are refused");
  console.log("OK  web quote WhatsApp");
})().catch((e) => { console.error(e); process.exit(1); });
