/**
 * Persist WhatsApp conversation state in TRACKING_STORE KV by wa_id.
 */

import type { WhatsAppSessionRecord } from "../shared/whatsapp-booking";
import { emptyWhatsAppSession } from "../shared/whatsapp-booking";

const SESSION_PREFIX = "whatsapp:session:";
const MSG_DEDUPE_PREFIX = "whatsapp:msg:";
const CHECKOUT_INDEX_PREFIX = "whatsapp:checkout:";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const MSG_DEDUPE_TTL_SECONDS = 60 * 60 * 48; // 48 hours
const CHECKOUT_INDEX_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days

export function whatsappSessionKey(waId: string): string {
  return `${SESSION_PREFIX}${waId.trim()}`;
}

export function whatsappMessageDedupeKey(messageId: string): string {
  return `${MSG_DEDUPE_PREFIX}${messageId.trim()}`;
}

export function whatsappCheckoutIndexKey(checkoutId: string): string {
  return `${CHECKOUT_INDEX_PREFIX}${checkoutId.trim()}`;
}

export async function getWhatsAppSession(
  kv: KVNamespace,
  waId: string,
): Promise<WhatsAppSessionRecord | null> {
  const raw = await kv.get(whatsappSessionKey(waId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as WhatsAppSessionRecord;
  } catch {
    return null;
  }
}

export async function saveWhatsAppSession(
  kv: KVNamespace,
  session: WhatsAppSessionRecord,
): Promise<void> {
  const next: WhatsAppSessionRecord = {
    ...session,
    updatedAt: new Date().toISOString(),
  };
  await kv.put(whatsappSessionKey(session.waId), JSON.stringify(next), {
    expirationTtl: SESSION_TTL_SECONDS,
  });
}

export async function getOrCreateWhatsAppSession(
  kv: KVNamespace,
  waId: string,
): Promise<WhatsAppSessionRecord> {
  const existing = await getWhatsAppSession(kv, waId);
  if (existing) return existing;
  const created = emptyWhatsAppSession(waId, waId);
  await saveWhatsAppSession(kv, created);
  return created;
}

/** Returns true if this Meta message id was already processed (duplicate webhook). */
export async function claimWhatsAppMessageId(
  kv: KVNamespace,
  messageId: string,
): Promise<"claimed" | "duplicate"> {
  const key = whatsappMessageDedupeKey(messageId);
  const existing = await kv.get(key);
  if (existing) return "duplicate";
  await kv.put(key, new Date().toISOString(), {
    expirationTtl: MSG_DEDUPE_TTL_SECONDS,
  });
  return "claimed";
}

/** Link SumUp checkout → WhatsApp session for post-payment confirmation. */
export async function linkWhatsAppCheckout(
  kv: KVNamespace,
  checkoutId: string,
  waId: string,
): Promise<void> {
  await kv.put(whatsappCheckoutIndexKey(checkoutId), waId.trim(), {
    expirationTtl: CHECKOUT_INDEX_TTL_SECONDS,
  });
}

export async function getWhatsAppWaIdForCheckout(
  kv: KVNamespace,
  checkoutId: string,
): Promise<string | null> {
  const waId = await kv.get(whatsappCheckoutIndexKey(checkoutId));
  return waId?.trim() || null;
}
