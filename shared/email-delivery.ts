/**
 * Server-side email helpers.
 * FormSubmit has been removed — use Resend (or the Cloudflare Worker bookings API).
 */

import { resolveBookingFromHeader, resolveResendApiKey, type EmailEnvLike } from "./email-config";
import { sendViaResend } from "./resend-email";

export type TransactionalEmailOptions = {
  to: string;
  subject: string;
  htmlBody?: string;
  textBody: string;
  fromName?: string;
  replyTo?: string;
  /** Server env with RESEND_API_KEY / BOOKING_FROM_EMAIL. Required for sending. */
  env?: EmailEnvLike | null;
};

/** @deprecated Use sendTransactionalEmail — FormSubmit is removed. */
export type FormSubmitEmailOptions = TransactionalEmailOptions;

export async function sendTransactionalEmail(
  options: TransactionalEmailOptions,
): Promise<boolean> {
  const apiKey = resolveResendApiKey(options.env);
  if (!apiKey) {
    console.error("Transactional email skipped — RESEND_API_KEY missing");
    return false;
  }

  const result = await sendViaResend({
    apiKey,
    from: resolveBookingFromHeader(options.env),
    to: options.to,
    subject: options.subject,
    text: options.textBody,
    html: options.htmlBody,
    replyTo: options.replyTo,
  });

  return result.ok;
}

/** @deprecated FormSubmit removed — delegates to Resend when env is provided. */
export async function sendViaFormSubmitEmail(
  options: FormSubmitEmailOptions,
): Promise<boolean> {
  return sendTransactionalEmail(options);
}
