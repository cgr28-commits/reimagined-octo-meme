/** Owner inbox: Resend webhook in, threads, replies with signature, email a customer from a booking. */
import assert from "node:assert/strict";
import {
  baseSubject,
  bookingEmailSubject,
  buildOwnerOutgoingEmail,
  inboxThreadKey,
  signatureHtml,
} from "../shared/owner-inbox";
import type { PaidBookingRecord } from "../shared/paid-booking-record";
import {
  handleOwnerEmailCustomer,
  handleOwnerEmailCustomerDraft,
  handleOwnerInboxArchive,
  handleOwnerInboxList,
  handleOwnerInboxReply,
  handleOwnerInboxSetup,
  handleOwnerInboxThread,
  handleResendInboundWebhook,
  inboundToMessage,
} from "../workers/addresses/src/owner-inbox-handlers";
import { signResendWebhookForTest, verifyResendWebhookSignature } from "../workers/addresses/src/owner-inbox-store";
import { savePaidBookingRecord } from "../workers/addresses/src/paid-booking-store";

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
    async list() {
      return { keys: [], list_complete: true };
    },
  } as unknown as KVNamespace & { kv: Map<string, string> };
}

const OWNER = "owner-secret-key";
const ownerHeaders = { "X-Owner-Key": OWNER };
const SECRET = "whsec_" + Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");

function booking(): PaidBookingRecord {
  return {
    paymentReference: "PAY-1",
    customerReference: "MAT-1563",
    checkoutId: "chk-1",
    amount: 55,
    currency: "GBP",
    amountPaidLabel: "£55.00",
    customerName: "Sarah Jones",
    customerEmail: "Sarah@Example.com",
    mobileNumber: "07700900123",
    tripLabel: "x",
    pickupLabel: "12 Main Street, Glengormley BT36",
    dropoffLabel: "Belfast International Airport (BFS), Aldergrove",
    returnJourney: false,
    tripDate: "2026-11-20",
    tripTime: "05:30",
    passengers: 2,
    suitcases: 2,
    vehicle: "Saloon",
    flightNumber: "EZY123",
    calendarEventIds: [],
    status: "confirmed",
    createdAt: "2026-10-01T10:00:00.000Z",
  } as PaidBookingRecord;
}

async function main() {
  // Pure helpers.
  assert.equal(baseSubject("Re: RE: Fwd: Pickup time"), "Pickup time");
  assert.equal(inboxThreadKey("Sarah <SARAH@example.com>", "Re: Pickup time"), "sarah@example.com|pickup time");
  const subject = bookingEmailSubject({
    reference: "MAT-1563",
    customerName: "Sarah",
    customerEmail: "s@x.com",
    tripDate: "2026-11-20",
    tripTime: "05:30",
    pickupLabel: "12 Main Street, Glengormley BT36",
    dropoffLabel: "Belfast International Airport (BFS), Aldergrove",
  });
  assert.equal(subject, "MAT-1563 · Fri 20 Nov 2026, 05:30 · 12 Main Street → Belfast International Airport (BFS)");
  const sig = signatureHtml();
  assert.match(sig, /https:\/\/www\.myairporttaxini\.co\.uk\/logo\.png/, "signature has the real logo");
  assert.doesNotMatch(sig, /Brian/, "no personal name in the signature");
  assert.match(sig, /My Airport Taxi NI/);
  assert.match(sig, /028 9602 2952/);
  assert.match(sig, /bookings@myairporttaxini\.co\.uk/);
  assert.doesNotMatch(sig.replace(/href="[^"]*"/g, ""), /07549|447549/, "WhatsApp number only in the link, never shown");
  const out = buildOwnerOutgoingEmail({ message: "Hi <Sarah>\n\nSee you then.", quoted: { from: "Sarah", at: "today", text: "What time?" } });
  assert.match(out.html, /Hi &lt;Sarah&gt;/, "message is escaped");
  assert.match(out.text, /> What time\?/);

  // Signature verification.
  const now = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({ type: "email.received", data: { email_id: "em-1" } });
  const sigHeader = await signResendWebhookForTest(SECRET, "msg_1", String(now), body);
  assert.equal(await verifyResendWebhookSignature({ secret: SECRET, id: "msg_1", timestamp: String(now), signatureHeader: sigHeader, body }), true);
  assert.equal(await verifyResendWebhookSignature({ secret: SECRET, id: "msg_1", timestamp: String(now), signatureHeader: sigHeader, body: body + " " }), false);
  assert.equal(await verifyResendWebhookSignature({ secret: SECRET, id: "msg_1", timestamp: String(now - 3600), signatureHeader: sigHeader, body }), false);

  const store = memoryStore();
  await savePaidBookingRecord(store, booking());

  // Fake Resend API.
  const sent: Array<Record<string, unknown>> = [];
  const fakeFetch = async (url: string, init?: RequestInit) => {
    if (url === "https://api.resend.com/webhooks") {
      return new Response(JSON.stringify({ id: "wh-1", signing_secret: SECRET }), { status: 200 });
    }
    if (url.startsWith("https://api.resend.com/emails/receiving/")) {
      return new Response(
        JSON.stringify({
          id: "em-1",
          from: "Sarah Jones <sarah@example.com>",
          to: ["bookings@myairporttaxini.co.uk"],
          subject: "Question about MAT-1563",
          text: "Hi, can you pick us up at 5am instead?",
          html: "<p>Hi, can you pick us up at 5am instead?</p>",
          created_at: "2026-10-30T08:00:00.000Z",
          message_id: "<abc@mail.example.com>",
          headers: {},
          attachments: [{ id: "a1", filename: "ticket.pdf", content_type: "application/pdf", content_disposition: "attachment", size: 1234 }],
        }),
        { status: 200 },
      );
    }
    if (url === "https://api.resend.com/emails") {
      sent.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ id: `sent-${sent.length}` }), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  };
  const env = { TRACKING_STORE: store, OWNER_ACCESS_KEY: OWNER, RESEND_API_KEY: "re_test" };

  // Setup: owner only; creates webhook via API and stores the secret.
  let res = await handleOwnerInboxSetup(new Request("https://w/owner/inbox/setup", { method: "POST", body: "{}" }), env, null, fakeFetch);
  assert.equal(res.status, 401);
  res = await handleOwnerInboxSetup(new Request("https://w/owner/inbox/setup", { method: "POST", headers: ownerHeaders, body: "{}" }), env, null, fakeFetch);
  assert.equal(res.status, 200);

  // Webhook: bad signature rejected; good one stores the email with body + attachments.
  const hook = async (payload: string, id = "msg_1", ts = String(now)) =>
    handleResendInboundWebhook(
      new Request("https://w/inbound/resend", {
        method: "POST",
        headers: { "svix-id": id, "svix-timestamp": ts, "svix-signature": await signResendWebhookForTest(SECRET, id, ts, payload) },
        body: payload,
      }),
      env,
      fakeFetch,
    );
  res = await handleResendInboundWebhook(
    new Request("https://w/inbound/resend", { method: "POST", headers: { "svix-id": "x", "svix-timestamp": String(now), "svix-signature": "v1,AAAA" }, body }),
    env,
    fakeFetch,
  );
  assert.equal(res.status, 401);
  res = await hook(body);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "stored");
  res = await hook(body);
  assert.equal(await res.text(), "duplicate", "webhook retries don't duplicate");

  res = await handleOwnerInboxList(new Request("https://w/owner/inbox", { headers: ownerHeaders }), env, null);
  const list = (await res.json()) as { connected: boolean; threads: Array<{ threadKey: string; unread: number; bookingRef?: string; counterpartName?: string }> };
  assert.equal(list.connected, true);
  assert.equal(list.threads.length, 1);
  assert.equal(list.threads[0]!.unread, 1);
  assert.equal(list.threads[0]!.bookingRef, "MAT-1563");
  assert.equal(list.threads[0]!.counterpartName, "Sarah Jones");
  const threadKey = list.threads[0]!.threadKey;

  // Opening the thread marks it read and shows the customer's bookings.
  res = await handleOwnerInboxThread(new Request(`https://w/owner/inbox/thread?key=${encodeURIComponent(threadKey)}`, { headers: ownerHeaders }), env, null);
  const thread = (await res.json()) as { messages: Array<{ read?: boolean; attachments?: unknown[] }>; bookings: Array<{ reference: string; paymentReference: string }> };
  assert.equal(thread.messages[0]!.read, true);
  assert.equal(thread.messages[0]!.attachments?.length, 1);
  assert.deepEqual(thread.bookings.map((b) => b.reference), ["MAT-1563"]);

  // Reply: threads (In-Reply-To), Re: subject, signature, BCC to mailbox, booking box, stored as sent.
  res = await handleOwnerInboxReply(
    new Request("https://w/owner/inbox/reply", {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({ threadKey, message: "Yes, 5am is fine.", paymentReference: "PAY-1" }),
    }),
    env,
    null,
    fakeFetch,
  );
  assert.equal(res.status, 200);
  const reply = sent[0]!;
  assert.deepEqual(reply.to, ["Sarah Jones <sarah@example.com>"]);
  assert.equal(reply.subject, "Re: Question about MAT-1563");
  assert.deepEqual(reply.bcc, ["bookings@myairporttaxini.co.uk"]);
  assert.equal((reply.headers as Record<string, string>)["In-Reply-To"], "<abc@mail.example.com>");
  assert.match(String(reply.html), /logo\.png/);
  assert.match(String(reply.html), /Your booking/);
  assert.match(String(reply.html), /manage-booking\/\?token=/);
  assert.match(String(reply.text), /> Hi, can you pick us up at 5am instead\?/);

  // Can't attach someone else's booking.
  const other = { ...booking(), paymentReference: "PAY-2", customerReference: "MAT-2000", checkoutId: "chk-2", customerEmail: "tom@example.com" };
  await savePaidBookingRecord(store, other as PaidBookingRecord);
  res = await handleOwnerInboxReply(
    new Request("https://w/owner/inbox/reply", { method: "POST", headers: ownerHeaders, body: JSON.stringify({ threadKey, message: "x", paymentReference: "PAY-2" }) }),
    env,
    null,
    fakeFetch,
  );
  assert.equal(res.status, 400);

  // Our own BCC copy coming back through the GoDaddy forward is ignored.
  assert.equal(
    inboundToMessage({ from: "My Airport Taxi NI <bookings@myairporttaxini.co.uk>", to: ["sarah@example.com"], subject: "Re: x", text: "y" }, "em-2", "bookings@myairporttaxini.co.uk"),
    null,
  );
  // A forward that rewrote the sender is recovered from Reply-To.
  const rewritten = inboundToMessage(
    { from: "bookings@myairporttaxini.co.uk", to: ["bookings@myairporttaxini.co.uk"], reply_to: ["Tom <tom@example.com>"], subject: "Hello", text: "hi" },
    "em-3",
    "bookings@myairporttaxini.co.uk",
  );
  assert.equal(rewritten?.counterpartEmail, "tom@example.com");

  // Email a customer from their booking: subject has the booking details.
  res = await handleOwnerEmailCustomerDraft(new Request("https://w/owner/email-customer/draft?paymentReference=PAY-1", { headers: ownerHeaders }), env, null);
  const draft = (await res.json()) as { to: string; subject: string };
  assert.equal(draft.to, "sarah@example.com");
  assert.match(draft.subject, /^MAT-1563 · Fri 20 Nov 2026, 05:30 · 12 Main Street → Belfast International Airport/);
  res = await handleOwnerEmailCustomer(
    new Request("https://w/owner/email-customer", {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({ paymentReference: "PAY-1", message: "Your driver will be Brian." }),
    }),
    env,
    null,
    fakeFetch,
  );
  assert.equal(res.status, 200);
  assert.equal(sent[1]!.subject, draft.subject);
  assert.match(String(sent[1]!.html), /Flight:<\/span> EZY123/);

  // Archive hides the thread; a new email from the customer brings it back.
  await handleOwnerInboxArchive(new Request("https://w/owner/inbox/archive", { method: "POST", headers: ownerHeaders, body: JSON.stringify({ threadKey }) }), env, null);
  res = await handleOwnerInboxList(new Request("https://w/owner/inbox", { headers: ownerHeaders }), env, null);
  const afterArchive = (await res.json()) as { threads: Array<{ threadKey: string; archived: boolean }> };
  assert.equal(afterArchive.threads.find((t) => t.threadKey === threadKey)?.archived, true);
  assert.equal(afterArchive.threads.length, 2, "reply thread + booking email thread");

  console.log("check-owner-inbox: OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
