/** Marketing list: owner listing, CSV, campaign send with one-click unsubscribe. */
import assert from "node:assert/strict";
import { buildMarketingEmail, marketingSubscribersCsv } from "../shared/marketing";
import { listMarketingSubscribers, recordMarketingOptIn, unsubscribeMarketingEmail } from "../workers/addresses/src/marketing-store";
import {
  handleMarketingOptInRequest,
  handleMarketingUnsubscribeRequest,
  handleOwnerMarketingSend,
  handleOwnerMarketingSubscribers,
} from "../workers/addresses/src/marketing-handlers";

function memoryStore() {
  const kv = new Map<string, string>();
  return {
    kv,
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
  } as unknown as KVNamespace & { kv: Map<string, string> };
}

const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

async function main() {
  const store = memoryStore();
  await recordMarketingOptIn(store, { email: "Sarah@Example.com", name: "Sarah Jones", source: "paid-booking" });
  await recordMarketingOptIn(store, { email: "tom@example.com", name: "Tom", source: "booking-request" });
  await recordMarketingOptIn(store, { email: "gone@example.com", source: "tour-enquiry" });
  await unsubscribeMarketingEmail(store, "gone@example.com");

  // Vehicle enquiries were rejected before (lost opt-ins).
  const vehicle = await handleMarketingOptInRequest(
    post("https://w/marketing/opt-in", { email: "van@example.com", source: "vehicle-enquiry" }),
    { TRACKING_STORE: store },
    null,
  );
  assert.equal(vehicle.status, 200, "vehicle-enquiry opt-ins are accepted");

  const all = await listMarketingSubscribers(store);
  assert.equal(all.length, 4);
  const csv = marketingSubscribersCsv(all);
  assert.match(csv, /^Email,Name,Opted in,Source,Consent version,Status,Unsubscribed\r\n/);
  assert.match(csv, /sarah@example\.com,Sarah Jones,/);
  assert.match(csv, /gone@example\.com,.*Unsubscribed/);

  const email = buildMarketingEmail({
    subject: "Christmas runs",
    message: "Book early <b>now</b>.\n\nSecond paragraph",
    name: "Sarah Jones",
    unsubscribeUrl: "https://www.myairporttaxini.co.uk/unsubscribe/?t=abc",
  });
  assert.match(email.text, /^Hi Sarah,/);
  assert.match(email.text, /Unsubscribe: https:\/\/www\.myairporttaxini\.co\.uk\/unsubscribe\/\?t=abc/);
  assert.match(email.html, /Book early &lt;b&gt;now&lt;\/b&gt;\./, "message is escaped");
  assert.match(email.html, /href="https:\/\/www\.myairporttaxini\.co\.uk\/unsubscribe\/\?t=abc"/);

  const env = { TRACKING_STORE: store, DRIVER_ACCESS_KEY: "owner-secret", OWNER_ACCESS_KEY: "owner-secret", RESEND_API_KEY: "re_test" };
  const unauth = await handleOwnerMarketingSubscribers(new Request("https://w/owner/marketing/subscribers"), env as never, null);
  assert.equal(unauth.status, 401, "owner only");

  // Send: Resend stubbed.
  const sent: Array<{ to: string; html: string; bcc?: unknown }> = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    if (String(url) === "https://api.resend.com/emails") {
      const body = JSON.parse(String(init?.body));
      sent.push({ to: Array.isArray(body.to) ? body.to[0] : body.to, html: body.html, bcc: body.bcc });
      return new Response(JSON.stringify({ id: "re_1" }), { status: 200 });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
  try {
    const ownerHeaders = { "X-Owner-Key": "owner-secret" };
    const list = await handleOwnerMarketingSubscribers(
      new Request("https://w/owner/marketing/subscribers", { headers: ownerHeaders }),
      env as never,
      null,
    );
    assert.equal(list.status, 200, "owner can list");
    const listed = (await list.json()) as { subscribers: Array<Record<string, unknown>> };
    assert.equal(listed.subscribers.length, 4);
    assert.ok(listed.subscribers.every((s) => !("unsubscribeToken" in s)), "tokens never leave the Worker");

    const unconfirmed = await handleOwnerMarketingSend(post("https://w/owner/marketing/send", { subject: "Hi", message: "Hello" }, ownerHeaders), env as never, null);
    assert.equal(unconfirmed.status, 400, "a real send needs confirm: true");

    const res = await handleOwnerMarketingSend(
      post("https://w/owner/marketing/send", { subject: "Christmas", message: "Book early", confirm: true }, ownerHeaders),
      env as never,
      null,
    );
    const result = (await res.json()) as { sent: number; total: number };
    assert.equal(res.status, 200);
    assert.equal(result.total, 3, "unsubscribed customers are skipped");
    assert.equal(result.sent, 3);
    assert.ok(!sent.some((m) => m.to === "gone@example.com"));
    assert.ok(sent.every((m) => !m.bcc), "no owner BCC on marketing emails");
    const token = sent.find((m) => m.to === "tom@example.com")!.html.match(/unsubscribe\/\?t=([a-f0-9]+)/)![1];

    // One-click unsubscribe from the email link.
    const unsub = await handleMarketingUnsubscribeRequest(post("https://w/marketing/unsubscribe", { token }), { TRACKING_STORE: store }, null);
    assert.equal(unsub.status, 200);
    const after = await listMarketingSubscribers(store);
    assert.ok(after.find((s) => s.email === "tom@example.com")?.unsubscribedAt, "token unsubscribes");
  } finally {
    globalThis.fetch = realFetch;
  }
  console.log("All marketing list / campaign checks passed.");
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
