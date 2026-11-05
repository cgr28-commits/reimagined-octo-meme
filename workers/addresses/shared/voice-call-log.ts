/**
 * Post-call summaries from fonio ("After the conversation" HTTP Request).
 * Store only what ops need; redact mobiles in owner listings.
 */

export type VoiceCallLogEntry = {
  id: string;
  createdAt: string;
  /** Last 4 digits only when we recognised a UK/IE mobile; otherwise empty. */
  phoneSuffix: string;
  conversationId: string;
  direction: string;
  /** Short AI summary from fonio — not a full transcript dump. */
  summary: string;
  /** Outcome flags the assistant reported (quote given, link sent, etc.). */
  outcome: string;
  followUpQueued: boolean;
  quoteId?: string;
  bookingReference?: string;
  /** Truncated enquiry labels only (no full street addresses). */
  enquiry: string;
};

export const VOICE_CALL_LOG_INDEX_KEY = "voice:call-log:index";
export const VOICE_CALL_LOG_TTL_SECONDS = 60 * 60 * 24 * 60; // 60 days
export const VOICE_CALL_LOG_MAX = 200;

export function voiceCallLogKey(id: string): string {
  return `voice:call-log:${id.trim()}`;
}

export function phoneSuffixFromMobile(mobile: string): string {
  const digits = mobile.replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : "";
}

export function truncateVoiceText(value: string, max = 400): string {
  const cleaned = value.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().replace(/\s+/g, " ");
  return cleaned.length <= max ? cleaned : `${cleaned.slice(0, max - 1)}…`;
}

/** Build a redacted owner-facing row (never includes full mobile or transcript). */
export function toOwnerVoiceCallLog(entry: VoiceCallLogEntry): VoiceCallLogEntry {
  return {
    id: entry.id,
    createdAt: entry.createdAt,
    phoneSuffix: entry.phoneSuffix,
    conversationId: entry.conversationId.slice(0, 64),
    direction: entry.direction.slice(0, 16),
    summary: truncateVoiceText(entry.summary, 400),
    outcome: truncateVoiceText(entry.outcome, 80),
    followUpQueued: Boolean(entry.followUpQueued),
    ...(entry.quoteId ? { quoteId: entry.quoteId.slice(0, 64) } : {}),
    ...(entry.bookingReference ? { bookingReference: entry.bookingReference.slice(0, 32) } : {}),
    enquiry: truncateVoiceText(entry.enquiry, 120),
  };
}
