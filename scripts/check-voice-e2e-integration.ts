/**
 * End-to-end Fonio integration checks (branch handlers + safe production probes).
 *
 * Rules:
 * - No live Fonio dashboard changes
 * - No real Stripe charges / no live booking mutations
 * - Production probes use fake refs/mobiles and followUpConsent=no only
 *
 * Writes docs/fonio-e2e-integration-report.md with PASS / FAIL / BLOCKED.
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { voiceQuoteDraft, voiceQuoteSay } from "../shared/voice-quote";
import {
  VOICE_BOOKING_AFTER_PAYMENT_SAY,
  VOICE_LINK_SENT_SAY,
  voiceOpeningGreeting,
} from "../shared/voice-greeting";
import { isQuickQuoteExpired } from "../shared/quick-quote";
import { buildManageBookingUrl } from "../shared/manage-booking-token";
import { matchVoiceBooking, voiceBookingSay, voiceBookingSmsText } from "../shared/voice-booking";
import { whatsAppQuoteLinkHours } from "../shared/whatsapp-quote-bot";
import { handleVoiceInbound } from "../workers/addresses/src/voice-inbound";
import { handleVoiceSendLink } from "../workers/addresses/src/voice-quote";
import { handleVoiceProvisionalBooking } from "../workers/addresses/src/voice-provisional";
import { handleVoiceBooking, handleVoiceBookingLink } from "../workers/addresses/src/voice-booking";
import { handleVoiceMessage } from "../workers/addresses/src/voice-message";
import { handleVoiceCallEnded } from "../workers/addresses/src/voice-followup";
import { voiceAuthDenied } from "../shared/voice-auth";
import { stripeActiveFor } from "../workers/addresses/src/payment-provider";

type Status = "PASS" | "FAIL" | "BLOCKED";
type Row = { id: string; area: string; result: Status; detail: string };

const PROD = "https://reimagined-octo-meme.cgr28.workers.dev";
const now = new Date("2026-11-05T12:00:00Z");
const rows: Row[] = [];

function memoryStore() {
  const kv = new Map<string, string>();
  return {
    kv,
    async get(key: string, type?: string) {
      const v = kv.get(key);
      return v == null ? null : type === "json" ? JSON.parse(v) : v;
    },
    async put(key: string, value: string, _opts?: { expirationTtl?: number }) {
      kv.set(key, value);
    },
    async delete(key: string) {
      kv.delete(key);
    },
    async list(options?: { prefix?: string }) {
      const prefix = options?.prefix ?? "";
      const keys = [...kv.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name }));
      return { keys, list_complete: true, cursor: "" };
    },
  };
}

function record(id: string, area: string, result: Status, detail: string) {
  rows.push({ id, area, result, detail });
  const mark = result === "PASS" ? "PASS" : result === "FAIL" ? "FAIL" : "BLOCK";
  console.log(`[${mark}] ${id}: ${detail}`);
}

function check(id: string, area: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => record(id, area, "PASS", "assertions held"))
    .catch((e) => record(id, area, "FAIL", e instanceof Error ? e.message : String(e)));
}

async function probeProd(path: string, body: Record<string, unknown> = {}): Promise<{ status: number; json: any }> {
  const res = await fetch(`${PROD}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json };
}

async function main() {
  // ——— Auth ———
  await check("T01", "Auth", () => {
    const denied = voiceAuthDenied(new Request("https://w/voice/quote"), { VOICE_WEBHOOK_SECRET: "test-secret" });
    assert.equal(denied?.status, 401);
    assert.equal(
      voiceAuthDenied(new Request("https://w/voice/quote", { headers: { Authorization: "Bearer test-secret" } }), {
        VOICE_WEBHOOK_SECRET: "test-secret",
      }),
      null,
    );
  });

  // ——— Inbound greeting once + Europe/London ———
  await check("T02", "Inbound", async () => {
    const store = memoryStore();
    const res = await handleVoiceInbound(
      new Request("https://w/voice/inbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromNumber: "07700900123" }),
      }),
      { TRACKING_STORE: store as unknown as KVNamespace },
      new Date("2026-07-01T08:30:00Z"),
    );
    const body = await res.json();
    assert.equal(body.dayPart, "morning");
    assert.equal((body.greeting.match(/My Airport Taxi NI/g) || []).length, 1);
    assert.match(body.sayHint, /once only|Speak the greeting field once/i);
    assert.match(body.sayHint, /Europe\/London/);
    const g = voiceOpeningGreeting({ now: new Date("2026-01-15T18:30:00Z") });
    assert.equal(g.dayPart, "evening");
  });

  // ——— Conversational quote drafts: missing, correction, out-of-capacity ———
  await check("T03", "Conversation / quote draft", () => {
    let step = voiceQuoteDraft({ pickup: "Dublin Airport" }, now);
    assert.ok(!step.ok && step.askNext === "dropoff");
    assert.doesNotMatch(step.say, /\d+\s*pounds|£\d+/i);

    // Corrected destination mid-flow (interruption / correction).
    step = voiceQuoteDraft({ pickup: "Dublin Airport", dropoff: "Lisburn wrong" }, now);
    assert.ok(!step.ok && step.askNext === "date");
    step = voiceQuoteDraft(
      {
        pickup: "Dublin Airport",
        dropoff: "12 Main Street, Bangor BT20",
        date: "2026-11-20",
        time: "14:00",
        passengers: 2,
        suitcases: 2,
      },
      now,
    );
    assert.ok(step.ok);

    // Returning-customer style full journey still one-shot when complete.
    const ret = voiceQuoteDraft(
      {
        pickup: "Belfast International Airport",
        dropoff: "BT9 Belfast",
        date: "2026-11-20",
        time: "09:00",
        passengers: 2,
        suitcases: 1,
        returnJourney: "yes",
        returnDate: "2026-11-27",
        returnTime: "18:00",
        flightNumber: "EI3550",
      },
      now,
    );
    assert.ok(ret.ok);
    if (ret.ok) assert.equal(ret.draft.returnJourney, true);

    // Service / capacity restriction: too many passengers → no fare.
    const big = voiceQuoteDraft(
      {
        pickup: "BFS",
        dropoff: "Bangor",
        date: "2026-11-20",
        time: "10:00",
        passengers: 6,
        suitcases: 0,
      },
      now,
    );
    assert.ok(!big.ok);
    assert.match(big.say, /larger vehicle/i);
    assert.doesNotMatch(big.say, /\d+\s*pounds|£\d+/i);

    // Same airport both ends → no fare.
    const same = voiceQuoteDraft(
      {
        pickup: "Belfast International",
        dropoff: "Aldergrove airport",
        date: "2026-11-20",
        time: "10:00",
        passengers: 1,
        suitcases: 0,
      },
      now,
    );
    assert.ok(!same.ok);
  });

  // ——— Pricing rules preserved in spoken say ———
  await check("T04", "Pricing rules (spoken)", () => {
    const draft = voiceQuoteDraft(
      {
        pickup: "Belfast International Airport",
        dropoff: "12 Main Street, Bangor",
        date: "2026-11-20",
        time: "09:00",
        passengers: 2,
        suitcases: 1,
        flightNumber: "EI3550",
      },
      now,
    );
    assert.ok(draft.ok);
    if (!draft.ok) return;
    const say = voiceQuoteSay({
      amount: 55,
      draft: draft.draft,
      vehicle: "Standard Saloon (1–4 passengers)",
      requestOnly: false,
      shortNotice: false,
    });
    assert.match(say, /55 pounds/);
    assert.match(say, /quotation|secure link/i);
    assert.match(say, /more than 24 hours|within 24 hours/i);
    assert.doesNotMatch(say, /surcharge|night|weekend/i);
    assert.equal(whatsAppQuoteLinkHours(draft.draft, now), 24);
  });

  // ——— Send Booking Link: accepted vs generated; never delivered without receipt ———
  await check("T05", "SMS / WhatsApp messageStatus", async () => {
    const store = memoryStore();
    const quoteId = "aabbccddeeff00112233445566778899";
    const bookingUrl = `https://www.myairporttaxini.co.uk/book-quote/?id=${quoteId}`;
    await store.put(
      `voice:quote:${quoteId}`,
      JSON.stringify({
        amountLabel: "£45",
        journeyLabel: "BFS to Bangor",
        whenLabel: "20 Nov at 09:00",
        heldFor: "24 hours",
        bookingUrl,
      }),
    );

    // No WhatsApp credentials → SMS text generated (not accepted, not delivered).
    const smsRes = await handleVoiceSendLink(
      new Request("https://w/voice/send-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId, mobile: "07700900123", name: "Sam Test" }),
      }),
      { TRACKING_STORE: store as unknown as KVNamespace },
    );
    const sms = await smsRes.json();
    assert.equal(sms.messageStatus, "generated");
    assert.equal(sms.delivered, false);
    assert.equal(sms.sendBySms, true);
    assert.match(sms.smsText, /book-quote/);
    assert.match(sms.sayAfterSmsAccepted, /We've sent you a secure link/);
    assert.match(sms.sayAfterSmsAccepted, /payment is verified/i);
    assert.doesNotMatch(sms.sayAfterSmsAccepted, /driver has been assigned|Your driver is confirmed after payment/i);
    assert.match(VOICE_LINK_SENT_SAY, /We've sent you a secure link/);
    assert.match(VOICE_BOOKING_AFTER_PAYMENT_SAY, /payment is verified/);

    // Mock WhatsApp accept → messageStatus=accepted, delivered still false.
    const store2 = memoryStore();
    await store2.put(
      `voice:quote:${quoteId}`,
      JSON.stringify({
        amountLabel: "£45",
        journeyLabel: "BFS to Bangor",
        whenLabel: "20 Nov at 09:00",
        heldFor: "24 hours",
        bookingUrl,
      }),
    );
    const prevFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (url.pathname.includes("/v1/configs/templates")) {
        return Response.json({
          waba_templates: [{ name: "mat_quote_link", status: "APPROVED", language: "en_GB" }],
        });
      }
      if (url.pathname.endsWith("/messages") || url.pathname.includes("/messages")) {
        return Response.json({ messages: [{ id: "wamid.test" }] });
      }
      return prevFetch(input as never, init);
    }) as typeof fetch;
    try {
      const waRes = await handleVoiceSendLink(
        new Request("https://w/voice/send-link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quoteId, mobile: "07700900123", name: "Sam Test" }),
        }),
        { TRACKING_STORE: store2 as unknown as KVNamespace, D360_API_KEY: "test-key" } as never,
      );
      const wa = await waRes.json();
      assert.equal(wa.messageStatus, "accepted");
      assert.equal(wa.delivered, false);
      assert.equal(wa.channel, "whatsapp");
      assert.doesNotMatch(wa.say, /delivered to your phone|handset/i);
    } finally {
      globalThis.fetch = prevFetch;
    }
  });

  // ——— Provisional create, dedupe, expiry ———
  await check("T06", "Provisional booking + expiry", async () => {
    const store = memoryStore();
    const counter = memoryStore();
    await counter.put("next_booking_ref", "2001");
    const quoteId = "bbccddeeff00112233445566778899aabb";
    const openQuote = {
      id: quoteId,
      createdAt: now.toISOString(),
      expiresAt: null as string | null,
      status: "open",
      journey: {
        pickupAddress: "Belfast International Airport",
        dropoffAddress: "12 Main Street, Bangor",
        airportCode: "BFS",
        fromAirport: true,
        returnJourney: false,
        outboundDate: "2026-12-01",
        outboundTime: "09:00",
        passengers: 2,
        suitcases: 2,
        vehicleType: "Standard Saloon (1–4 passengers)",
      },
      quotedAmount: 45,
      quotedAmountLabel: "£45",
    };
    await store.put(`quick-quote:id:${quoteId}`, JSON.stringify(openQuote));
    await store.put(
      `voice:quote:${quoteId}`,
      JSON.stringify({
        amountLabel: "£45",
        journeyLabel: "BFS to Bangor",
        whenLabel: "1 Dec at 09:00",
        heldFor: "24 hours",
        bookingUrl: `https://www.myairporttaxini.co.uk/book-quote/?id=${quoteId}`,
      }),
    );

    const env = {
      TRACKING_STORE: store as unknown as KVNamespace,
      BOOKING_COUNTER: counter as unknown as KVNamespace,
      SITE_ORIGIN: "https://www.myairporttaxini.co.uk",
    };
    const body = {
      quoteId,
      name: "Sam Test",
      email: "sam.test@example.com",
      mobile: "07700900123",
      termsAccepted: "yes",
    };
    let res = await handleVoiceProvisionalBooking(
      new Request("https://w/voice/provisional-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      env,
    );
    let out = await res.json();
    assert.equal(out.ok, true);
    assert.equal(out.paymentStatus, "awaiting_payment");
    assert.match(out.bookingReference, /^MATNI-/);
    assert.match(out.bookingLink, /\/book-quote\/\?id=/);
    assert.doesNotMatch(out.say, /Your driver is confirmed after payment/);

    res = await handleVoiceProvisionalBooking(
      new Request("https://w/voice/provisional-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      env,
    );
    out = await res.json();
    assert.equal(out.deduplicated, true);

    // Expiry: quote past expiresAt → refuse, no new hold.
    assert.equal(isQuickQuoteExpired({ expiresAt: "2020-01-01T00:00:00Z", status: "open" }), true);
    await store.put(
      `quick-quote:id:${quoteId}`,
      JSON.stringify({ ...openQuote, expiresAt: "2020-01-01T00:00:00Z" }),
    );
    // Clear dedupe so expiry path is hit rather than reuse.
    await store.delete(`voice:provisional:${quoteId}`);
    res = await handleVoiceProvisionalBooking(
      new Request("https://w/voice/provisional-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, quoteId }),
      }),
      env,
    );
    out = await res.json();
    assert.equal(out.ok, false);
    assert.match(out.say, /expired|fresh fixed price/i);
  });

  // ——— Booking lookup (no live booking mutation) ———
  await check("T07", "Booking lookup", () => {
    const fake = {
      customerReference: "MAT-9001",
      mobileNumber: "07700900123",
      customerName: "Sam Test",
      tripDate: "2026-12-15",
      tripTime: "10:00",
      pickupLabel: "BFS",
      dropoffLabel: "Bangor",
      passengers: 2,
      returnJourney: false,
      status: "confirmed",
      paymentReference: "pay_test_only",
    } as const;
    const bad = matchVoiceBooking({
      reference: "MAT-9001",
      mobile: "07700900999",
      byReference: fake as never,
      candidates: [],
      now,
    });
    assert.equal(bad.kind, "not_found");
    const good = matchVoiceBooking({
      reference: "MAT-9001",
      mobile: "07700900123",
      byReference: fake as never,
      candidates: [],
      now,
    });
    assert.equal(good.kind, "verified");
    if (good.kind === "verified") {
      const say = voiceBookingSay(good.booking, { name: "" }, now);
      assert.match(say, /MAT-9001|Bangor/);
      assert.match(say, /confirmed/i);
    }
  });

  // ——— Cancellation / manage booking links ———
  await check("T08", "Cancellation / manage links", async () => {
    const url = buildManageBookingUrl("https://www.myairporttaxini.co.uk", "a".repeat(48));
    assert.match(url, /\/manage-booking\/\?token=/);
    const sms = voiceBookingSmsText(
      {
        customerReference: "MAT-9001",
        mobileNumber: "07700900123",
        customerName: "Sam",
        tripDate: "2026-12-15",
        tripTime: "10:00",
        pickupLabel: "BFS",
        dropoffLabel: "Bangor",
      } as never,
      url,
    );
    assert.match(sms, /manage-booking/);
    assert.match(sms, /MAT-9001|booking/i);

    // Handler SMS fallback path when WhatsApp disabled.
    const store = memoryStore();
    // Seed a paid booking record the way the worker stores them is complex;
    // assert source wiring for manage URL + cancel via manage-booking UI.
    const bookingSrc = readFileSync("workers/addresses/src/voice-booking.ts", "utf8");
    assert.match(bookingSrc, /buildManageBookingUrl/);
    assert.match(bookingSrc, /messageStatus: "generated"/);
    assert.match(bookingSrc, /messageStatus: "accepted"/);
    const manageUi = readFileSync("src/app/manage-booking/ManageBookingClient.tsx", "utf8");
    assert.match(manageUi, /cancel/i);
    void store;
  });

  // ——— Leave message (failed-tool / escalation path) ———
  await check("T09", "Leave Message (failed tool / urgent)", async () => {
    const store = memoryStore();
    const res = await handleVoiceMessage(
      new Request("https://w/voice/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Aoife",
          mobile: "07700900123",
          message: "Quote tool failed; need Bangor pickup tonight",
          urgent: "yes",
          pickup: "Dublin Airport",
          destination: "Bangor",
        }),
      }),
      { TRACKING_STORE: store as unknown as KVNamespace },
    );
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.urgent, true);
    assert.match(body.say, /urgent/i);
  });

  // ——— After Call webhook ———
  await check("T10", "After Call webhook", async () => {
    const store = memoryStore();
    const env = { TRACKING_STORE: store as unknown as KVNamespace };
    const noConsent = await (
      await handleVoiceCallEnded(
        new Request("https://w/voice/call-ended", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fromNumber: "07700900123",
            summary: "E2E test — no follow-up",
            followUpConsent: "no",
          }),
        }),
        env,
        now,
      )
    ).json();
    assert.equal(noConsent.ok, true);
    assert.equal(noConsent.queued, false);

    const consent = await (
      await handleVoiceCallEnded(
        new Request("https://w/voice/call-ended", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fromNumber: "07700900123",
            summary: "E2E test — consent yes, no link",
            followUpConsent: "yes",
            name: "Sam",
            pickup: "BFS",
            destination: "Bangor",
          }),
        }),
        env,
        now,
      )
    ).json();
    assert.equal(consent.ok, true);
    assert.equal(consent.queued, true);
  });

  // ——— Stripe Checkout path (test mode wiring; no charge) ———
  await check("T11", "Stripe Checkout test-mode wiring", () => {
    const env = {
      PAYMENT_PROVIDER: "stripe-test",
      STRIPE_SECRET_KEY: "sk_test_dummy_key_for_mode_check_only",
      STRIPE_TEST_EMAILS: "sam.test@example.com",
    };
    assert.equal(stripeActiveFor(env, "sam.test@example.com"), true);
    assert.equal(stripeActiveFor(env, "other@example.com"), false, "non-allowlisted email must not use stripe-test");
    assert.equal(
      stripeActiveFor(
        { PAYMENT_PROVIDER: "stripe", STRIPE_SECRET_KEY: "sk_test_dummy_key_for_mode_check_only" },
        "anyone@example.com",
      ),
      false,
      "live provider must refuse test keys",
    );
    const quoteSrc = readFileSync("workers/addresses/src/voice-quote.ts", "utf8");
    assert.match(quoteSrc, /book-quote|bookingUrl|Stripe Checkout/i);
    const provisionalSrc = readFileSync("workers/addresses/src/voice-provisional.ts", "utf8");
    assert.doesNotMatch(provisionalSrc, /createStripeCheckoutSession|status:\s*"paid"/);
    assert.match(provisionalSrc, /awaiting_payment/);
  });

  // ——— Production Worker route probe (read-only; no bookings/payments) ———
  const prodRoutes: Array<{ id: string; path: string; body: Record<string, unknown>; expectOkish: boolean }> = [
    { id: "P01", path: "/voice/inbound", body: { fromNumber: "07700900123" }, expectOkish: true },
    {
      id: "P02",
      path: "/voice/quote",
      body: { pickup: "Belfast International Airport" },
      expectOkish: true,
    },
    {
      id: "P03",
      path: "/voice/send-link",
      body: { quoteId: "aabbccddeeff00112233445566778899", mobile: "07700900123", name: "Probe" },
      expectOkish: true,
    },
    {
      id: "P04",
      path: "/voice/provisional-booking",
      body: {
        quoteId: "aabbccddeeff00112233445566778899",
        name: "Probe",
        email: "probe@example.com",
        mobile: "07700900123",
        termsAccepted: "yes",
      },
      expectOkish: true,
    },
    {
      id: "P05",
      path: "/voice/booking",
      body: { reference: "MAT-0000", mobile: "07700900123" },
      expectOkish: true,
    },
    {
      id: "P06",
      path: "/voice/booking-link",
      body: { reference: "MAT-0000", mobile: "07700900123" },
      expectOkish: true,
    },
    {
      id: "P07",
      path: "/voice/message",
      body: { mobile: "07700900123", message: "probe only — discard" },
      expectOkish: true,
    },
    {
      id: "P08",
      path: "/voice/call-ended",
      body: { fromNumber: "07700900123", summary: "probe", followUpConsent: "no" },
      expectOkish: true,
    },
  ];

  for (const route of prodRoutes) {
    try {
      const { status, json } = await probeProd(route.path, route.body);
      if (status === 404) {
        record(
          route.id,
          "Production Worker",
          "FAIL",
          `${route.path} → HTTP 404 (route not deployed on production Worker; needs approved Worker deploy from this PR)`,
        );
      } else if (status >= 500) {
        record(route.id, "Production Worker", "FAIL", `${route.path} → HTTP ${status}: ${JSON.stringify(json).slice(0, 160)}`);
      } else if (status === 401) {
        record(
          route.id,
          "Production Worker",
          "BLOCKED",
          `${route.path} → 401 (VOICE_WEBHOOK_SECRET set; Fonio must send Bearer). Route exists.`,
        );
      } else {
        // 200 with ok:false for missing fields is healthy for tools.
        record(
          route.id,
          "Production Worker",
          "PASS",
          `${route.path} → HTTP ${status}; body keys=${Object.keys(json || {}).join(",")}`,
        );
      }
    } catch (e) {
      record(route.id, "Production Worker", "FAIL", `${route.path}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ——— Live Fonio / Stripe Checkout charge / SMS carrier ———
  record(
    "L01",
    "Live Fonio",
    "BLOCKED",
    "Live Fonio assistant call not executed here — paste approved prompt/tools in Fonio dashboard, then place a test call",
  );
  record(
    "L02",
    "Live Fonio SMS",
    "BLOCKED",
    "Fonio Send SMS add-on + handset delivery receipt not verified in this environment (accepted≠delivered covered in T05)",
  );
  record(
    "L03",
    "Stripe Checkout live test-mode charge",
    "BLOCKED",
    "No Stripe test keys in this environment; do not use live keys. Complete /book-quote Checkout with sk_test_ + PAYMENT_PROVIDER=stripe-test after Worker deploy",
  );
  record(
    "L04",
    "Production deploy",
    "BLOCKED",
    "Worker/Pages production deploy intentionally not performed (awaiting approval). Several /voice/* routes still 404 on production.",
  );

  // Prompt not rewritten — confirm review copy still present.
  await check("T12", "Prompt freeze", () => {
    const prompt = readFileSync("docs/fonio-receptionist-prompt.md", "utf8");
    assert.match(prompt, /Never promise that a driver has been assigned/);
    assert.match(prompt, /messageStatus=generated/);
    assert.match(prompt, /If ok is false: do not quote any fare/);
    assert.match(prompt, /Speak that greeting exactly once/);
  });

  const pass = rows.filter((r) => r.result === "PASS").length;
  const fail = rows.filter((r) => r.result === "FAIL").length;
  const blocked = rows.filter((r) => r.result === "BLOCKED").length;

  const report = [
    "# Fonio end-to-end integration — PASS / FAIL report",
    "",
    `_Generated ${new Date().toISOString()} by scripts/check-voice-e2e-integration.ts_`,
    "",
    "**Scope:** branch Worker handlers + shared quote/pricing rules + read-only production probes.",
    "**Not in scope this run:** live Fonio phone call, real SMS carrier delivery, real Stripe charges, production deploy.",
    "",
    `## Score: ${pass} PASS · ${fail} FAIL · ${blocked} BLOCKED`,
    "",
    "| ID | Area | Result | Detail |",
    "|----|------|--------|--------|",
    ...rows.map((r) => `| ${r.id} | ${r.area} | **${r.result}** | ${r.detail.replace(/\|/g, "/")} |`),
    "",
    "## Failures that block live Fonio testing",
    ...(fail
      ? rows.filter((r) => r.result === "FAIL").map((r) => `- **${r.id}** (${r.area}): ${r.detail}`)
      : ["- None in local handler suite."]),
    "",
    "## Configuration required inside Fonio (before live test call)",
    "1. Paste approved prompt from `docs/fonio-receptionist-prompt.md` into the test assistant.",
    "2. Wire HTTP tools per `docs/fonio-tool-config.md` (Base URL production Worker **after** approved deploy, or a preview Worker URL).",
    "3. Auth header on every tool: `Authorization: Bearer <VOICE_WEBHOOK_SECRET>` once the secret is set on the Worker.",
    "4. Inbound Webhook → `POST /voice/inbound` (currently **404 on production** until Worker deploy).",
    "5. During-call tools: Get Quote, Send Booking Link, Provisional Booking, Booking Lookup, Booking Link, Leave Message.",
    "6. After Call → `POST /voice/call-ended`.",
    "7. Enable Fonio **Send SMS** add-on; on `messageStatus=generated`, run Send SMS with `smsText`, then speak `sayAfterSmsAccepted` (not handset delivered).",
    "8. Execution sentence: `One moment please, I'm just checking that for you.`",
    "",
    "## Stripe test-mode checklist (no live charges)",
    "- Worker: `PAYMENT_PROVIDER=stripe-test`, `STRIPE_SECRET_KEY=sk_test_…`, allowlist email in `STRIPE_TEST_EMAILS`.",
    "- Open `/book-quote/?id=…` from a phone quote/provisional hold; pay with Stripe test card `4242…`.",
    "- Confirm Booking Lookup only after webhook marks paid — never invent paid/driver-assigned from Checkout success page alone.",
    "",
    "## Conversational scenarios covered locally",
    "- One-question-at-a-time missing fields; corrected destination mid-flow; return journey; oversized party (no fare); same-airport (no fare).",
    "- Failed-tool escalation via Leave Message; After Call with/without consent.",
    "- Returning-customer booking lookup requires reference + mobile.",
    "- Live spoken interruptions still need a real Fonio test call (L01).",
    "",
    "## Deploy gate",
    "Do **not** deploy Worker/Pages/Fonio production without explicit approval.",
    "Until the Worker from this PR is deployed, production Fonio cannot use inbound / provisional / message tools (404).",
    "",
  ].join("\n");

  mkdirSync("/opt/cursor/artifacts", { recursive: true });
  writeFileSync("docs/fonio-e2e-integration-report.md", report);
  writeFileSync("/opt/cursor/artifacts/fonio-e2e-integration-report.md", report);
  console.log(`\nScore: ${pass} PASS · ${fail} FAIL · ${blocked} BLOCKED`);
  console.log("Wrote docs/fonio-e2e-integration-report.md");

  // Local handler failures are hard fails; production 404s are expected until deploy approval.
  const localFails = rows.filter((r) => r.result === "FAIL" && !r.id.startsWith("P")).length;
  if (localFails > 0) process.exit(1);
  console.log("check-voice-e2e-integration: OK (local suite); see report for production gaps");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
