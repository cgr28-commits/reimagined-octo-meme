/**
 * Customer email after Owner approves a short-notice / unavailable-period booking.
 * Links to the existing secure /pay/short-notice/ page — never creates SumUp checkout.
 */

import {
  BRAND_EMERALD,
  BRAND_NAVY,
  BUSINESS_MAILBOX as BUSINESS_EMAIL,
  BUSINESS_PHONE_DISPLAY,
  BUSINESS_WEBSITE as CANONICAL_BUSINESS_WEBSITE,
  businessEmailClientMeta,
  businessEmailLogoHtml,
} from "./business-email";
import { formatCustomerPaymentDeadline } from "./uk-time";

const BUSINESS_WEBSITE = CANONICAL_BUSINESS_WEBSITE;
const ACCENT = BRAND_EMERALD;
const NAVY = BRAND_NAVY;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function customerFirstName(fullName: string): string {
  const first = fullName.trim().split(/\s+/).filter(Boolean)[0];
  return first || "there";
}

export type ShortNoticePaymentLinkEmailDetails = {
  customerName: string;
  customerEmail: string;
  pickupLabel: string;
  dropoffLabel: string;
  tripDate: string;
  tripTime: string;
  amountLabel: string;
  reference: string;
  payUrl: string;
  /** Server deadline. Shown in Europe/London. Omitted only if the instant is missing. */
  paymentExpiresAt?: string | null;
};

export function isValidCustomerEmail(value: string | null | undefined): boolean {
  const email = value?.trim() ?? "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function buildShortNoticePaymentLinkEmail(
  details: ShortNoticePaymentLinkEmailDetails,
  businessName = "My Airport Taxi NI",
): { subject: string; text: string; html: string } {
  const firstName = customerFirstName(details.customerName);
  const subject = `Your ${businessName} booking request has been accepted`;
  const payUrl = details.payUrl.trim();
  const deadline = details.paymentExpiresAt
    ? formatCustomerPaymentDeadline(details.paymentExpiresAt)
    : null;
  const reservedText = deadline
    ? `Your journey is available and has been reserved for you.\n\n` +
      `Please complete payment by ${deadline.time} on ${deadline.date} to confirm your booking.\n\n` +
      `If payment is not completed by this time, the reservation will expire automatically.\n\n`
    : `Your journey is available and has been reserved for you.\n\n` +
      `Please complete payment to confirm your booking. If payment is not completed in time, the reservation will expire automatically.\n\n`;
  const reservedHtml = deadline
    ? `<p style="margin:0 0 16px;">Your journey is available and has been reserved for you.</p>
              <p style="margin:0 0 16px;">Please complete payment by <strong style="color:${NAVY};">${escapeHtml(deadline.time)}</strong> on <strong style="color:${NAVY};">${escapeHtml(deadline.date)}</strong> to confirm your booking.</p>
              <p style="margin:0 0 16px;">If payment is not completed by this time, the reservation will expire automatically.</p>`
    : `<p style="margin:0 0 16px;">Your journey is available and has been reserved for you.</p>
              <p style="margin:0 0 16px;">Please complete payment to confirm your booking. If payment is not completed in time, the reservation will expire automatically.</p>`;

  const text =
    `Hi ${firstName},\n\n` +
    `Good news — we have availability for your requested journey.\n\n` +
    `Your transfer request has been accepted at the quoted price of ${details.amountLabel}.\n\n` +
    `Journey\n` +
    `${details.pickupLabel} → ${details.dropoffLabel}\n` +
    `${details.tripDate} ${details.tripTime}\n` +
    `Request reference: ${details.reference}\n\n` +
    reservedText +
    `Complete payment using the secure link below.\n` +
    `${payUrl}\n\n` +
    `Your booking will be confirmed once payment has been successfully completed.\n\n` +
    `Thank you for choosing ${businessName}.\n\n` +
    `${businessName}\n` +
    `${BUSINESS_WEBSITE}\n` +
    `Phone: ${BUSINESS_PHONE_DISPLAY}\n` +
    `Email: ${BUSINESS_EMAIL}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
${businessEmailClientMeta()}
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1a2b3c;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:${NAVY};padding:28px 32px;text-align:center;">
              ${businessEmailLogoHtml()}
              <div style="margin-top:16px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${ACCENT};font-weight:bold;">${escapeHtml(businessName)}</div>
              <div style="margin-top:8px;font-size:22px;line-height:1.35;color:#ffffff;font-weight:bold;">Your booking request has been accepted</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 8px;font-size:15px;line-height:1.7;color:#334155;">
              <p style="margin:0 0 16px;">Hi ${escapeHtml(firstName)},</p>
              <p style="margin:0 0 16px;">Good news — we have availability for your requested journey.</p>
              <p style="margin:0 0 16px;">Your transfer request has been accepted at the quoted price of ${escapeHtml(details.amountLabel)}.</p>
              <div style="font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:${ACCENT};font-weight:bold;margin:0 0 10px;">Journey</div>
              <p style="margin:0 0 6px;font-weight:600;color:${NAVY};">${escapeHtml(details.pickupLabel)} → ${escapeHtml(details.dropoffLabel)}</p>
              <p style="margin:0 0 16px;">${escapeHtml(details.tripDate)} · ${escapeHtml(details.tripTime)}</p>
              <p style="margin:0 0 20px;"><strong style="color:${NAVY};">Request reference:</strong> ${escapeHtml(details.reference)}</p>
              ${reservedHtml}
              <p style="margin:0 0 8px;">Complete payment using the secure button below.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 24px;text-align:center;">
              <a href="${escapeHtml(payUrl)}" style="display:inline-block;background:${ACCENT};color:${NAVY};text-decoration:none;font-size:16px;font-weight:bold;padding:14px 28px;border-radius:8px;">Pay securely</a>
              <p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#64748b;">Or copy this link:<br /><a href="${escapeHtml(payUrl)}" style="color:${NAVY};word-break:break-all;">${escapeHtml(payUrl)}</a></p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px;font-size:15px;line-height:1.7;color:#334155;">
              <p style="margin:0 0 16px;">Your booking will be confirmed once payment has been successfully completed.</p>
              <p style="margin:0;">Thank you for choosing ${escapeHtml(businessName)}.</p>
              <p style="margin:20px 0 0;"><strong>${escapeHtml(businessName)}</strong></p>
            </td>
          </tr>
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 32px;font-size:13px;line-height:1.7;color:#64748b;">
              <strong style="color:${NAVY};">${escapeHtml(businessName)}</strong><br />
              <a href="${BUSINESS_WEBSITE}" style="color:${NAVY};">${BUSINESS_WEBSITE.replace(/^https:\/\//, "")}</a> ·
              Phone: ${BUSINESS_PHONE_DISPLAY} ·
              <a href="mailto:${BUSINESS_EMAIL}" style="color:${NAVY};">${BUSINESS_EMAIL}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}
