/**
 * Customer email when a short-notice request expires unanswered.
 * Not a decline — the response window stored on that request elapsed and nothing was booked.
 */

import {
  BRAND_EMERALD,
  BRAND_NAVY,
  BUSINESS_MAILBOX as BUSINESS_EMAIL,
  BUSINESS_PHONE_DISPLAY,
  BUSINESS_WEBSITE as CANONICAL_BUSINESS_WEBSITE,
} from "./business-email";
import { shortNoticeExpiryReasonLine } from "./booking-notice";

const BUSINESS_WEBSITE = CANONICAL_BUSINESS_WEBSITE;
const LOGO_URL = `${BUSINESS_WEBSITE}/google-business-logo.png`;
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

export type ShortNoticeExpiryEmailDetails = {
  customerName: string;
  customerEmail: string;
  /** Window stored on the request. Missing legacy records use the 1-hour default. */
  confirmationWindowHours?: number;
};

export function buildShortNoticeExpiryEmail(
  details: ShortNoticeExpiryEmailDetails,
  businessName = "My Airport Taxi NI",
): { subject: string; text: string; html: string } {
  const firstName = customerFirstName(details.customerName);
  const subject = `Your ${businessName} booking request has expired`;
  const intro = "We’re sorry, we couldn’t confirm your journey in time.";
  const reason = shortNoticeExpiryReasonLine(details.confirmationWindowHours);
  const noneTaken = "No payment has been taken and your journey has not been booked.";
  const next =
    "If you still require transport, you can return to My Airport Taxi NI and check availability for another pickup time.";

  const text =
    `Hi ${firstName},\n\n` +
    `${intro}\n\n` +
    `${reason}\n\n` +
    `${noneTaken}\n\n` +
    `${next}\n\n` +
    `${businessName}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1a2b3c;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:${NAVY};padding:28px 32px;text-align:center;">
              <img src="${LOGO_URL}" alt="${escapeHtml(businessName)}" height="72" style="display:block;margin:0 auto;height:72px;width:auto;max-width:100%;" />
              <div style="margin-top:16px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${ACCENT};font-weight:bold;">${escapeHtml(businessName)}</div>
              <div style="margin-top:8px;font-size:22px;line-height:1.35;color:#ffffff;font-weight:bold;">Booking request expired</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px;font-size:15px;line-height:1.7;color:#334155;">
              <p style="margin:0 0 16px;">Hi ${escapeHtml(firstName)},</p>
              <p style="margin:0 0 16px;">${escapeHtml(intro)}</p>
              <p style="margin:0 0 16px;">${escapeHtml(reason)}</p>
              <p style="margin:0 0 16px;">${escapeHtml(noneTaken)}</p>
              <p style="margin:0;">${escapeHtml(next)}</p>
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
