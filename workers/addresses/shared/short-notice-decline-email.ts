/**
 * Customer email when Owner declines an unconfirmed short-notice request.
 * Not a cancellation — no payment was taken and the booking was never confirmed.
 */

import {
  BRAND_EMERALD,
  BRAND_NAVY,
  BUSINESS_MAILBOX as BUSINESS_EMAIL,
  BUSINESS_PHONE_DISPLAY,
  businessWhatsAppChatUrl,
  BUSINESS_WHATSAPP_TEXT_ROUTE,
  BUSINESS_WEBSITE as CANONICAL_BUSINESS_WEBSITE,
  lightCustomerEmailHtml,
  businessEmailClientMeta,
  businessEmailLogoHtml, BUSINESS_LANDLINE_DISPLAY
} from "./business-email";
import { formatUkDateTime } from "./uk-time";

/** "14-11-2026 at 05:30" — the date/time style used in booking emails. */
function journeyWhen(date: string, time: string): string {
  return formatUkDateTime(date, time, { withZoneLabel: false }) || `${date} ${time}`;
}

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

export type ShortNoticeDeclineEmailDetails = {
  customerName: string;
  customerEmail: string;
  pickupLabel: string;
  dropoffLabel: string;
  tripDate: string;
  tripTime: string;
  reference: string;
};

export function buildShortNoticeDeclineEmail(
  details: ShortNoticeDeclineEmailDetails,
  businessName = "My Airport Taxi NI",
): { subject: string; text: string; html: string } {
  const firstName = customerFirstName(details.customerName);
  const subject = "Booking Request Unavailable";
  const sorry = "We’re sorry — we weren’t able to confirm your transfer on this occasion.";
  const noCharge = "No payment has been captured and you have not been charged.";
  const holdNote =
    "If a temporary authorisation was placed on your card, it has been cancelled. Depending on your bank, it may take a few days to disappear from your statement.";

  const text =
    `Hi ${firstName},\n\n` +
    `Thank you for your booking request.\n\n` +
    `${sorry}\n\n` +
    `${details.pickupLabel} → ${details.dropoffLabel}\n` +
    `${journeyWhen(details.tripDate, details.tripTime)}\n` +
    `Request reference: ${details.reference}\n\n` +
    `${noCharge}\n\n` +
    `${holdNote}\n\n` +
    `We’d be glad to help with another time — just reply to this email or message us on WhatsApp @belfasttaxi.\n\n` +
    `${businessName}\n` +
    `${BUSINESS_WEBSITE}\n` +
    `Call: ${BUSINESS_LANDLINE_DISPLAY} · WhatsApp: ${BUSINESS_WHATSAPP_TEXT_ROUTE}\n` +
    `Email: ${BUSINESS_EMAIL}`;

  const html = lightCustomerEmailHtml(`<!DOCTYPE html>
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
              <div style="margin-top:8px;font-size:22px;line-height:1.35;color:#ffffff;font-weight:bold;">${escapeHtml(subject)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px;font-size:15px;line-height:1.7;color:#334155;">
              <p style="margin:0 0 16px;">Hi ${escapeHtml(firstName)},</p>
              <p style="margin:0 0 16px;">Thank you for your booking request.</p>
              <p style="margin:0 0 16px;">${escapeHtml(sorry)}</p>
              <p style="margin:0 0 6px;font-weight:600;color:${NAVY};">${escapeHtml(details.pickupLabel)} → ${escapeHtml(details.dropoffLabel)}</p>
              <p style="margin:0 0 8px;">${escapeHtml(journeyWhen(details.tripDate, details.tripTime))}</p>
              <p style="margin:0 0 16px;"><strong style="color:${NAVY};">Request reference:</strong> ${escapeHtml(details.reference)}</p>
              <p style="margin:0 0 16px;">${escapeHtml(noCharge)}</p>
              <p style="margin:0 0 16px;">${escapeHtml(holdNote)}</p>
              <p style="margin:0;">We’d be glad to help with another time — just reply to this email or message us on WhatsApp @belfasttaxi.</p>
              <p style="margin:20px 0 0;"><strong>${escapeHtml(businessName)}</strong></p>
            </td>
          </tr>
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 32px;font-size:13px;line-height:1.7;color:#64748b;">
              <strong style="color:${NAVY};">${escapeHtml(businessName)}</strong><br />
              <a href="${BUSINESS_WEBSITE}" style="color:${NAVY};">${BUSINESS_WEBSITE.replace(/^https:\/\//, "")}</a> ·
              Call: ${BUSINESS_LANDLINE_DISPLAY} · <a href="${businessWhatsAppChatUrl()}" style="color:${NAVY};">WhatsApp @belfasttaxi</a> ·
              <a href="mailto:${BUSINESS_EMAIL}" style="color:${NAVY};">${BUSINESS_EMAIL}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`);

  return { subject, text, html };
}
