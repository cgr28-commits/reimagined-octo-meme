/**
 * Dropped phone calls → one WhatsApp follow-up with a link to the quote tool.
 *
 * fonio runs an "After the conversation" HTTP request to POST /voice/call-ended with the
 * caller's number and what the AI extracted from the call. We queue a follow-up only when:
 *   - the caller agreed on the call to a WhatsApp if they got cut off (followUpConsent = yes)
 *   - they did NOT already get a booking link (our own send-link marker, or the call says so)
 *   - it was a new enquiry, not about an existing booking or a complaint
 *   - the number is a UK mobile, and we haven't followed it up today
 * The message goes ~5 minutes after the call (5-minute cron), using the approved
 * mat_call_followup template. One small KV queue key; an idle cron run is one read.
 */
import { sendCallFollowUpWhatsApp, whatsAppRecipient, type WhatsAppTemplateEnv } from "./whatsapp-templates";

export const VOICE_FOLLOWUP_QUEUE_KEY = "voice:followup:queue";
const LINK_SENT_PREFIX = "voice:link-sent:";
const DELAY_MS = 5 * 60 * 1000;
const KEEP_MS = 2 * 24 * 60 * 60 * 1000;
const MAX_QUEUE = 100;
const MAX_SENDS_PER_RUN = 5;

type Env = WhatsAppTemplateEnv & { TRACKING_STORE?: KVNamespace; VOICE_WEBHOOK_SECRET?: string };

export type VoiceFollowUpEntry = {
  mobile: string;
  name: string;
  enquiry: string;
  createdAt: string;
  dueAt: string;
  sentAt?: string;
  skipped?: string;
};

function reply(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/** fonio may wrap fields (parameters / variables / data) — flatten one level. */
function flatten(body: unknown): Record<string, unknown> {
  const root = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  let out: Record<string, unknown> = { ...root };
  for (const key of ["parameters", "variables", "extractedVariables", "extracted_variables", "data", "call"]) {
    const inner = root[key];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) out = { ...out, ...(inner as object) };
  }
  return out;
}

function pick(input: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = input[key];
    if (value != null && String(value).trim() && !/^\{\{.*\}\}$/.test(String(value).trim())) return String(value).trim();
  }
  return "";
}

function truthy(value: string): boolean {
  return /^(yes|y|true|1|agreed|ok|okay)$/i.test(value.trim());
}

/** A UK mobile in the form WhatsApp needs, or "" for landlines / withheld / foreign. */
export function ukMobileForFollowUp(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  if (!/^(\+?44|0)7\d{9}$/.test(digits)) return "";
  return whatsAppRecipient(digits);
}

/** Called by /voice/send-link on success, so a caller who got their link isn't chased. */
export async function markVoiceLinkSent(store: KVNamespace, mobile: string): Promise<void> {
  const to = ukMobileForFollowUp(mobile);
  if (!to) return;
  await store.put(`${LINK_SENT_PREFIX}${to}`, new Date().toISOString(), { expirationTtl: 6 * 60 * 60 });
}

async function readQueue(store: KVNamespace): Promise<VoiceFollowUpEntry[]> {
  const value = await store.get<VoiceFollowUpEntry[]>(VOICE_FOLLOWUP_QUEUE_KEY, "json");
  return Array.isArray(value) ? value : [];
}

function prune(queue: VoiceFollowUpEntry[], now: number): VoiceFollowUpEntry[] {
  return queue.filter((e) => now - Date.parse(e.createdAt) < KEEP_MS).slice(-MAX_QUEUE);
}

function enquiryLabel(pickup: string, destination: string): string {
  const place = (s: string) => s.split(",")[0]!.trim().slice(0, 60);
  if (pickup && destination) return `a taxi from ${place(pickup)} to ${place(destination)}`;
  if (destination) return `a taxi to ${place(destination)}`;
  if (pickup) return `a taxi from ${place(pickup)}`;
  return "your transfer";
}

/** POST /voice/call-ended — fonio "After the conversation" request. */
export async function handleVoiceCallEnded(request: Request, env: Env, now = new Date()): Promise<Response> {
  const store = env.TRACKING_STORE;
  if (!store) return reply({ ok: false }, 503);
  const secret = env.VOICE_WEBHOOK_SECRET?.trim();
  if (secret && request.headers.get("X-Voice-Secret")?.trim() !== secret) return reply({ ok: false }, 401);

  const input = flatten(await request.json().catch(() => null));
  const mobile = ukMobileForFollowUp(
    pick(input, ["fromNumber", "from_number", "callerNumber", "caller_number", "from", "phone", "mobile"]),
  );
  const consent = truthy(pick(input, ["followUpConsent", "followup_consent", "follow_up_consent", "consent"]));
  const linkSentOnCall = truthy(pick(input, ["bookingLinkSent", "booking_link_sent", "link_sent"]));
  const existingBooking = truthy(pick(input, ["existingBooking", "existing_booking", "about_existing_booking"]));
  const name = pick(input, ["name", "callerName", "caller_name", "firstName"]).slice(0, 40);
  const pickup = pick(input, ["pickup", "pickupAddress", "pickup_address", "from_location"]);
  const destination = pick(input, ["destination", "dropoff", "destination_address", "to_location"]);

  const skip = (reason: string) => {
    console.log(JSON.stringify({ event: "voice_followup_skipped", reason, phoneSuffix: mobile.slice(-4) }));
    return reply({ ok: true, queued: false, reason });
  };
  if (!mobile) return skip("not a UK mobile");
  if (!consent) return skip("no consent");
  if (linkSentOnCall || existingBooking) return skip(linkSentOnCall ? "link sent on call" : "existing booking");
  if (await store.get(`${LINK_SENT_PREFIX}${mobile}`)) return skip("link sent on call");

  const t = now.getTime();
  const queue = prune(await readQueue(store), t);
  if (queue.some((e) => e.mobile === mobile && t - Date.parse(e.createdAt) < 24 * 60 * 60 * 1000)) {
    return skip("already queued today");
  }
  queue.push({
    mobile,
    name,
    enquiry: enquiryLabel(pickup, destination),
    createdAt: now.toISOString(),
    dueAt: new Date(t + DELAY_MS).toISOString(),
  });
  await store.put(VOICE_FOLLOWUP_QUEUE_KEY, JSON.stringify(queue));
  console.log(JSON.stringify({ event: "voice_followup_queued", phoneSuffix: mobile.slice(-4) }));
  return reply({ ok: true, queued: true });
}

/** 5-minute cron: send due follow-ups. Empty or not-yet-due queue costs one read. */
export async function processVoiceFollowUps(
  env: Env,
  now = new Date(),
): Promise<{ sent: number; skipped: number; errors: number }> {
  const result = { sent: 0, skipped: 0, errors: 0 };
  const store = env.TRACKING_STORE;
  if (!store) return result;
  const queue = await readQueue(store);
  if (queue.length === 0) return result;
  const t = now.getTime();
  const due = queue.filter((e) => !e.sentAt && !e.skipped && Date.parse(e.dueAt) <= t).slice(0, MAX_SENDS_PER_RUN);
  if (due.length === 0) {
    const pruned = prune(queue, t);
    if (pruned.length !== queue.length) await store.put(VOICE_FOLLOWUP_QUEUE_KEY, JSON.stringify(pruned));
    return result;
  }
  const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(now);
  for (const entry of due) {
    try {
      if (await store.get(`${LINK_SENT_PREFIX}${entry.mobile}`)) {
        entry.skipped = "link sent";
        result.skipped++;
        continue;
      }
      const sent = await sendCallFollowUpWhatsApp(env, {
        mobile: entry.mobile,
        customerName: entry.name,
        enquiry: entry.enquiry,
        dayKey,
      });
      if (sent.sent) {
        entry.sentAt = now.toISOString();
        result.sent++;
      } else if (sent.reason === "disabled_or_not_approved" && t - Date.parse(entry.createdAt) < 60 * 60 * 1000) {
        // Template still in review — try again on later runs for up to an hour.
      } else {
        entry.skipped = sent.reason === "already_sent" ? "already sent today" : `not sent: ${sent.reason}`;
        if (sent.reason === "send_failed") result.errors++;
        else result.skipped++;
      }
    } catch (error) {
      entry.skipped = "error";
      result.errors++;
      console.error("Voice follow-up failed", error instanceof Error ? error.message : error);
    }
  }
  await store.put(VOICE_FOLLOWUP_QUEUE_KEY, JSON.stringify(prune(queue, t)));
  return result;
}
