import {
  MARKETING_CONSENT_VERSION,
  MARKETING_MESSAGE_MAX,
  MARKETING_SUBJECT_MAX,
  buildMarketingEmail,
  type MarketingOptInSource,
  type MarketingSubscriberRow,
} from "../shared/marketing";
import { ownerAuthorized, type DriverAuthEnv } from "./driver-auth";
import { trySendResendOnlyCustomerEmail, type WorkerEmailEnv } from "./worker-email";
import { corsHeaders } from "../shared/google-places";
import {
  ensureMarketingUnsubscribeToken,
  listMarketingSubscribers,
  marketingStoreConfigured,
  recordMarketingOptIn,
  unsubscribeMarketingEmail,
  unsubscribeMarketingToken,
} from "./marketing-store";

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

const VALID_SOURCES = new Set<MarketingOptInSource>([
  "paid-booking",
  "booking-request",
  "tour-enquiry",
  "vehicle-enquiry",
]);

type MarketingEnv = {
  TRACKING_STORE?: KVNamespace;
};

export async function handleMarketingOptInRequest(
  request: Request,
  env: MarketingEnv,
  origin: string | null,
): Promise<Response> {
  if (!marketingStoreConfigured(env.TRACKING_STORE)) {
    return json({ error: "Marketing list is not configured" }, 503, origin);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, origin);
  }

  const email = String(body.email ?? "").trim();
  const name = String(body.name ?? "").trim() || undefined;
  const source = String(body.source ?? "").trim() as MarketingOptInSource;
  const consentVersion = String(body.consentVersion ?? MARKETING_CONSENT_VERSION).trim();
  const optedInAt = String(body.optedInAt ?? "").trim() || undefined;

  if (!email || !VALID_SOURCES.has(source)) {
    return json({ error: "Missing or invalid fields" }, 400, origin);
  }

  const record = await recordMarketingOptIn(env.TRACKING_STORE, {
    email,
    name,
    source,
    consentVersion,
    optedInAt,
  });

  if (!record) {
    return json({ error: "Invalid email address" }, 400, origin);
  }

  return json({ ok: true, subscribed: true }, 200, origin);
}

export async function handleMarketingUnsubscribeRequest(
  request: Request,
  env: MarketingEnv,
  origin: string | null,
): Promise<Response> {
  if (!marketingStoreConfigured(env.TRACKING_STORE)) {
    return json({ error: "Marketing list is not configured" }, 503, origin);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, origin);
  }

  // One-click link from a marketing email.
  const token = String(body.token ?? "").trim();
  if (token) {
    await unsubscribeMarketingToken(env.TRACKING_STORE, token);
    return json({ ok: true }, 200, origin);
  }

  const email = String(body.email ?? "").trim();
  if (!email) {
    return json({ error: "Missing email address" }, 400, origin);
  }

  const result = await unsubscribeMarketingEmail(env.TRACKING_STORE, email);
  if (!result.ok && result.reason === "invalid_email") {
    return json({ error: "Invalid email address" }, 400, origin);
  }

  // Always return ok for privacy — do not reveal whether an address was subscribed.
  return json({ ok: true }, 200, origin);
}

export async function maybeRecordMarketingFromPayload(
  store: KVNamespace | undefined,
  payload: {
    email?: string;
    name?: string;
    source: MarketingOptInSource;
    marketingOptIn?: boolean;
    marketingOptInAt?: string;
    marketingConsentVersion?: string;
  },
): Promise<void> {
  if (!marketingStoreConfigured(store) || !payload.marketingOptIn) {
    return;
  }

  const email = payload.email?.trim();
  if (!email) {
    return;
  }

  await recordMarketingOptIn(store, {
    email,
    name: payload.name?.trim(),
    source: payload.source,
    consentVersion: payload.marketingConsentVersion,
    optedInAt: payload.marketingOptInAt,
  });
}

type OwnerMarketingEnv = MarketingEnv & DriverAuthEnv & WorkerEmailEnv & { SITE_ORIGIN?: string };

const CAMPAIGNS_KEY = "marketing:campaigns";
const SENDING_LOCK_KEY = "marketing:sending";
/** Resend allows a couple of requests a second; keep well under it. */
const SEND_GAP_MS = 600;
export const MARKETING_MAX_RECIPIENTS_PER_SEND = 300;

export type MarketingCampaignLog = {
  id: string;
  at: string;
  subject: string;
  sent: number;
  failed: number;
  total: number;
};

function siteUrl(env: { SITE_ORIGIN?: string }): string {
  return (env.SITE_ORIGIN?.trim() || "https://www.myairporttaxini.co.uk").replace(/\/$/, "");
}

/** GET /owner/marketing/subscribers — the marketing list and recent campaigns (owner only). */
export async function handleOwnerMarketingSubscribers(
  request: Request,
  env: OwnerMarketingEnv,
  origin: string | null,
): Promise<Response> {
  if (!ownerAuthorized(request, env)) return json({ error: "Unauthorized — owner access required." }, 401, origin);
  if (!marketingStoreConfigured(env.TRACKING_STORE)) return json({ error: "Marketing list is not configured" }, 503, origin);
  const all = await listMarketingSubscribers(env.TRACKING_STORE);
  const subscribers: MarketingSubscriberRow[] = all.map(({ unsubscribeToken: _t, ...row }) => row);
  const campaigns = (await env.TRACKING_STORE.get<MarketingCampaignLog[]>(CAMPAIGNS_KEY, "json")) ?? [];
  return json({ ok: true, subscribers, campaigns }, 200, origin);
}

/**
 * POST /owner/marketing/send — email the owner's message to everyone still subscribed
 * (or a test copy to one address). Each email has a one-click unsubscribe link.
 */
export async function handleOwnerMarketingSend(
  request: Request,
  env: OwnerMarketingEnv,
  origin: string | null,
): Promise<Response> {
  if (!ownerAuthorized(request, env)) return json({ error: "Unauthorized — owner access required." }, 401, origin);
  const store = env.TRACKING_STORE;
  if (!marketingStoreConfigured(store)) return json({ error: "Marketing list is not configured" }, 503, origin);
  if (!env.RESEND_API_KEY?.trim()) return json({ error: "Email sending is not configured (Resend)." }, 503, origin);
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, origin);
  }
  const subject = String(body.subject ?? "").trim();
  const message = String(body.message ?? "").trim();
  if (!subject || subject.length > MARKETING_SUBJECT_MAX) {
    return json({ error: `Please enter a subject (up to ${MARKETING_SUBJECT_MAX} characters).` }, 400, origin);
  }
  if (!message || message.length > MARKETING_MESSAGE_MAX) {
    return json({ error: `Please enter a message (up to ${MARKETING_MESSAGE_MAX} characters).` }, 400, origin);
  }
  const site = siteUrl(env);

  if (body.test === true) {
    const testTo =
      String(body.testEmail ?? "").trim() ||
      env.BOOKING_NOTIFICATION_EMAIL?.trim() ||
      env.BOOKING_TO_EMAIL?.trim() ||
      "bookings@myairporttaxini.co.uk";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testTo)) return json({ error: "Invalid test email address." }, 400, origin);
    const email = buildMarketingEmail({ subject, message, unsubscribeUrl: `${site}/unsubscribe/`, siteUrl: site });
    const result = await trySendResendOnlyCustomerEmail(env, {
      to: testTo,
      subject: `[Test] ${email.subject}`,
      body: email.text,
      htmlBody: email.html,
      ownerCopy: false,
    });
    return result.sent
      ? json({ ok: true, test: true, sentTo: testTo }, 200, origin)
      : json({ error: result.error || "The test email could not be sent." }, 502, origin);
  }

  if (body.confirm !== true) return json({ error: "Please confirm the send." }, 400, origin);
  if (await store.get(SENDING_LOCK_KEY)) {
    return json({ error: "A campaign is already sending. Please wait a few minutes." }, 409, origin);
  }
  await store.put(SENDING_LOCK_KEY, "1", { expirationTtl: 600 });
  try {
    const active = (await listMarketingSubscribers(store)).filter((s) => !s.unsubscribedAt);
    const recipients = active.slice(0, MARKETING_MAX_RECIPIENTS_PER_SEND);
    const id = crypto.randomUUID();
    let sent = 0;
    let failed = 0;
    for (const [i, subscriber] of recipients.entries()) {
      if (i > 0) await new Promise((resolve) => setTimeout(resolve, SEND_GAP_MS));
      const token = await ensureMarketingUnsubscribeToken(store, subscriber);
      const email = buildMarketingEmail({
        subject,
        message,
        name: subscriber.name,
        unsubscribeUrl: `${site}/unsubscribe/?t=${token}`,
        siteUrl: site,
      });
      const result = await trySendResendOnlyCustomerEmail(env, {
        to: subscriber.email,
        toName: subscriber.name,
        subject: email.subject,
        body: email.text,
        htmlBody: email.html,
        ownerCopy: false,
        idempotencyKey: `mkt-${id}-${subscriber.email}`,
      });
      if (result.sent) sent += 1;
      else failed += 1;
    }
    const log: MarketingCampaignLog = { id, at: new Date().toISOString(), subject, sent, failed, total: recipients.length };
    const campaigns = (await store.get<MarketingCampaignLog[]>(CAMPAIGNS_KEY, "json")) ?? [];
    await store.put(CAMPAIGNS_KEY, JSON.stringify([log, ...campaigns].slice(0, 20)));
    return json(
      { ok: true, sent, failed, total: recipients.length, notSent: Math.max(0, active.length - recipients.length) },
      200,
      origin,
    );
  } finally {
    await store.delete(SENDING_LOCK_KEY);
  }
}
