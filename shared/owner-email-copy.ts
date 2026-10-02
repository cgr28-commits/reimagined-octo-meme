/**
 * Hidden owner copy of customer transactional email.
 * Uses the existing business mailbox. Never blocks the customer send.
 */

import { BUSINESS_MAILBOX } from "./business-email";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type OwnerEmailCopyEnv = {
  /** Optional override. Invalid values are ignored. */
  OWNER_EMAIL_COPY_ADDRESS?: string | null;
  BOOKING_NOTIFICATION_EMAIL?: string | null;
  BOOKING_TO_EMAIL?: string | null;
};

export function isUsableMailbox(value: string | null | undefined): boolean {
  return EMAIL_PATTERN.test(String(value ?? "").trim());
}

/**
 * Owner inbox for a hidden BCC.
 * Order: OWNER_EMAIL_COPY_ADDRESS, BOOKING_NOTIFICATION_EMAIL, BOOKING_TO_EMAIL,
 * then the canonical bookings mailbox. An invalid value is skipped.
 */
export function resolveOwnerEmailCopyAddress(
  env: OwnerEmailCopyEnv = {},
  options?: { canonical?: string | null },
): { address: string | null; warning?: string } {
  const canonical = options && "canonical" in options ? options.canonical : BUSINESS_MAILBOX;
  const explicit = String(env.OWNER_EMAIL_COPY_ADDRESS ?? "").trim();
  const candidates = [
    explicit && isUsableMailbox(explicit) ? explicit : "",
    env.BOOKING_NOTIFICATION_EMAIL,
    env.BOOKING_TO_EMAIL,
    canonical,
  ];
  for (const candidate of candidates) {
    const email = String(candidate ?? "").trim();
    if (isUsableMailbox(email)) return { address: email };
  }
  const warning = explicit
    ? "Owner email copy address is invalid"
    : "Owner email copy address is not configured";
  return { address: null, warning };
}

/** BCC for a customer send. Omitted when it would copy the customer to themselves. */
export function customerTransactionBcc(
  env: OwnerEmailCopyEnv,
  customerTo: string,
  options?: { canonical?: string | null },
): { bcc: string | null; warning?: string } {
  const resolved = resolveOwnerEmailCopyAddress(env, options);
  if (!resolved.address) return { bcc: null, warning: resolved.warning };
  if (resolved.address.toLowerCase() === customerTo.trim().toLowerCase()) {
    return { bcc: null };
  }
  return { bcc: resolved.address };
}

/** Resend payload. Customer is the only To recipient. No Cc. */
export function resendCustomerPayload(input: {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo: string;
  bcc: string | null;
}): Record<string, unknown> {
  return {
    from: input.from,
    to: [input.to],
    subject: input.subject,
    text: input.text,
    ...(input.html ? { html: input.html } : {}),
    reply_to: input.replyTo,
    ...(input.bcc ? { bcc: [input.bcc] } : {}),
  };
}
