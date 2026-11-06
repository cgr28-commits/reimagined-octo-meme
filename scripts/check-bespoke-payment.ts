/**
 * Bespoke quotation payments (Phase 3) — end-to-end with a mock Stripe API.
 * Real Durable Object classes (fake storage), real shared finaliser and
 * per-checkout claim, real Worker webhook route. No network.
 *
 * Run: npx tsx scripts/check-bespoke-payment.ts
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { BespokeQuoteCoordinator } from "../workers/addresses/src/bespoke-quote-coordinator";
import { QuoteLeadCoordinator } from "../workers/addresses/src/quote-lead-coordinator";
import { handleBespokeQuoteRoute, runBespokeExpirySweep, type BespokeQuoteEnv } from "../workers/addresses/src/bespoke-quote-handlers";
import {
  finalizeBespokeCheckoutViaSharedPath,
  handleOrphanBespokePayment,
} from "../workers/addresses/src/bespoke-payment";
import { finalizePaidCheckout } from "../workers/addresses/src/finalize-paid-checkout";
import { getPaidBookingRecord } from "../workers/addresses/src/paid-booking-store";
import { getPendingCheckout, savePendingCheckout } from "../workers/addresses/src/pending-checkout-store";
import { findTrackingJobsByPaymentReference } from "../workers/addresses/src/tracking-store";
import { processUnfinishedPayments } from "../workers/addresses/src/unfinished-payment";
import { configureStripe } from "../shared/stripe-payments";
import worker from "../workers/addresses/src/index";

const realNow = Date.now();
function isoDate(daysAhead: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(realNow + daysAhead * 86_400_000));
}

// ---------------------------------------------------------------------------
// Fakes: KV, Durable Objects, clock
// ---------------------------------------------------------------------------

const kv = new Map<string, { value: string; metadata?: unknown }>();
let failNextPendingSave = false;
const KV = {
  async get(key: string, type?: unknown) {
    const value = kv.get(key)?.value ?? null;
    const json = type === "json" || (typeof type === "object" && (type as { type?: string })?.type === "json");
    return value !== null && json ? JSON.parse(value) : value;
  },
  async getWithMetadata(key: string, type?: unknown) {
    return { value: await KV.get(key, type), metadata: kv.get(key)?.metadata ?? null };
  },
  async put(key: string, value: string, opts?: { metadata?: unknown }) {
    if (failNextPendingSave && key.startsWith("pending-checkout:")) {
      failNextPendingSave = false;
      throw new Error("simulated crash while storing the checkout");
    }
    kv.set(key, { value, metadata: opts?.metadata });
  },
  async delete(key: string) {
    kv.delete(key);
  },
  async list(opts: { prefix?: string; limit?: number } = {}) {
    const keys = [...kv.keys()].filter((k) => k.startsWith(opts.prefix ?? "")).sort().slice(0, opts.limit ?? 1000);
    return { keys: keys.map((name) => ({ name, metadata: kv.get(name)?.metadata })), list_complete: true, cursor: "" };
  },
} as unknown as KVNamespace;

const clock = { offsetMs: 0 };
const now = () => new Date(Date.now() + clock.offsetMs);

function fakeState(): DurableObjectState {
  const data = new Map<string, unknown>();
  let chain: Promise<unknown> = Promise.resolve();
  return {
    storage: {
      async get<T>(key: string) {
        await new Promise((r) => setTimeout(r, Math.random() * 2));
        const v = data.get(key);
        return v === undefined ? undefined : (structuredClone(v) as T);
      },
      async put(key: string, value: unknown) {
        await new Promise((r) => setTimeout(r, Math.random() * 2));
        data.set(key, structuredClone(value));
      },
      async delete(key: string) {
        return data.delete(key);
      },
      async deleteAll() {
        data.clear();
      },
      async setAlarm() {},
    },
    blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T> {
      const next = chain.then(fn);
      chain = next.catch(() => undefined);
      return next;
    },
  } as unknown as DurableObjectState;
}
class TestBespokeCoordinator extends BespokeQuoteCoordinator {
  protected override now(): Date {
    return now();
  }
}
function namespace<T extends { fetch(r: Request): Promise<Response> }>(make: () => T): DurableObjectNamespace {
  const instances = new Map<string, T>();
  return {
    idFromName: (name: string) => name,
    get: (id: string) => {
      if (!instances.has(id)) instances.set(id, make());
      const inst = instances.get(id)!;
      return { fetch: (url: string, init?: RequestInit) => inst.fetch(new Request(url, init)) };
    },
  } as unknown as DurableObjectNamespace;
}
const BESPOKE_NS = namespace(() => new TestBespokeCoordinator(fakeState()));
const LEAD_NS = namespace(() => new QuoteLeadCoordinator(fakeState()));

// ---------------------------------------------------------------------------
// Mock Stripe API (honours Idempotency-Key exactly like Stripe)
// ---------------------------------------------------------------------------

type Session = {
  id: string;
  object: "checkout.session";
  status: "open" | "complete" | "expired";
  payment_status: "unpaid" | "paid";
  amount_total: number;
  currency: string;
  client_reference_id: string;
  created: number;
  expires_at: number;
  client_secret: string;
  metadata: Record<string, string>;
  payment_intent: null | { id: string; status: string; created: number };
};
type Mail = { audience: string; to: string; subject: string; body: string };
const mails: Mail[] = [];
const sessions = new Map<string, Session>();
const idempotency = new Map<string, string>();
const stripeCalls: string[] = [];
const nonStripeCalls: string[] = [];
let stripeCreateMode: "ok" | "fail_before" | "lost_response" = "ok";
let sessionCounter = 0;

function formValue(body: string, key: string): string | null {
  return new URLSearchParams(body).get(key);
}
function pay(id: string, amountPence?: number): Session {
  const s = sessions.get(id)!;
  s.status = "complete";
  s.payment_status = "paid";
  if (amountPence !== undefined) s.amount_total = amountPence;
  s.payment_intent = { id: `pi_${id.slice(3)}`, status: "succeeded", created: Math.floor(Date.now() / 1000) };
  return s;
}
function createSessionDirect(reference: string, amountPence: number): Session {
  sessionCounter += 1;
  const s: Session = {
    id: `cs_test_${sessionCounter}`,
    object: "checkout.session",
    status: "open",
    payment_status: "unpaid",
    amount_total: amountPence,
    currency: "gbp",
    client_reference_id: reference,
    created: Math.floor(Date.now() / 1000),
    expires_at: Math.floor(Date.now() / 1000) + 23 * 3600,
    client_secret: `secret_${sessionCounter}`,
    metadata: { checkout_reference: reference },
    payment_intent: null,
  };
  sessions.set(s.id, s);
  return s;
}

(globalThis as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const url = String(input instanceof Request ? input.url : input);
  const method = (init.method ?? "GET").toUpperCase();
  if (url === "https://api.resend.com/emails" && method === "POST") {
    // Real Worker email path (Resend), captured instead of sent.
    const payload = JSON.parse(String(init.body ?? "{}")) as { to?: string | string[]; subject?: string; text?: string };
    const to = Array.isArray(payload.to) ? payload.to[0] : String(payload.to ?? "");
    mails.push({ audience: "resend", to: to.replace(/^.*<|>$/g, ""), subject: payload.subject ?? "", body: payload.text ?? "" });
    return Response.json({ id: `re_real_${mails.length}` });
  }
  if (!url.startsWith("https://api.stripe.com/v1")) {
    nonStripeCalls.push(`${method} ${url}`);
    return new Response(JSON.stringify({ error: "blocked in test" }), { status: 599 });
  }
  const path = url.slice("https://api.stripe.com/v1".length).split("?")[0];
  stripeCalls.push(`${method} ${path}`);
  const headers = new Headers(init.headers);
  const body = typeof init.body === "string" ? init.body : "";
  if (method === "POST" && path === "/checkout/sessions") {
    if (stripeCreateMode === "fail_before") {
      stripeCreateMode = "ok";
      return new Response(JSON.stringify({ error: { message: "Stripe unavailable" } }), { status: 500 });
    }
    const key = headers.get("Idempotency-Key") ?? "";
    let session = key && idempotency.has(key) ? sessions.get(idempotency.get(key)!)! : undefined;
    if (!session) {
      session = createSessionDirect(formValue(body, "client_reference_id") ?? "", Number(formValue(body, "line_items[0][price_data][unit_amount]")));
      session.metadata = {
        checkout_reference: formValue(body, "metadata[checkout_reference]") ?? "",
        bespoke_reference: formValue(body, "metadata[bespoke_reference]") ?? "",
      };
      if (formValue(body, "payment_intent_data[capture_method]")) session.metadata.capture = "manual";
      if (key) idempotency.set(key, session.id);
    }
    if (stripeCreateMode === "lost_response") {
      stripeCreateMode = "ok";
      return new Response(JSON.stringify({ error: { message: "gateway timeout (session was created)" } }), { status: 504 });
    }
    return Response.json(session);
  }
  const expire = /^\/checkout\/sessions\/([^/]+)\/expire$/.exec(path);
  if (method === "POST" && expire) {
    const s = sessions.get(expire[1]);
    if (!s) return Response.json({ error: { message: "No such session" } }, { status: 404 });
    if (s.status !== "open") return Response.json({ error: { message: "Only open sessions can be expired" } }, { status: 400 });
    s.status = "expired";
    return Response.json(s);
  }
  const get = /^\/checkout\/sessions\/([^/]+)$/.exec(path);
  if (method === "GET" && get) {
    const s = sessions.get(get[1]);
    return s ? Response.json(s) : Response.json({ error: { message: "No such session" } }, { status: 404 });
  }
  return Response.json({ error: { message: `unmocked ${method} ${path}` } }, { status: 400 });
}) as typeof fetch;

// ---------------------------------------------------------------------------
// Environment and helpers
// ---------------------------------------------------------------------------

const CUSTOMER = "pay.customer@example.com";
const WEBHOOK_SECRET = "whsec_bespoke_test";
const baseEnv = {
  TRACKING_STORE: KV,
  BESPOKE_QUOTE_COORDINATOR: BESPOKE_NS,
  QUOTE_LEAD_COORDINATOR: LEAD_NS,
  BESPOKE_QUOTES_ENABLED: "1",
  TURNSTILE_SECRET_KEY: "test",
  OWNER_ACCESS_KEY: "owner-key-123",
  DRIVER_ACCESS_KEY: "driver-key-456",
  // "stripe" = Stripe for everyone (needs a live-mode key; mocked here — no network).
  PAYMENT_PROVIDER: "stripe",
  STRIPE_SECRET_KEY: "sk_live_mock_never_sent",
  STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
  GOOGLE_PLACES_API_KEY: "x",
  RESEND_API_KEY: "re_test_mock",
};
let env: BespokeQuoteEnv & Record<string, unknown> = { ...baseEnv };
configureStripe({ STRIPE_SECRET_KEY: "sk_live_mock_never_sent" });

let calendarCalls = 0;
let calendarFailNext = false;
const deps = {
  fetchImpl: (async () => Response.json({ success: true, hostname: "www.myairporttaxini.co.uk", action: "bespoke_quote_request" })) as typeof fetch,
  sendCustomerEmail: async (_e: unknown, p: { to: string; subject: string; body: string }) => {
    mails.push({ audience: "customer", to: p.to, subject: p.subject, body: p.body });
    return { sent: true, provider: "resend", resendId: `re_${mails.length}` };
  },
  sendOwnerEmail: async (_e: unknown, p: { to: string; subject: string; body: string }) => {
    mails.push({ audience: "owner", to: p.to, subject: p.subject, body: p.body });
    return { sent: true, provider: "resend", resendId: `re_${mails.length}` };
  },
  logPaidBookingCalendar: async () => {
    calendarCalls += 1;
    if (calendarFailNext) {
      calendarFailNext = false;
      throw new Error("calendar outage");
    }
    return { logged: true, eventIds: [`evt_${calendarCalls}`], calendarEventIdsByLeg: { outbound: `evt_${calendarCalls}` } } as never;
  },
  now,
};

let ip = 0;
async function call(path: string, body: unknown, opts: { owner?: boolean; method?: string } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json", "CF-Connecting-IP": `10.0.${Math.floor(++ip / 250)}.${ip % 250}` };
  if (opts.owner) headers["X-Owner-Key"] = "owner-key-123";
  const res = await handleBespokeQuoteRoute(
    new Request(`https://worker.example${path}`, { method: opts.method ?? "POST", headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }),
    env,
    "https://www.myairporttaxini.co.uk",
    deps as never,
  );
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null, text };
}
async function detail(ref: string) {
  return (await call(`/owner/bespoke-quotes/detail?reference=${ref}`, undefined, { owner: true, method: "GET" })).json;
}
let keyCounter = 0;
async function owner(ref: string, action: Record<string, unknown>) {
  const d = await detail(ref);
  return call("/owner/bespoke-quotes/action", { reference: ref, expectedVersion: d.request.version, idempotencyKey: `k-owner-${++keyCounter}-xx`, action }, { owner: true });
}

let requestCounter = 0;
/** New request → owner quotes it → returns reference + customer token. */
async function quotedRequest(amountGbp = 150, validityHours = 48, extra: Record<string, unknown> = {}) {
  requestCounter += 1;
  const date = isoDate(20 + requestCounter);
  const res = await call("/bespoke-quotes/request", {
    category: "event",
    customerName: "Pat Customer",
    customerEmail: `pay${requestCounter}@example.com`,
    customerPhone: "07700 900123",
    pickupAddress: `${requestCounter} High Street, Lisburn BT27 4AA`,
    destinationAddress: "The O2 Belfast",
    date,
    time: "18:00",
    passengers: 4,
    eventTitle: "Example Concert",
    eventDate: date,
    eventVenue: "The O2 Belfast",
    termsAccepted: true,
    privacyAcknowledged: true,
    termsVersion: "2026-10",
    turnstileToken: "x",
    ...extra,
  });
  assert.ok([200, 201].includes(res.status), res.text);
  const ref: string = res.json.reference;
  const q = await owner(ref, { type: "owner_issue_quote", amountGbp, validityHours });
  assert.equal(q.status, 200, q.text);
  return { ref, email: `pay${requestCounter}@example.com`, token: decodeURIComponent(q.json.customerLink.split("#t=")[1]) };
}
const count = (prefix: string) => stripeCalls.filter((c) => c.startsWith(prefix)).length;

function signedStripeEvent(sessionId: string) {
  // The real route ignores events whose mode differs from the key's mode.
  const livemode = String(env.STRIPE_SECRET_KEY ?? "").startsWith("sk_live_");
  const payload = JSON.stringify({ id: `evt_${sessionId}_${Math.random()}`, type: "checkout.session.completed", livemode, data: { object: { id: sessionId, object: "checkout.session" } } });
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", WEBHOOK_SECRET).update(`${t}.${payload}`).digest("hex");
  return new Request("https://worker.example/payments/stripe-webhook", { method: "POST", headers: { "Stripe-Signature": `t=${t},v1=${sig}` }, body: payload });
}
async function webhook(sessionId: string) {
  return worker.fetch(signedStripeEvent(sessionId), env as never, { waitUntil() {}, passThroughOnException() {} } as never);
}

// ---------------------------------------------------------------------------
async function main() {
  console.log("=== 1. Accept and pay: one Stripe checkout, amount from the quote ===");
  const a = await quotedRequest(150);
  const view = await call("/bespoke-quotes/view", { token: a.token });
  assert.equal(view.json.paymentAvailable, true);
  const before = count("POST /checkout/sessions");
  const c1 = await call("/bespoke-quotes/checkout", { token: a.token, amount: 1, amountGbp: 1 });
  assert.equal(c1.status, 200, c1.text);
  assert.match(c1.json.paymentUrl, /\/pay\/card\//);
  assert.equal(count("POST /checkout/sessions"), before + 1);
  const s1 = sessions.get(c1.json.checkoutId)!;
  assert.equal(s1.amount_total, 15000, "amount comes from the quote, never the browser (I5)");
  assert.equal(s1.metadata.capture, undefined, "charged immediately — no card hold");
  assert.match(s1.client_reference_id, new RegExp(`^bq-${a.ref}-v1-`));
  const pending = await getPendingCheckout(KV, c1.json.checkoutId);
  assert.equal(pending?.checkoutKind, "bespoke");
  assert.equal(pending?.bespokeQuoteReference, a.ref);
  assert.equal((await detail(a.ref)).request.status, "PAYMENT_STARTED");
  // Repeat click → same checkout, no new Stripe session (I1).
  const c2 = await call("/bespoke-quotes/checkout", { token: a.token });
  assert.equal(c2.json.checkoutId, c1.json.checkoutId);
  assert.equal(count("POST /checkout/sessions"), before + 1);

  console.log("=== 2. Concurrent clicks → exactly one Stripe session ===");
  const b = await quotedRequest(120);
  const sessionsBefore = sessions.size;
  const burst = await Promise.all(Array.from({ length: 12 }, () => call("/bespoke-quotes/checkout", { token: b.token })));
  const ok = burst.filter((r) => r.status === 200);
  assert.ok(ok.length >= 1, JSON.stringify(burst.map((r) => r.status)));
  assert.ok(burst.every((r) => r.status === 200 || r.status === 409), JSON.stringify(burst.map((r) => [r.status, r.json?.code])));
  assert.equal(new Set(ok.map((r) => r.json.checkoutId)).size, 1, "every success returns the same checkout");
  assert.equal(sessions.size, sessionsBefore + 1, "one Stripe session for 12 concurrent clicks");

  console.log("=== 3. Payment → booking in Jobs + Calendar → CONFIRMED → emails once ===");
  pay(c1.json.checkoutId);
  const mailsBefore = mails.length;
  // Browser return + two webhook-equivalent finalisations at the same time (all
  // through the SHARED finaliser and its per-checkout claim).
  const [st] = await Promise.all([
    call("/bespoke-quotes/payment-status", { token: a.token, checkoutId: c1.json.checkoutId }),
    finalizeBespokeCheckoutViaSharedPath(env, deps, c1.json.checkoutId),
    finalizeBespokeCheckoutViaSharedPath(env, deps, c1.json.checkoutId),
  ]);
  assert.equal(st.status, 200, st.text);
  let d = await detail(a.ref);
  if (d.request.status !== "CONFIRMED") {
    // The browser call may have found the claim busy; the next status call completes it.
    await call("/bespoke-quotes/payment-status", { token: a.token, checkoutId: c1.json.checkoutId });
    d = await detail(a.ref);
  }
  assert.equal(d.request.status, "CONFIRMED");
  assert.equal(d.request.payments.length, 1, "payment recorded exactly once");
  const payRef = d.request.payments[0].paymentReference;
  assert.match(payRef, /^pi_/);
  const paid = await getPaidBookingRecord(KV, payRef);
  assert.ok(paid, "paid booking record exists (Jobs / Money / refunds)");
  assert.equal(paid!.amount, 150);
  assert.ok(paid!.customerReference, "MAT reference allocated");
  assert.equal(d.request.bookingReference, paid!.customerReference, "CONFIRMED carries the booking reference");
  assert.match(paid!.notes ?? "", new RegExp(a.ref));
  assert.equal((await findTrackingJobsByPaymentReference(KV, payRef)).length, 1, "one job in Jobs");
  assert.equal(calendarCalls, 1, "one calendar event");
  const newMails = mails.slice(mailsBefore);
  assert.equal(newMails.filter((m) => /Booking confirmed/.test(m.subject)).length, 1, "one confirmation email");
  assert.equal(newMails.filter((m) => /Paid and confirmed/.test(m.subject)).length, 1, "one owner alert");
  const conf = newMails.find((m) => /Booking confirmed/.test(m.subject))!;
  assert.equal(conf.to, a.email);
  assert.match(conf.body, new RegExp(`Quotation reference: ${a.ref}`), "new bespoke confirmation template");
  assert.ok(!/Meet & Greet|return journey offer|Manage your booking/i.test(conf.body), "no airport-template content");
  // Further webhooks change nothing.
  await webhook(c1.json.checkoutId);
  await finalizeBespokeCheckoutViaSharedPath(env, deps, c1.json.checkoutId);
  assert.equal((await detail(a.ref)).request.payments.length, 1);
  assert.equal(calendarCalls, 1);
  assert.equal(mails.length, mailsBefore + newMails.length, "no duplicate emails");
  assert.equal((await call("/bespoke-quotes/checkout", { token: a.token })).json.code, "already_paid");
  assert.equal(count("POST /refunds"), 0);

  console.log("=== 4. Booking creation fails after payment → PAID kept, retry completes once ===");
  const e = await quotedRequest(99);
  const ce = await call("/bespoke-quotes/checkout", { token: e.token });
  pay(ce.json.checkoutId);
  calendarFailNext = true;
  await call("/bespoke-quotes/payment-status", { token: e.token, checkoutId: ce.json.checkoutId });
  let de = await detail(e.ref);
  assert.equal(de.request.status, "PAID", "money recorded, not confirmed without a booking (I2, I3)");
  assert.equal(de.request.payments.length, 1);
  assert.ok(mails.some((m) => /paid, booking not yet created/i.test(m.subject) && m.body.includes(e.ref)), "owner told");
  assert.ok(!mails.some((m) => /Booking confirmed/.test(m.subject) && m.body.includes(e.ref)), "customer not told 'confirmed'");
  // No customer page involved: the 5-minute sweep retries the booking by itself.
  const retrySweep = await runBespokeExpirySweep(env, deps as never);
  assert.equal(retrySweep.bookingsCompleted, 1, JSON.stringify(retrySweep));
  de = await detail(e.ref);
  assert.equal(de.request.status, "CONFIRMED");
  const quiet = await runBespokeExpirySweep(env, deps as never);
  assert.equal(quiet.bookingRetries, 0, "CONFIRMED is cleared from the retry list");
  const eRef = de.request.payments[0].paymentReference;
  assert.equal((await findTrackingJobsByPaymentReference(KV, eRef)).length, 1, "still one job after retry");
  assert.equal(mails.filter((m) => /Booking confirmed/.test(m.subject) && m.body.includes(e.ref)).length, 1);

  console.log("=== 5. Paid after expiry → owner review, no booking, no refund ===");
  const x = await quotedRequest(80, 1);
  const cx = await call("/bespoke-quotes/checkout", { token: x.token });
  clock.offsetMs = 2 * 3_600_000;
  pay(cx.json.checkoutId);
  await call("/bespoke-quotes/payment-status", { token: x.token, checkoutId: cx.json.checkoutId });
  let dx = await detail(x.ref);
  assert.equal(dx.request.status, "PAYMENT_REVIEW");
  assert.ok(dx.request.review.reasons.includes("paid_after_expiry"));
  assert.equal(dx.request.payments.length, 1, "payment recorded (I2)");
  assert.equal(await getPaidBookingRecord(KV, dx.request.payments[0].paymentReference), null, "no booking created");
  assert.ok(mails.some((m) => /payment needs review/.test(m.subject) && m.body.includes(x.ref)));
  // Owner accepts → booking created, then CONFIRMED.
  const accept = await owner(x.ref, { type: "owner_resolve_review", resolution: "accept_payment", note: "Vehicle still free" });
  assert.equal(accept.status, 200, accept.text);
  dx = await detail(x.ref);
  assert.equal(dx.request.status, "CONFIRMED");
  assert.ok(await getPaidBookingRecord(KV, dx.request.payments[0].paymentReference));
  clock.offsetMs = 0;

  console.log("=== 6. Owner cancels during checkout → Stripe session expired; late payment → review ===");
  const k = await quotedRequest(70);
  const ck = await call("/bespoke-quotes/checkout", { token: k.token });
  const expiresBefore = count(`POST /checkout/sessions/${ck.json.checkoutId}/expire`);
  const cancel = await owner(k.ref, { type: "owner_cancel", note: "No driver" });
  assert.equal(cancel.status, 200, cancel.text);
  assert.equal(count(`POST /checkout/sessions/${ck.json.checkoutId}/expire`), expiresBefore + 1, "session expired on cancel");
  assert.equal(sessions.get(ck.json.checkoutId)!.status, "expired");
  // A session that was ALREADY completed when the owner cancelled still lands → review.
  const k2 = await quotedRequest(71);
  const ck2 = await call("/bespoke-quotes/checkout", { token: k2.token });
  pay(ck2.json.checkoutId);
  await owner(k2.ref, { type: "owner_cancel", note: "race" });
  await webhook(ck2.json.checkoutId);
  const dk2 = await detail(k2.ref);
  assert.equal(dk2.request.status, "PAYMENT_REVIEW");
  assert.ok(dk2.request.review.reasons.includes("paid_after_cancellation"));

  console.log("=== 7. Amount mismatch → review ===");
  const m = await quotedRequest(60);
  const cm = await call("/bespoke-quotes/checkout", { token: m.token });
  pay(cm.json.checkoutId, 1000);
  await webhook(cm.json.checkoutId);
  const dm = await detail(m.ref);
  assert.equal(dm.request.status, "PAYMENT_REVIEW");
  assert.ok(dm.request.review.reasons.includes("amount_mismatch"));

  console.log("=== 8. Crash after Stripe created the session, before we stored it ===");
  const r = await quotedRequest(55);
  failNextPendingSave = true;
  const crashed = await call("/bespoke-quotes/checkout", { token: r.token }).catch((error) => ({ status: 500, json: null, text: String(error) }));
  assert.notEqual(crashed.status, 200);
  const sessionsAfterCrash = sessions.size;
  const retry = await call("/bespoke-quotes/checkout", { token: r.token });
  assert.equal(retry.status, 200, retry.text);
  assert.equal(sessions.size, sessionsAfterCrash, "retry reused the SAME Stripe session (idempotency key) — no second checkout");
  assert.equal(sessions.get(retry.json.checkoutId)!.client_reference_id.startsWith(`bq-${r.ref}-v1-`), true);
  // Response lost after Stripe created the session.
  const l = await quotedRequest(56);
  stripeCreateMode = "lost_response";
  const lost = await call("/bespoke-quotes/checkout", { token: l.token });
  assert.equal(lost.status, 503);
  const sizeAfterLost = sessions.size;
  const lostRetry = await call("/bespoke-quotes/checkout", { token: l.token });
  assert.equal(lostRetry.status, 200, lostRetry.text);
  assert.equal(sessions.size, sizeAfterLost, "lost response: retry returns the existing session");
  // Stripe down before creating anything: nothing to pay, retry works.
  const f = await quotedRequest(57);
  stripeCreateMode = "fail_before";
  assert.equal((await call("/bespoke-quotes/checkout", { token: f.token })).status, 503);
  assert.equal((await call("/bespoke-quotes/checkout", { token: f.token })).status, 200);

  console.log("=== 9. Orphan session paid (no pending record) → webhook records it for review ===");
  const o = await quotedRequest(65);
  const orphan = createSessionDirect(`bq-${o.ref}-v1-00000000-orphan-attempt`, 6500);
  pay(orphan.id);
  const orphanHook = await webhook(orphan.id);
  assert.equal(orphanHook.status, 200);
  const dO = await detail(o.ref);
  assert.equal(dO.request.payments.length, 1, "orphan payment recorded");
  assert.equal(dO.request.status, "PAYMENT_REVIEW");
  assert.ok(dO.request.review.reasons.includes("unexpected_checkout"));
  // Second distinct payment on an already-CONFIRMED quotation → review, stays CONFIRMED.
  const dup = createSessionDirect(`bq-${a.ref}-v1-00000000-second-payment`, 15000);
  pay(dup.id);
  await webhook(dup.id);
  const dA = await detail(a.ref);
  assert.equal(dA.request.status, "CONFIRMED", "never un-confirm");
  assert.equal(dA.request.payments.length, 2);
  assert.ok(dA.request.review.open && dA.request.review.reasons.includes("duplicate_payment"));
  // Non-bespoke orphan is ignored by the bespoke fallback.
  const foreign = createSessionDirect("matni-some-airport-ref", 4500);
  pay(foreign.id);
  assert.equal(await handleOrphanBespokePayment(env, deps, foreign.id), false);

  console.log("=== 10. Abandoned checkout → sweep expires the Stripe session, then the quote ===");
  const ab = await quotedRequest(90, 1);
  const cab = await call("/bespoke-quotes/checkout", { token: ab.token });
  clock.offsetMs = 2 * 3_600_000;
  const sweep = await runBespokeExpirySweep(env, deps as never);
  assert.ok(sweep.paymentChecks >= 1, JSON.stringify(sweep));
  assert.equal(sessions.get(cab.json.checkoutId)!.status, "expired", "Stripe session closed before release");
  const dab = await detail(ab.ref);
  assert.equal(dab.request.status, "EXPIRED");
  assert.equal(dab.request.paymentAttempt, undefined);
  assert.ok(mails.some((m) => /has expired/.test(m.subject) && m.to === ab.email));
  // Abandoned but actually paid → sweep finds and records the payment.
  clock.offsetMs = 0;
  const ap = await quotedRequest(91, 1);
  const cap = await call("/bespoke-quotes/checkout", { token: ap.token });
  pay(cap.json.checkoutId);
  clock.offsetMs = 2 * 3_600_000;
  const sweep2 = await runBespokeExpirySweep(env, deps as never);
  assert.ok(sweep2.paymentsFound >= 1, JSON.stringify(sweep2));
  const dap = await detail(ap.ref);
  assert.equal(dap.request.payments.length, 1, "payment found by the sweep is recorded");
  assert.ok(["CONFIRMED", "PAYMENT_REVIEW"].includes(dap.request.status), dap.request.status);
  clock.offsetMs = 0;
  // Unknown session id (crash before Stripe answered) → not released before 24h.
  const un = await quotedRequest(92, 1);
  stripeCreateMode = "fail_before";
  await call("/bespoke-quotes/checkout", { token: un.token });
  clock.offsetMs = 2 * 3_600_000;
  await runBespokeExpirySweep(env, deps as never);
  assert.equal((await detail(un.ref)).request.status, "PAYMENT_STARTED", "kept until any Stripe session has certainly expired");
  clock.offsetMs = 25 * 3_600_000;
  await runBespokeExpirySweep(env, deps as never);
  await runBespokeExpirySweep(env, deps as never);
  clock.offsetMs = 25 * 3_600_000 + 31 * 60_000;
  await runBespokeExpirySweep(env, deps as never);
  assert.equal((await detail(un.ref)).request.status, "EXPIRED", "released after the Stripe session lifetime");
  clock.offsetMs = 0;

  console.log("=== 11. Stripe only: never SumUp ===");
  const noStripeEnv = { ...baseEnv, PAYMENT_PROVIDER: "", STRIPE_SECRET_KEY: "", SUMUP_API_KEY: "sumup_live_x", SUMUP_MERCHANT_CODE: "M1" };
  env = noStripeEnv;
  const s = await quotedRequest(50);
  const sv = await call("/bespoke-quotes/view", { token: s.token });
  assert.equal(sv.json.paymentAvailable, false);
  const sc = await call("/bespoke-quotes/checkout", { token: s.token });
  assert.equal(sc.status, 503);
  assert.equal(sc.json.code, "payment_unavailable");
  env = { ...baseEnv };
  // stripe-test: Stripe only for listed testers; everyone else gets no online payment (never SumUp).
  env = { ...baseEnv, PAYMENT_PROVIDER: "stripe-test", STRIPE_SECRET_KEY: "sk_test_mock", STRIPE_TEST_EMAILS: "someone.else@example.com" };
  const t2 = await quotedRequest(51);
  assert.equal((await call("/bespoke-quotes/checkout", { token: t2.token })).json.code, "payment_unavailable");
  env = { ...baseEnv };
  assert.deepEqual(nonStripeCalls.filter((c) => /sumup/i.test(c)), [], "no SumUp call anywhere");

  console.log("=== 12. Feature off / bad token ===");
  assert.equal((await call("/bespoke-quotes/checkout", { token: a.token }, {})).json.code, "already_paid");
  env = { ...baseEnv, BESPOKE_QUOTES_ENABLED: "" };
  assert.equal((await call("/bespoke-quotes/checkout", { token: s.token })).status, 404);
  env = { ...baseEnv };
  assert.equal((await call("/bespoke-quotes/checkout", { token: "junk" })).status, 404);
  const ps = await call("/bespoke-quotes/payment-status", { checkoutId: c1.json.checkoutId });
  assert.deepEqual(ps.json, { ok: true, status: "received" }, "no details without the token");

  console.log("=== 13. Airport bookings untouched ===");
  const airport = createSessionDirect("matni-airport-1", 4500);
  await savePendingCheckout(KV, {
    checkoutId: airport.id,
    checkoutReference: "matni-airport-1",
    amount: 45,
    booking: { customerName: "A", customerEmail: "a@example.com", mobileNumber: "07700900000" } as never,
    createdAt: new Date().toISOString(),
  });
  const bespokeCallsBefore = [...kv.keys()].length;
  const airportResult = await finalizePaidCheckout({ env: env as never, checkoutId: airport.id, booking: { customerName: "A" } as never, logPaidBookingCalendar: deps.logPaidBookingCalendar as never });
  assert.equal(airportResult.paid, false, "unpaid airport checkout handled by the airport path");
  assert.match(airportResult.error ?? "", /not been completed/);
  assert.equal([...kv.keys()].length, bespokeCallsBefore, "bespoke module wrote nothing for an airport checkout");
  // Unfinished-payment job never picks up a bespoke checkout (would re-price with the airport engine).
  const pendingKeys = [...kv.keys()].filter((key) => key.startsWith("pending-checkout:"));
  for (const key of pendingKeys) {
    const rec = JSON.parse(kv.get(key)!.value);
    rec.createdAt = new Date(Date.now() - 3 * 3_600_000).toISOString();
    kv.set(key, { value: JSON.stringify(rec) });
  }
  await processUnfinishedPayments({ ...env, TRACKING_STORE: KV } as never).catch((error) => ({ error: String(error) }));
  for (const key of pendingKeys) {
    const rec = JSON.parse(kv.get(key)!.value);
    if (rec.checkoutKind === "bespoke") assert.equal(rec.unfinishedAlertSentAt, undefined, `bespoke pending ${key} skipped by unfinished-payment job`);
  }

  console.log("=== 14. Source guards ===");
  const read = (f: string) => readFileSync(f, "utf8");
  const payment = read("workers/addresses/src/bespoke-payment.ts");
  assert.ok(!/createHostedCheckout|createSumUpHostedCheckout|refundStripePayment|refundSumUp|\/refunds/.test(payment), "Stripe-only, never refunds");
  assert.match(payment, /manualCapture: false/);
  const index = read("workers/addresses/src/index.ts");
  assert.equal((index.match(/handleOrphanBespokePayment\(/g) ?? []).length, 1, "one webhook fallback call");
  const pendingStore = read("workers/addresses/src/pending-checkout-store.ts");
  assert.match(pendingStore, /\| "bespoke";/);
  assert.match(pendingStore, /bespokeQuoteReference\?: string;/);

  console.log("\nAll bespoke payment checks passed.", `(${sessions.size} mock Stripe sessions, ${stripeCalls.length} Stripe calls)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
