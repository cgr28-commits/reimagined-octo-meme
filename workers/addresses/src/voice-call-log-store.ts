/**
 * Persist redacted fonio call summaries for the owner dashboard.
 */
import {
  VOICE_CALL_LOG_INDEX_KEY,
  VOICE_CALL_LOG_MAX,
  VOICE_CALL_LOG_TTL_SECONDS,
  phoneSuffixFromMobile,
  toOwnerVoiceCallLog,
  truncateVoiceText,
  voiceCallLogKey,
  type VoiceCallLogEntry,
} from "../shared/voice-call-log";
import { corsHeaders } from "../shared/google-places";
import { ownerAuthorized, type DriverAuthEnv } from "./driver-auth";

export async function appendVoiceCallLog(
  store: KVNamespace,
  input: {
    mobile?: string;
    conversationId?: string;
    direction?: string;
    summary?: string;
    outcome?: string;
    followUpQueued?: boolean;
    quoteId?: string;
    bookingReference?: string;
    enquiry?: string;
    now?: Date;
  },
): Promise<VoiceCallLogEntry> {
  const now = input.now ?? new Date();
  const id = `vc_${now.getTime().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const entry: VoiceCallLogEntry = toOwnerVoiceCallLog({
    id,
    createdAt: now.toISOString(),
    phoneSuffix: phoneSuffixFromMobile(input.mobile ?? ""),
    conversationId: String(input.conversationId ?? "").trim(),
    direction: String(input.direction ?? "inbound").trim() || "inbound",
    summary: truncateVoiceText(String(input.summary ?? ""), 400),
    outcome: truncateVoiceText(String(input.outcome ?? ""), 80),
    followUpQueued: Boolean(input.followUpQueued),
    quoteId: input.quoteId?.trim() || undefined,
    bookingReference: input.bookingReference?.trim() || undefined,
    enquiry: truncateVoiceText(String(input.enquiry ?? ""), 120),
  });

  await store.put(voiceCallLogKey(id), JSON.stringify(entry), {
    expirationTtl: VOICE_CALL_LOG_TTL_SECONDS,
  });

  const index = (await store.get<string[]>(VOICE_CALL_LOG_INDEX_KEY, "json")) ?? [];
  const next = [id, ...index.filter((x) => x !== id)].slice(0, VOICE_CALL_LOG_MAX);
  await store.put(VOICE_CALL_LOG_INDEX_KEY, JSON.stringify(next), {
    expirationTtl: VOICE_CALL_LOG_TTL_SECONDS,
  });
  return entry;
}

export async function listVoiceCallLogs(
  store: KVNamespace,
  limit = 50,
): Promise<VoiceCallLogEntry[]> {
  const index = (await store.get<string[]>(VOICE_CALL_LOG_INDEX_KEY, "json")) ?? [];
  const ids = index.slice(0, Math.min(Math.max(limit, 1), VOICE_CALL_LOG_MAX));
  const rows: VoiceCallLogEntry[] = [];
  for (const id of ids) {
    const row = await store.get<VoiceCallLogEntry>(voiceCallLogKey(id), "json");
    if (row?.id) rows.push(toOwnerVoiceCallLog(row));
  }
  return rows;
}

type OwnerEnv = DriverAuthEnv & { TRACKING_STORE?: KVNamespace };

/** GET /owner/voice-calls — recent redacted phone call summaries. */
export async function handleOwnerVoiceCalls(
  request: Request,
  env: OwnerEnv,
  origin: string | null,
): Promise<Response> {
  if (!ownerAuthorized(request, env)) {
    return new Response(JSON.stringify({ error: "Unauthorized — owner access required" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    });
  }
  const store = env.TRACKING_STORE;
  if (!store) {
    return new Response(JSON.stringify({ error: "Store not configured" }), {
      status: 503,
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    });
  }
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? "50");
  const calls = await listVoiceCallLogs(store, Number.isFinite(limit) ? limit : 50);
  return new Response(JSON.stringify({ ok: true, calls }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}
