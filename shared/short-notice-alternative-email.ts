/**
 * Customer email when Owner offers an alternative pickup time
 * for a short-notice / unavailable-period booking.
 * Includes a secure Accept link — never creates SumUp checkout.
 */

import {
  BRAND_EMERALD,
  BRAND_NAVY,
  BUSINESS_MAILBOX as BUSINESS_EMAIL,
  BUSINESS_PHONE_DISPLAY,
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
  acceptUrl: string;
  ownerNote?: string;
};

export function buildShortNoticeAlternativeOfferEmail(
  details: ShortNoticeAlternativeOfferEmailDetails,
  businessName = "My Airport Taxi NI",
): { subject: string; text: string; html: string } {
  const firstName = customerFirstName(details.customerName);
  const subject = `Alternative pickup time for your ${businessName} booking`;
  const acceptUrl = details.acceptUrl.trim();
  const note = details.ownerNote?.trim() ?? "";

  const text =
    `Hi ${firstName},\n\n` +
    `Thanks for your booking request with ${businessName}.\n\n` +
    `We can't confirm your originally requested pickup time, but we can offer this alternative:\n\n` +
    `Journey\n` +
    `${details.pickupLabel} → ${details.dropoffLabel}\n\n` +
    `Requested: ${details.originalDate} ${details.originalTime}\n` +
    `Offered: ${details.offeredDate} ${details.offeredTime}\n\n` +
    `Amount due (unchanged): ${details.amountLabel}\n` +
    `Booking reference: ${details.reference}\n\n` +
    (note ? `Note from us:\n${note}\n\n` : "") +
    `Please use the secure link below to accept this new pickup time:\n` +
    `${acceptUrl}\n\n` +
    `Payment is not taken until after you accept. Once you accept, we'll send a secure payment link.\n\n` +
    `If this time doesn't work, reply to this email or contact us on WhatsApp.\n\n` +
    `${businessName}\n` +
    `${BUSINESS_WEBSITE}\n` +
    `Phone: ${BUSINESS_PHONE_DISPLAY}\n` +
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
              <p style="margin:0 0 16px;">Thanks for your booking request with ${escapeHtml(businessName)}. We can't confirm your originally requested pickup time, but we can offer this alternative:</p>
              <div style="font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:${ACCENT};font-weight:bold;margin:0 0 10px;">Journey</div>
              <p style="margin:0 0 16px;font-weight:600;color:${NAVY};">${escapeHtml(details.pickupLabel)} → ${escapeHtml(details.dropoffLabel)}</p>
              <p style="margin:0 0 6px;"><strong style="color:${NAVY};">Requested:</strong> ${escapeHtml(details.originalDate)} · ${escapeHtml(details.originalTime)}</p>
              <p style="margin:0 0 16px;"><strong style="color:${NAVY};">Offered:</strong> ${escapeHtml(details.offeredDate)} · ${escapeHtml(details.offeredTime)}</p>
              <p style="margin:0 0 8px;"><strong style="color:${NAVY};">Amount due (unchanged):</strong> ${escapeHtml(details.amountLabel)}</p>
              <p style="margin:0 0 20px;"><strong style="color:${NAVY};">Booking reference:</strong> ${escapeHtml(details.reference)}</p>
              ${
                note
                  ? `<p style="margin:0 0 20px;padding:12px 14px;background:#f8fafc;border-radius:8px;"><strong style="color:${NAVY};">Note from us:</strong><br />${escapeHtml(note)}</p>`
                  : ""
              }
              <p style="margin:0 0 8px;">Please use the secure button below to accept this new pickup time:</p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 24px;text-align:center;">
              <a href="${escapeHtml(acceptUrl)}" style="display:inline-block;background:${ACCENT};color:${NAVY};text-decoration:none;font-size:16px;font-weight:bold;padding:14px 28px;border-radius:8px;">Accept new pickup time</a>
              <p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#64748b;">Or copy this link:<br /><a href="${escapeHtml(acceptUrl)}" style="color:${NAVY};word-break:break-all;">${escapeHtml(acceptUrl)}</a></p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px;font-size:15px;line-height:1.7;color:#334155;">
              <p style="margin:0 0 16px;">Payment is not taken until after you accept. Once you accept, we'll send a secure payment link.</p>
              <p style="margin:0;">If this time doesn't work, reply to this email or contact us on WhatsApp.</p>
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
