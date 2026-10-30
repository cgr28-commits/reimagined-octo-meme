/**
 * Owner inbox endpoints.
 *
 *   POST /inbound/resend                Resend "email.received" webhook (signature checked)
 *   GET  /owner/inbox                   threads + connection status
 *   GET  /owner/inbox/thread?key=…      one conversation (marks it read) + that customer's bookings
 *   POST /owner/inbox/reply             { threadKey, message, paymentReference? }
 *   POST /owner/inbox/archive           { threadKey, archived }
 *   POST /owner/inbox/setup             {} → create the Resend webhook automatically, or { secret } to paste one
 *   GET  /owner/email-customer/draft?paymentReference=…
 *   POST /owner/email-customer          { paymentReference, subject?, message, includeBookingDetails? }
 */
import { corsHeaders } from "../shared/google-places";
import { BUSINESS_MAILBOX, BUSINESS_NAME } from "../shared/business-email";
import type { PaidBookingRecord } from "../shared/paid-booking-record";
import {
  INBOX_MESSAGE_MAX,
  INBOX_SUBJECT_MAX,
  bookingEmailSubject,
  buildOwnerOutgoingEmail,
  displayNameFromAddress,
  findBookingRef,
  htmlToPlainText,
  inboxThreadKey,
  normalizeInboxEmail,
  replySubject,
  summarizeInboxThreads,
  type InboxAttachmentMeta,
  type InboxBookingDetails,
  type InboxMessage,
} from "../shared/owner-inbox";
import { ownerAuthorized, type DriverAuthEnv } from "./driver-auth";
import { listCustomerBookingRefs } from "./customer-account-store";
import { ensureManageBookingToken, getPaidBookingRecord } from "./paid-booking-store";
import {
  getInboxWebhookConfig,
  listInboxMessages,
  markWebhookEventSeen,
  saveInboxMessage,
  saveInboxWebhookConfig,
  updateInboxMessage,
  verifyResendWebhookSignature,
} from "./owner-inbox-store";

const SITE_ORIGIN = "https://www.myairporttaxini.co.uk";
export const INBOX_WEBHOOK_ENDPOINT = "https://reimagined-octo-meme.cgr28.workers.dev/inbound/resend";

export type OwnerInboxEnv = DriverAuthEnv & {
  TRACKING_STORE?: KVNamespace;
  RESEND_API_KEY?: string;
  RESEND_WEBHOOK_SECRET?: string;
  BOOKING_FROM_EMAIL?: string;
};

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...corsHeaders(origin) },
  });
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function mailbox(env: OwnerInboxEnv): string {
  return (env.BOOKING_FROM_EMAIL?.trim() || BUSINESS_MAILBOX).toLowerCase();
}

function asList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v));
  if (typeof value === "string" && value.trim()) return value.split(",");
  return [];
}

function headerValue(headers: unknown, name: string): string {
  if (!headers || typeof headers !== "object") return "";
  for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
    if (k.toLowerCase() === name) return Array.isArray(v) ? String(v[0] ?? "") : String(v ?? "");
  }
  return "";
}

/* ───────────────────────── Resend webhook ───────────────────────── */

export async function handleResendInboundWebhook(
  request: Request,
  env: OwnerInboxEnv,
  fetchImpl: FetchLike = fetch,
): Promise<Response> {
  const store = env.TRACKING_STORE;
  if (!store) return new Response("not configured", { status: 503 });
  const body = await request.text();
  const config = await getInboxWebhookConfig(store);
  const secret = config?.secret || env.RESEND_WEBHOOK_SECRET?.trim() || "";
  const ok = await verifyResendWebhookSignature({
    secret,
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signatureHeader: request.headers.get("svix-signature"),
    body,
  });
  if (!ok) return new Response("invalid signature", { status: 401 });

  let event: { type?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(body);
  } catch {
    return new Response("bad json", { status: 400 });
  }
  if (event.type !== "email.received" || !event.data) return new Response("ignored", { status: 200 });
  const emailId = String(event.data.email_id ?? event.data.id ?? "").trim();
  if (!emailId) return new Response("no id", { status: 200 });
  if (!(await markWebhookEventSeen(store, request.headers.get("svix-id") || emailId))) {
    return new Response("duplicate", { status: 200 });
  }

  // The webhook only carries metadata — fetch the body from Resend.
  let full: Record<string, unknown> = event.data;
  const apiKey = env.RESEND_API_KEY?.trim();
  if (apiKey) {
    const res = await fetchImpl(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    });
    if (res.ok) full = { ...event.data, ...((await res.json()) as Record<string, unknown>) };
  }

  const message = inboundToMessage(full, emailId, mailbox(env));
  if (!message) return new Response("skipped own copy", { status: 200 });
  await saveInboxMessage(store, message);
  return new Response("stored", { status: 200 });
}

/** Turn a received email into an inbox message. Returns null for copies of our own outgoing mail. */
export function inboundToMessage(data: Record<string, unknown>, id: string, ownMailbox: string): InboxMessage | null {
  const fromRaw = String(data.from ?? headerValue(data.headers, "from") ?? "");
  let from = normalizeInboxEmail(fromRaw);
  let fromName = displayNameFromAddress(fromRaw) || displayNameFromAddress(headerValue(data.headers, "from"));
  const to = [...asList(data.to), ...asList(data.received_for)].map(normalizeInboxEmail);

  if (from === ownMailbox) {
    // Our own outgoing mail (BCC'd to the mailbox, then copied here) — already stored when sent.
    if (!to.includes(ownMailbox)) return null;
    // Forwarded with the sender rewritten: recover the real sender from Reply-To if present.
    const replyTo = [...asList(data.reply_to), headerValue(data.headers, "reply-to")].map(normalizeInboxEmail).find(Boolean);
    if (replyTo && replyTo !== ownMailbox) {
      from = replyTo;
      fromName = displayNameFromAddress(headerValue(data.headers, "reply-to")) || fromName;
    }
  }
  if (!from) return null;

  const subject = String(data.subject ?? "").slice(0, 500) || "(no subject)";
  const html = typeof data.html === "string" ? data.html : "";
  const text = (typeof data.text === "string" && data.text.trim() ? data.text : htmlToPlainText(html)).slice(0, 50_000);
  const attachments: InboxAttachmentMeta[] = Array.isArray(data.attachments)
    ? (data.attachments as Array<Record<string, unknown>>)
        .filter((a) => String(a.content_disposition ?? "") !== "inline")
        .map((a) => ({
          id: String(a.id ?? ""),
          filename: String(a.filename ?? "attachment"),
          contentType: String(a.content_type ?? ""),
          ...(typeof a.size === "number" ? { size: a.size } : {}),
        }))
    : [];

  return {
    id: `in-${id}`.slice(0, 120),
    direction: "in",
    counterpartEmail: from,
    ...(fromName ? { counterpartName: fromName.slice(0, 120) } : {}),
    subject,
    text,
    ...(html ? { html: html.slice(0, 200_000) } : {}),
    at: String(data.created_at ?? new Date().toISOString()),
    ...(data.message_id ? { messageId: String(data.message_id) } : {}),
    ...(headerValue(data.headers, "in-reply-to") ? { inReplyTo: headerValue(data.headers, "in-reply-to") } : {}),
    ...(headerValue(data.headers, "references") ? { references: headerValue(data.headers, "references") } : {}),
    ...(attachments.length ? { attachments } : {}),
    ...(findBookingRef(subject, text) ? { bookingRef: findBookingRef(subject, text) } : {}),
    read: false,
    threadKey: inboxThreadKey(from, subject),
  };
}

/* ───────────────────────── Sending ───────────────────────── */

async function sendViaResend(
  env: OwnerInboxEnv,
  fetchImpl: FetchLike,
  input: {
    to: string;
    toName?: string;
    subject: string;
    text: string;
    html: string;
    inReplyTo?: string;
    references?: string;
  },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) return { ok: false, error: "Email sending is not set up (Resend key missing)." };
  const from = mailbox(env);
  const headers: Record<string, string> = {};
  if (input.inReplyTo) headers["In-Reply-To"] = input.inReplyTo;
  if (input.references) headers["References"] = input.references;
  const res = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      from: `${BUSINESS_NAME} <${from}>`,
      to: [input.toName ? `${input.toName.replace(/[<>"]/g, "")} <${input.to}>` : input.to],
      // Copy to the mailbox so the conversation is also in GoDaddy mail.
      bcc: [from],
      reply_to: from,
      subject: input.subject,
      text: input.text,
      html: input.html,
      ...(Object.keys(headers).length ? { headers } : {}),
    }),
  });
  const payload = (await res.json().catch(() => null)) as { id?: string; message?: string } | null;
  if (!res.ok || !payload?.id) return { ok: false, error: payload?.message || `Email could not be sent (HTTP ${res.status}).` };
  return { ok: true, id: payload.id };
}

async function bookingDetails(store: KVNamespace, record: PaidBookingRecord): Promise<InboxBookingDetails> {
  const withToken = await ensureManageBookingToken(store, record).catch(() => record);
  return {
    reference: withToken.customerReference || withToken.paymentReference,
    customerName: withToken.customerName,
    customerEmail: withToken.customerEmail,
    tripDate: withToken.tripDate,
    tripTime: withToken.tripTime,
    pickupLabel: withToken.pickupLabel,
    dropoffLabel: withToken.dropoffLabel,
    returnJourney: withToken.returnJourney,
    returnDate: withToken.returnDate,
    returnTime: withToken.returnTime,
    passengers: withToken.passengers,
    suitcases: withToken.suitcases,
    vehicle: withToken.vehicle,
    flightNumber: withToken.flightNumber,
    ...(withToken.manageBookingToken
      ? { manageUrl: `${SITE_ORIGIN}/manage-booking/?token=${encodeURIComponent(withToken.manageBookingToken)}` }
      : {}),
  };
}

function quotedFrom(message: InboxMessage): { from: string; at: string; text: string } {
  const at = new Date(message.at);
  const when = Number.isNaN(at.getTime())
    ? message.at
    : at.toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short" });
  const who = message.counterpartName ? `${message.counterpartName} <${message.counterpartEmail}>` : message.counterpartEmail;
  return { from: who, at: when, text: message.text };
}

function outgoingRecord(input: {
  id: string;
  to: string;
  toName?: string;
  subject: string;
  text: string;
  threadKey: string;
  inReplyTo?: string;
  bookingRef?: string;
}): InboxMessage {
  return {
    id: `out-${input.id}`.slice(0, 120),
    direction: "out",
    counterpartEmail: input.to,
    ...(input.toName ? { counterpartName: input.toName } : {}),
    subject: input.subject,
    text: input.text,
    at: new Date().toISOString(),
    ...(input.inReplyTo ? { inReplyTo: input.inReplyTo } : {}),
    ...(input.bookingRef ? { bookingRef: input.bookingRef } : {}),
    read: true,
    threadKey: input.threadKey,
  };
}

/* ───────────────────────── Owner endpoints ───────────────────────── */

export async function handleOwnerInboxList(request: Request, env: OwnerInboxEnv, origin: string | null): Promise<Response> {
  if (!ownerAuthorized(request, env)) return json({ error: "Owner access required" }, 401, origin);
  const store = env.TRACKING_STORE;
  if (!store) return json({ error: "Storage not configured" }, 503, origin);
  const config = await getInboxWebhookConfig(store);
  const messages = await listInboxMessages(store);
  return json(
    {
      connected: Boolean(config?.secret || env.RESEND_WEBHOOK_SECRET?.trim()),
      connection: config ? { source: config.source, createdAt: config.createdAt } : null,
      lastReceivedAt: messages.find((m) => m.direction === "in")?.at ?? null,
      threads: summarizeInboxThreads(messages),
    },
    200,
    origin,
  );
}

export async function handleOwnerInboxThread(request: Request, env: OwnerInboxEnv, origin: string | null): Promise<Response> {
  if (!ownerAuthorized(request, env)) return json({ error: "Owner access required" }, 401, origin);
  const store = env.TRACKING_STORE;
  if (!store) return json({ error: "Storage not configured" }, 503, origin);
  const key = new URL(request.url).searchParams.get("key") ?? "";
  const messages = (await listInboxMessages(store)).filter((m) => m.threadKey === key).sort((a, b) => a.at.localeCompare(b.at));
  if (!messages.length) return json({ error: "Conversation not found" }, 404, origin);
  for (const m of messages) {
    if (m.direction === "in" && !m.read) {
      await updateInboxMessage(store, m.id, { read: true });
      m.read = true;
    }
  }
  // This customer's bookings (same email), so a reply can include booking details.
  const email = messages[0]!.counterpartEmail;
  const refs = await listCustomerBookingRefs(store, email);
  const bookings: Array<{ paymentReference: string; reference: string; tripDate: string; tripTime: string; route: string }> = [];
  for (const ref of refs.slice(-10).reverse()) {
    const r = await getPaidBookingRecord(store, ref);
    if (!r) continue;
    bookings.push({
      paymentReference: r.paymentReference,
      reference: r.customerReference || r.paymentReference,
      tripDate: r.tripDate,
      tripTime: r.tripTime,
      route: `${(r.pickupLabel ?? "").split(",")[0]} → ${(r.dropoffLabel ?? "").split(",")[0]}`,
    });
  }
  return json({ messages, bookings }, 200, origin);
}

export async function handleOwnerInboxReply(
  request: Request,
  env: OwnerInboxEnv,
  origin: string | null,
  fetchImpl: FetchLike = fetch,
): Promise<Response> {
  if (!ownerAuthorized(request, env)) return json({ error: "Owner access required" }, 401, origin);
  const store = env.TRACKING_STORE;
  if (!store) return json({ error: "Storage not configured" }, 503, origin);
  const body = await readBody(request);
  const threadKey = String(body.threadKey ?? "");
  const text = String(body.message ?? "").trim();
  if (!text) return json({ error: "Please write a message." }, 400, origin);
  if (text.length > INBOX_MESSAGE_MAX) return json({ error: "Message is too long." }, 400, origin);
  const thread = (await listInboxMessages(store)).filter((m) => m.threadKey === threadKey).sort((a, b) => a.at.localeCompare(b.at));
  if (!thread.length) return json({ error: "Conversation not found" }, 404, origin);
  const lastIn = [...thread].reverse().find((m) => m.direction === "in");
  const first = thread[0]!;
  const to = first.counterpartEmail;
  const toName = lastIn?.counterpartName || first.counterpartName;

  let booking: InboxBookingDetails | null = null;
  const paymentReference = String(body.paymentReference ?? "").trim();
  if (paymentReference) {
    const record = await getPaidBookingRecord(store, paymentReference);
    if (!record || normalizeInboxEmail(record.customerEmail) !== to) {
      return json({ error: "That booking doesn't belong to this customer." }, 400, origin);
    }
    booking = await bookingDetails(store, record);
  }

  const subject = replySubject(first.subject);
  const email = buildOwnerOutgoingEmail({ message: text, booking, quoted: lastIn ? quotedFrom(lastIn) : null });
  const references = lastIn?.messageId ? [lastIn.references, lastIn.messageId].filter(Boolean).join(" ") : undefined;
  const sent = await sendViaResend(env, fetchImpl, {
    to,
    toName,
    subject,
    text: email.text,
    html: email.html,
    inReplyTo: lastIn?.messageId,
    references,
  });
  if (!sent.ok) return json({ error: sent.error }, 502, origin);
  const record = outgoingRecord({
    id: sent.id,
    to,
    toName,
    subject,
    text,
    threadKey,
    inReplyTo: lastIn?.messageId,
    bookingRef: booking?.reference ?? first.bookingRef,
  });
  await saveInboxMessage(store, record);
  return json({ ok: true, message: record }, 200, origin);
}

export async function handleOwnerInboxArchive(request: Request, env: OwnerInboxEnv, origin: string | null): Promise<Response> {
  if (!ownerAuthorized(request, env)) return json({ error: "Owner access required" }, 401, origin);
  const store = env.TRACKING_STORE;
  if (!store) return json({ error: "Storage not configured" }, 503, origin);
  const body = await readBody(request);
  const threadKey = String(body.threadKey ?? "");
  const archived = body.archived !== false;
  const thread = (await listInboxMessages(store)).filter((m) => m.threadKey === threadKey);
  for (const m of thread) await updateInboxMessage(store, m.id, { archived, ...(archived ? { read: true } : {}) });
  return json({ ok: true, updated: thread.length }, 200, origin);
}

export async function handleOwnerInboxSetup(
  request: Request,
  env: OwnerInboxEnv,
  origin: string | null,
  fetchImpl: FetchLike = fetch,
): Promise<Response> {
  if (!ownerAuthorized(request, env)) return json({ error: "Owner access required" }, 401, origin);
  const store = env.TRACKING_STORE;
  if (!store) return json({ error: "Storage not configured" }, 503, origin);
  const body = await readBody(request);
  const pasted = String(body.secret ?? "").trim();
  if (pasted) {
    if (!/^whsec_[A-Za-z0-9+/=]{16,}$/.test(pasted)) return json({ error: "That doesn't look like a Resend signing secret (whsec_…)." }, 400, origin);
    await saveInboxWebhookConfig(store, { secret: pasted, createdAt: new Date().toISOString(), source: "manual" });
    return json({ ok: true, source: "manual", endpoint: INBOX_WEBHOOK_ENDPOINT }, 200, origin);
  }
  const existing = await getInboxWebhookConfig(store);
  if (existing?.secret && body.force !== true) {
    return json({ ok: true, source: existing.source, already: true, endpoint: INBOX_WEBHOOK_ENDPOINT }, 200, origin);
  }
  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) return json({ error: "Resend key is not set on the Worker." }, 503, origin);
  const res = await fetchImpl("https://api.resend.com/webhooks", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ endpoint: INBOX_WEBHOOK_ENDPOINT, events: ["email.received"] }),
  });
  const payload = (await res.json().catch(() => null)) as { id?: string; signing_secret?: string; message?: string } | null;
  if (!res.ok || !payload?.signing_secret) {
    return json(
      {
        error:
          (payload?.message ? `Resend said: ${payload.message}. ` : "") +
          "Automatic setup didn't work — add the webhook in Resend and paste its signing secret instead.",
        endpoint: INBOX_WEBHOOK_ENDPOINT,
        manual: true,
      },
      502,
      origin,
    );
  }
  await saveInboxWebhookConfig(store, {
    id: payload.id,
    secret: payload.signing_secret,
    createdAt: new Date().toISOString(),
    source: "api",
  });
  return json({ ok: true, source: "api", endpoint: INBOX_WEBHOOK_ENDPOINT }, 200, origin);
}

export async function handleOwnerEmailCustomerDraft(request: Request, env: OwnerInboxEnv, origin: string | null): Promise<Response> {
  if (!ownerAuthorized(request, env)) return json({ error: "Owner access required" }, 401, origin);
  const store = env.TRACKING_STORE;
  if (!store) return json({ error: "Storage not configured" }, 503, origin);
  const ref = new URL(request.url).searchParams.get("paymentReference")?.trim() ?? "";
  const record = ref ? await getPaidBookingRecord(store, ref) : null;
  if (!record) return json({ error: "Booking not found" }, 404, origin);
  const details = await bookingDetails(store, record);
  return json(
    {
      to: normalizeInboxEmail(record.customerEmail),
      name: record.customerName,
      subject: bookingEmailSubject(details),
      reference: details.reference,
    },
    200,
    origin,
  );
}

export async function handleOwnerEmailCustomer(
  request: Request,
  env: OwnerInboxEnv,
  origin: string | null,
  fetchImpl: FetchLike = fetch,
): Promise<Response> {
  if (!ownerAuthorized(request, env)) return json({ error: "Owner access required" }, 401, origin);
  const store = env.TRACKING_STORE;
  if (!store) return json({ error: "Storage not configured" }, 503, origin);
  const body = await readBody(request);
  const record = await getPaidBookingRecord(store, String(body.paymentReference ?? "").trim());
  if (!record) return json({ error: "Booking not found" }, 404, origin);
  const to = normalizeInboxEmail(record.customerEmail);
  if (!to) return json({ error: "This booking has no valid customer email." }, 400, origin);
  const text = String(body.message ?? "").trim();
  if (!text) return json({ error: "Please write a message." }, 400, origin);
  if (text.length > INBOX_MESSAGE_MAX) return json({ error: "Message is too long." }, 400, origin);
  const details = await bookingDetails(store, record);
  const subject = (String(body.subject ?? "").trim() || bookingEmailSubject(details)).slice(0, INBOX_SUBJECT_MAX);
  const email = buildOwnerOutgoingEmail({
    message: text,
    booking: body.includeBookingDetails === false ? null : details,
  });
  const toName = record.customerName?.trim() || undefined;
  const sent = await sendViaResend(env, fetchImpl, { to, toName, subject, text: email.text, html: email.html });
  if (!sent.ok) return json({ error: sent.error }, 502, origin);
  const stored = outgoingRecord({
    id: sent.id,
    to,
    toName,
    subject,
    text,
    threadKey: inboxThreadKey(to, subject),
    bookingRef: details.reference,
  });
  await saveInboxMessage(store, stored);
  return json({ ok: true, message: stored }, 200, origin);
}

