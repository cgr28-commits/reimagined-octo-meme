/**
 * International (E.164) form of a customer-entered mobile number.
 * The number the customer typed is never altered or replaced: this is a derived, validated
 * companion value used for WhatsApp, tel: links and notifications.
 */
import { toWhatsAppDigits } from "./arrival-whatsapp";

export const E164_PATTERN = /^\+[1-9]\d{9,14}$/;

/** "+447700900123", or "" when the input cannot be read as a valid international number. */
export function toE164(raw: string | null | undefined): string {
  const digits = toWhatsAppDigits(String(raw ?? ""));
  if (!digits) return "";
  const candidate = `+${digits}`;
  return E164_PATTERN.test(candidate) ? candidate : "";
}

/** Digits only (no "+"), as wa.me expects. Prefers an already-stored E.164 value. */
export function whatsAppDigitsFor(entered: string | null | undefined, e164?: string | null): string {
  const stored = String(e164 ?? "").trim();
  if (E164_PATTERN.test(stored)) return stored.slice(1);
  return toE164(entered).slice(1);
}
