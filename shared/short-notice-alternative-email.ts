/**
 * Customer email when Owner offers an alternative pickup time
 * for a short-notice / unavailable-period booking.
 * Links open the response page only — never mutates booking state via GET.
 */

import {
  BRAND_EMERALD,
  BRAND_NAVY,
  BUSINESS_MAILBOX as BUSINESS_EMAIL,
  BUSINESS_WHATSAPP_USERNAME,
  BUSINESS_WEBSITE as CANONICAL_BUSINESS_WEBSITE,
} from "./business-email";

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

export type ShortNoticeAlternativeOfferEmailDetails = {
  customerName: string;
  customerEmail: string;
  pickupLabel: string;
  dropoffLabel: string;
  originalDate: string;
  originalTime: string;
  offeredDate: string;
  offeredTime: string;
  amountLabel: string;
  reference: string;
  /** Secure response-page URL (Accept & pay / Decline both open this page). */
  acceptUrl: string;
  /** Optional second CTA URL; defaults to acceptUrl (same response page). */
  declineUrl?: string;
  ownerNote?: string;
};

export function buildShortNoticeAlternativeOfferEmail(
  details: ShortNoticeAlternativeOfferEmailDetails,
  businessName = "My Airport Taxi NI",
): { subject: string; text: string; html: string } {
  const firstName = customerFirstName(details.customerName);
  const subject = `Alternative pickup time for your ${businessName} journey`;
  const responseUrl = details.acceptUrl.trim();
  const declineUrl = (details.declineUrl ?? details.acceptUrl).trim();
  const note = details.ownerNote?.trim() ?? "";

  const text =
    `Hi ${firstName},\n\n` +
    `We're unable to accommodate your original requested pickup time:\n\n` +
    `${details.originalDate} ${details.originalTime}\n\n` +
    `However, we can offer:\n\n` +
    `${details.offeredDate} ${details.offeredTime}\n\n` +
    `Journey:\n` +
    `${details.pickupLabel} → ${details.dropoffLabel}\n\n` +
    `Price: ${details.amountLabel}\n` +
    `Booking reference: ${details.reference}\n\n` +
    (note ? `Note from us:\n${note}\n\n` : "") +
    `If this time works for you, open this link and select Accept new pickup time & pay:\n` +
    `${responseUrl}\n\n` +
    `If it doesn't suit, open this link and select Decline new pickup time:\n` +
    `${declineUrl}\n\n` +
    `No payment will be taken unless you accept the alternative pickup time and complete payment.\n\n` +
    `${businessName}\n` +
    `${BUSINESS_WEBSITE}\n` +
    `WhatsApp: @${BUSINESS_WHATSAPP_USERNAME}\n` +
    `Email: ${BUSINESS_EMAIL}`;

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
              <div style="margin-top:8px;font-size:22px;line-height:1.35;color:#ffffff;font-weight:bold;">Alternative pickup time offered</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 8px;font-size:15px;line-height:1.7;color:#334155;">
              <p style="margin:0 0 16px;">Hi ${escapeHtml(firstName)},</p>
              <p style="margin:0 0 16px;">We're unable to accommodate your original requested pickup time:</p>
              <p style="margin:0 0 16px;font-weight:600;color:${NAVY};">${escapeHtml(details.originalDate)} · ${escapeHtml(details.originalTime)}</p>
              <p style="margin:0 0 8px;">However, we can offer:</p>
              <p style="margin:0 0 16px;font-weight:600;color:${NAVY};">${escapeHtml(details.offeredDate)} · ${escapeHtml(details.offeredTime)}</p>
              <div style="font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:${ACCENT};font-weight:bold;margin:0 0 10px;">Journey</div>
              <p style="margin:0 0 16px;font-weight:600;color:${NAVY};">${escapeHtml(details.pickupLabel)} → ${escapeHtml(details.dropoffLabel)}</p>
              <p style="margin:0 0 8px;"><strong style="color:${NAVY};">Price:</strong> ${escapeHtml(details.amountLabel)}</p>
              <p style="margin:0 0 20px;"><strong style="color:${NAVY};">Booking reference:</strong> ${escapeHtml(details.reference)}</p>
              ${
                note
                  ? `<p style="margin:0 0 20px;padding:12px 14px;background:#f8fafc;border-radius:8px;"><strong style="color:${NAVY};">Note from us:</strong><br />${escapeHtml(note)}</p>`
                  : ""
              }
              <p style="margin:0 0 8px;">If this time works for you, select:</p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 12px;text-align:center;">
              <a href="${escapeHtml(responseUrl)}" style="display:inline-block;background:${ACCENT};color:${NAVY};text-decoration:none;font-size:16px;font-weight:bold;padding:14px 28px;border-radius:8px;">Accept new pickup time &amp; pay</a>
            </td>
          </tr>
          <tr>
            <td style="padding:4px 32px 8px;font-size:15px;line-height:1.7;color:#334155;text-align:center;">
              <p style="margin:0 0 12px;">If it doesn't suit, select:</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 24px;text-align:center;">
              <a href="${escapeHtml(declineUrl)}" style="display:inline-block;background:#ffffff;color:${NAVY};text-decoration:none;font-size:15px;font-weight:bold;padding:12px 24px;border-radius:8px;border:2px solid ${NAVY};">Decline new pickup time</a>
              <p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#64748b;">Or open this secure page:<br /><a href="${escapeHtml(responseUrl)}" style="color:${NAVY};word-break:break-all;">${escapeHtml(responseUrl)}</a></p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px;font-size:15px;line-height:1.7;color:#334155;">
              <p style="margin:0;">No payment will be taken unless you accept the alternative pickup time and complete payment.</p>
              <p style="margin:20px 0 0;"><strong>${escapeHtml(businessName)}</strong></p>
            </td>
          </tr>
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 32px;font-size:13px;line-height:1.7;color:#64748b;">
              <strong style="color:${NAVY};">${escapeHtml(businessName)}</strong><br />
              <a href="${BUSINESS_WEBSITE}" style="color:${NAVY};">${BUSINESS_WEBSITE.replace(/^https:\/\//, "")}</a> ·
              WhatsApp @{BUSINESS_WHATSAPP_USERNAME} ·
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
