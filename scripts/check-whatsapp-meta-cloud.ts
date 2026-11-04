/**
 * Meta Cloud API provider path: send target, HTTP retries, template list/submit/send,
 * webhook signature behaviour, and no cross-provider fallback.
 * Run: npx tsx scripts/check-whatsapp-meta-cloud.ts
 */

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import {
  isRetriableWhatsAppHttpStatus,
  parseWhatsAppWebhook,
  postWhatsAppMessage,
  resolveWhatsAppProvider,
  sendWhatsAppText,
  verifyWhatsAppSignature,
  whatsAppCloudConfigured,
  whatsAppSendTarget,
  whatsAppVerifyChallenge,
} from "../shared/whatsapp-cloud";
import {
  getTemplateStatuses,
  handleWhatsAppTemplates,
  sendBookingConfirmedWhatsApp,
  sendDriverOnTheWayWhatsApp,
} from "../workers/addresses/src/whatsapp-templates";

function memoryKv(): KVNamespace {
  const map = new Map<string, string>();
  return {
    async get(key: string, type?: string) {
      const v = map.get(key);
      if (v === undefined) return null;
      return type === "json" ? JSON.parse(v) : v;
    },
    async put(key: string, value: string) {
      map.set(key, value);
    },
    async delete(key: string) {
      map.delete(key);
    },
  } as unknown as KVNamespace;
}

const metaEnv = {
  WHATSAPP_PROVIDER: "meta",
  WHATSAPP_ACCESS_TOKEN: "meta-token",
  WHATSAPP_PHONE_NUMBER_ID: "phone-99",
  WHATSAPP_APP_SECRET: "app-secret",
  WHATSAPP_VERIFY_TOKEN: "verify-tok",
  WHATSAPP_BUSINESS_ACCOUNT_ID: "waba-77",
};

type Call = { url: string; method?: string; body?: unknown; attempt?: number };

function fakeMeta(options: {
  calls: Call[];
  messageStatuses?: number[];
  templates?: Array<{ name: string; status: string; language?: string }>;
  submitStatus?: number;
}): typeof fetch {
  let messageAttempt = 0;
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    options.calls.push({ url, method, body, attempt: messageAttempt });

    if (url.includes("/message_templates") && method === "GET") {
      return new Response(
        JSON.stringify({
          data: (options.templates ?? []).map((t) => ({
            name: t.name,
            status: t.status,
            language: t.language ?? "en_GB",
          })),
        }),
        { status: 200 },
      );
    }
    if (url.includes("/message_templates") && method === "POST") {
      const status = options.submitStatus ?? 200;
      return new Response(status < 300 ? JSON.stringify({ id: "tpl-1" }) : JSON.stringify({ error: { message: "reject" } }), {
        status,
      });
    }
    if (url.includes("/messages") && method === "POST") {
      const statuses = options.messageStatuses ?? [200];
      const status = statuses[Math.min(messageAttempt, statuses.length - 1)]!;
      messageAttempt += 1;
      if (status >= 400) {
        return new Response(JSON.stringify({ error: { message: `fail-${status}`, code: status } }), { status });
      }
      return new Response(JSON.stringify({ messages: [{ id: "wamid.meta" }] }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
}

async function main() {
  assert.equal(isRetriableWhatsAppHttpStatus(429), true);
  assert.equal(isRetriableWhatsAppHttpStatus(503), true);
  assert.equal(isRetriableWhatsAppHttpStatus(400), false);
  assert.equal(isRetriableWhatsAppHttpStatus(401), false);

  assert.equal(resolveWhatsAppProvider({ ...metaEnv, D360_API_KEY: "should-not-win" }), "meta");
  assert.equal(whatsAppCloudConfigured({ WHATSAPP_PROVIDER: "meta", D360_API_KEY: "k" }), false);
  assert.equal(whatsAppSendTarget(metaEnv)?.provider, "meta");
  assert.match(whatsAppSendTarget(metaEnv)!.endpoint, /graph\.facebook\.com\/v23\.0\/phone-99\/messages/);

  // Verify handshake
  const challengeUrl = new URL(
    "https://staging.example/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-tok&hub.challenge=abc",
  );
  assert.equal(whatsAppVerifyChallenge(challengeUrl, "verify-tok"), "abc");

  // Signature
  const raw = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
  const sig = "sha256=" + createHmac("sha256", "app-secret").update(raw).digest("hex");
  assert.equal(await verifyWhatsAppSignature(raw, sig, "app-secret"), true);
  assert.equal(await verifyWhatsAppSignature(raw, sig, "wrong"), false);

  // Inbound parse + delivery failure
  const parsed = parseWhatsAppWebhook({
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              contacts: [{ wa_id: "447700900123", profile: { name: "Sam" } }],
              messages: [
                { id: "wamid.in1", from: "447700900123", timestamp: "1700000000", type: "text", text: { body: "Hi" } },
              ],
              statuses: [
                {
                  id: "wamid.out1",
                  status: "failed",
                  recipient_id: "447700900123",
                  timestamp: "1700000001",
                  errors: [{ code: 131026, title: "Message undeliverable", message: "undeliverable" }],
                },
              ],
            },
          },
        ],
      },
    ],
  });
  assert.equal(parsed.messages.length, 1);
  assert.equal(parsed.messages[0]?.text, "Hi");
  assert.equal(parsed.failures.length, 1);
  assert.match(parsed.failures[0]?.error ?? "", /131026/);

  // Retries on 503 then success (single logical send)
  {
    const calls: Call[] = [];
    const f = fakeMeta({ calls, messageStatuses: [503, 200] });
    const sent = await sendWhatsAppText(metaEnv, "447700900123", "Hello from staging", f);
    assert.equal(sent.sent, true);
    assert.equal(sent.messageId, "wamid.meta");
    assert.equal(calls.filter((c) => String(c.url).includes("/messages")).length, 2);
  }
  console.log("OK  Meta free-form send retries retriable HTTP then succeeds");

  // Non-retriable 400 — single attempt
  {
    const calls: Call[] = [];
    const f = fakeMeta({ calls, messageStatuses: [400] });
    const sent = await postWhatsAppMessage(
      metaEnv,
      "447700900123",
      { type: "text", text: { body: "x" } },
      f,
    );
    assert.equal(sent.sent, false);
    assert.equal(calls.length, 1);
  }
  console.log("OK  non-retriable Meta errors are not retried");

  // Template list + send via Meta Graph
  {
    const calls: Call[] = [];
    const store = memoryKv();
    const f = fakeMeta({
      calls,
      templates: [{ name: "mat_booking_confirmed", status: "APPROVED" }],
    });
    const env = { ...metaEnv, TRACKING_STORE: store };
    const statuses = await getTemplateStatuses(env, { refresh: true, fetchImpl: f });
    assert.equal(statuses?.mat_booking_confirmed, "approved");

    const first = await sendBookingConfirmedWhatsApp(
      env,
      {
        paymentReference: "PAY-1",
        customerReference: "MAT-2001",
        customerName: "Sarah Jones",
        mobile: "07377 515059",
        tripDate: "2026-10-31",
        tripTime: "05:30",
        pickupLabel: "12 Main Street, Lisburn",
        dropoffLabel: "Belfast International Airport",
        manageToken: "token-abc",
      },
      f,
    );
    assert.equal(first.sent, true);
    const second = await sendBookingConfirmedWhatsApp(
      env,
      {
        paymentReference: "PAY-1",
        customerReference: "MAT-2001",
        customerName: "Sarah Jones",
        mobile: "07377 515059",
        tripDate: "2026-10-31",
        tripTime: "05:30",
        pickupLabel: "12 Main Street, Lisburn",
        dropoffLabel: "Belfast International Airport",
        manageToken: "token-abc",
      },
      f,
    );
    assert.equal(second.sent, false, "KV marker prevents duplicate customer notification");
    const sends = calls.filter((c) => String(c.url).includes("/messages") && c.method === "POST");
    assert.equal(sends.length, 1);
    assert.match(String(sends[0]?.url), /graph\.facebook\.com/);
    const body = sends[0]?.body as { template: { name: string; language: { code: string } } };
    assert.equal(body.template.name, "mat_booking_confirmed");
    assert.equal(body.template.language.code, "en_GB");
  }
  console.log("OK  Meta template list/send + idempotent marker");

  // Template HTTP retry then success still writes one marker / one logical send
  {
    const calls: Call[] = [];
    const store = memoryKv();
    const f = fakeMeta({
      calls,
      templates: [{ name: "mat_driver_on_the_way", status: "approved" }],
      messageStatuses: [503, 200],
    });
    const env = { ...metaEnv, TRACKING_STORE: store };
    const r = await sendDriverOnTheWayWhatsApp(
      env,
      { jobKey: "job-retry", customerName: "Sam", mobile: "07377515059", pickupLabel: "Lisburn", tripTime: "09:00" },
      f,
    );
    assert.equal(r.sent, true);
    const again = await sendDriverOnTheWayWhatsApp(
      env,
      { jobKey: "job-retry", customerName: "Sam", mobile: "07377515059", pickupLabel: "Lisburn", tripTime: "09:00" },
      f,
    );
    assert.equal(again.sent, false);
    assert.equal(calls.filter((c) => String(c.url).includes("/messages")).length, 2, "retries before accept only");
  }
  console.log("OK  template retries do not duplicate after success marker");

  // /whatsapp/templates submit on Meta
  {
    const calls: Call[] = [];
    const f = fakeMeta({ calls, templates: [], submitStatus: 200 });
    const res = await handleWhatsAppTemplates(
      new Request("https://staging.example/whatsapp/templates?submit=1"),
      { ...metaEnv, TRACKING_STORE: memoryKv() },
      f,
    );
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.match(text, /WhatsApp provider: meta/);
    assert.match(text, /mat_booking_confirmed: submitted/);
    assert.ok(calls.some((c) => c.method === "POST" && String(c.url).includes("/message_templates")));
  }
  console.log("OK  Meta template submit endpoint");

  // Missing WABA id blocks template management
  {
    const res = await handleWhatsAppTemplates(
      new Request("https://staging.example/whatsapp/templates"),
      {
        WHATSAPP_PROVIDER: "meta",
        WHATSAPP_ACCESS_TOKEN: "a",
        WHATSAPP_PHONE_NUMBER_ID: "b",
        WHATSAPP_APP_SECRET: "c",
        WHATSAPP_VERIFY_TOKEN: "d",
      },
      fetch,
    );
    assert.equal(res.status, 503);
    assert.match(await res.text(), /WHATSAPP_BUSINESS_ACCOUNT_ID/);
  }
  console.log("OK  Meta templates require WABA id");

  console.log("\nAll Meta Cloud API checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
