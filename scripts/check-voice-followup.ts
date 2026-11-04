/** Dropped phone calls: one WhatsApp follow-up with the quote tool link, only with consent. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  VOICE_FOLLOWUP_QUEUE_KEY,
  handleVoiceCallEnded,
  markVoiceLinkSent,
  processVoiceFollowUps,
  ukMobileForFollowUp,
} from "../workers/addresses/src/voice-followup";
import { whatsAppTemplateDefinitions } from "../workers/addresses/src/whatsapp-templates";

function memoryStore() {
  const kv = new Map<string, string>();
  let reads = 0;
  return {
    kv,
    reads: () => reads,
    async get(key: string, type?: string) { reads++; const v = kv.get(key); return v == null ? null : type === "json" ? JSON.parse(v) : v; },
    async put(key: string, value: string) { kv.set(key, value); },
    async delete(key: string) { kv.delete(key); },
  };
}

const sent: Array<Record<string, unknown>> = [];
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.pathname.endsWith("/v1/configs/templates")) {
    return Response.json({ waba_templates: [{ name: "mat_call_followup", status: "APPROVED", language: "en_GB" }] });
  }
  if (url.pathname.endsWith("/messages")) { sent.push(JSON.parse(String(init?.body))); return Response.json({ messages: [{ id: "m1" }] }); }
  throw new Error(`Unexpected ${url.href}`);
}) as typeof fetch;

const call = (body: Record<string, unknown>) =>
  new Request("https://w/voice/call-ended", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });

async function main() {
  assert.equal(ukMobileForFollowUp("07700 900123"), "447700900123");
  assert.equal(ukMobileForFollowUp("+447700900123"), "447700900123");
  assert.equal(ukMobileForFollowUp("02896022952"), "", "landlines never get WhatsApp");
  assert.equal(ukMobileForFollowUp("{{fromNumber}}"), "");

  const store = memoryStore();
  const env = { TRACKING_STORE: store as unknown as KVNamespace, D360_API_KEY: "k" };
  const t0 = new Date("2026-11-04T13:41:00Z");

  // No consent → nothing queued.
  let r = await (await handleVoiceCallEnded(call({ fromNumber: "07700900123", followUpConsent: "no" }), env, t0)).json();
  assert.equal(r.queued, false);
  // Existing-booking call → nothing.
  r = await (await handleVoiceCallEnded(call({ fromNumber: "07700900123", followUpConsent: "yes", existingBooking: "yes" }), env, t0)).json();
  assert.equal(r.queued, false);
  // Landline → nothing.
  r = await (await handleVoiceCallEnded(call({ fromNumber: "02890000000", followUpConsent: "yes" }), env, t0)).json();
  assert.equal(r.queued, false);

  // Consent, dropped before a link (fonio may wrap variables) → queued once.
  r = await (await handleVoiceCallEnded(call({ fromNumber: "07700900123", variables: { followup_consent: "Yes", name: "Marta Kowalska", pickup: "Dublin Airport, Co. Dublin", destination: "West Belfast" } }), env, t0)).json();
  assert.equal(r.queued, true);
  r = await (await handleVoiceCallEnded(call({ fromNumber: "07700900123", followUpConsent: "yes" }), env, t0)).json();
  assert.equal(r.queued, false, "one follow-up per number per day");

  // Not due for 5 minutes; idle run is one read.
  const before = store.reads();
  let p = await processVoiceFollowUps(env, new Date(t0.getTime() + 2 * 60 * 1000));
  assert.equal(p.sent, 0);
  assert.equal(store.reads() - before, 1);

  p = await processVoiceFollowUps(env, new Date(t0.getTime() + 6 * 60 * 1000));
  assert.equal(p.sent, 1);
  assert.equal(sent.length, 1);
  const msg = sent[0] as { to: string; template: { name: string; components: Array<{ parameters: Array<{ text: string }> }> } };
  assert.equal(msg.to, "447700900123");
  assert.equal(msg.template.name, "mat_call_followup");
  assert.deepEqual(msg.template.components[0].parameters.map((x) => x.text), ["Marta", "a taxi from Dublin Airport to West Belfast"]);
  p = await processVoiceFollowUps(env, new Date(t0.getTime() + 20 * 60 * 1000));
  assert.equal(p.sent, 0, "never twice");

  // Caller who got the booking link on the call is never chased.
  const s2 = memoryStore();
  const env2 = { ...env, TRACKING_STORE: s2 as unknown as KVNamespace };
  await markVoiceLinkSent(env2.TRACKING_STORE, "07700900456");
  r = await (await handleVoiceCallEnded(call({ fromNumber: "+447700900456", followUpConsent: "yes" }), env2, t0)).json();
  assert.equal(r.queued, false);
  assert.equal(r.reason, "link sent on call");
  assert.equal(JSON.parse(s2.kv.get(VOICE_FOLLOWUP_QUEUE_KEY) ?? "[]").length, 0);

  // Template is defined with a static quote-tool button.
  const def = whatsAppTemplateDefinitions().find((d) => d.name === "mat_call_followup");
  assert.ok(def);
  assert.match(JSON.stringify(def), /Get my price/);
  assert.match(JSON.stringify(def), /myairporttaxini\.co\.uk\/\?src=call#quote/);

  const index = readFileSync("workers/addresses/src/index.ts", "utf8");
  assert.match(index, /\/voice\/call-ended/);
  assert.match(index, /processVoiceFollowUps\(env/);
  assert.match(readFileSync("workers/addresses/src/voice-quote.ts", "utf8"), /markVoiceLinkSent\(store, digits\)/);
  console.log("check-voice-followup: OK");
}
main().catch((e) => { console.error(e); process.exit(1); });
