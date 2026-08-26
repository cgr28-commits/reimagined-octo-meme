/**
 * Customer email after Owner approves an Address-to-Address personalised quote.
 * Always shows the final approved journey details (after any Owner edits).
 */

import {
  BRAND_EMERALD,
  BRAND_NAVY,
  BUSINESS_MAILBOX as BUSINESS_EMAIL,
  BUSINESS_PHONE_DISPLAY,
  BUSINESS_WEBSITE as CANONICAL_BUSINESS_WEBSITE,
} from "./business-email";
import { formatA2aQuoteValidityLabel } from "./a2a-personalised-quote";

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

export type A2aQuotePaymentLinkEmailDetails = {
  customerName: string;
  customerEmail: string;
  pickupLabel: string;
  dropoffLabel: string;
  tripDate: string;
  tripTime: string;
  returnJourney?: boolean;
  returnDate?: string;
  returnTime?: string;
  amountLabel: string;
  reference: string;
  payUrl: string;
  validityMinutes: number;
};

export function buildA2aQuotePaymentLinkEmail(details: A2aQuotePaymentLinkEmailDetails): {
  subject: string;
  text: string;
  html: string;
} {
  const first = customerFirstName(details.customerName);
  const validity = formatA2aQuoteValidityLabel(details.validityMinutes);
  const subject = `Your personalised quote ${details.amountLabel} — valid for ${validity}`;
  const hasReturn =
    Boolean(details.returnJourney) &&
    Boolean(String(details.returnDate ?? "").trim() || String(details.returnTime ?? "").trim());
  const returnWhen = [details.returnDate, details.returnTime].filter(Boolean).join(" · ");

  const textLines = [
    `Hi ${first},`,
    "",
    `Your personalised quote is ${details.amountLabel}.`,
    "",
    `This quote is valid for ${validity}.`,
    "",
    "Your booking is only confirmed once payment has been completed.",
    "Availability may change if payment is not made within this time.",
    "",
    `Pickup: ${details.pickupLabel}`,
    `Drop-off: ${details.dropoffLabel}`,
    `Date: ${details.tripDate}`,
    `Time: ${details.tripTime}`,
  ];
  if (hasReturn) {
    textLines.push(`Return: ${returnWhen || "yes"}`);
  }
  textLines.push(
    `Reference: ${details.reference}`,
    "",
    `Pay Securely: ${details.payUrl}`,
    "",
    "Secure card payment powered by SumUp.",
    "",
    `My Airport Taxi NI · ${BUSINESS_PHONE_DISPLAY} · ${BUSINESS_EMAIL}`,
    BUSINESS_WEBSITE,
  );
  const text = textLines.join("\n");

  const returnHtml = hasReturn
    ? `<p style="margin:0 0 4px;font-size:13px;color:#9fb0c0;">Return</p>
          <p style="margin:0 0 20px;color:#fff;">${escapeHtml(returnWhen || "Return journey")}</p>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0b1f33;font-family:Arial,Helvetica,sans-serif;color:#ffffff;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0b1f33;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:${NAVY};border-radius:16px;overflow:hidden;">
        <tr><td style="padding:28px 28px 12px;text-align:center;">
          <img src="${LOGO_URL}" alt="My Airport Taxi NI" width="120" style="display:block;margin:0 auto 16px;"/>
          <p style="margin:0;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:${ACCENT};">Personalised Quote</p>
          <h1 style="margin:8px 0 0;font-size:26px;line-height:1.25;color:#fff;">${escapeHtml(details.amountLabel)}</h1>
        </td></tr>
        <tr><td style="padding:8px 28px 24px;color:#d7e2ec;font-size:15px;line-height:1.55;">
          <p style="margin:0 0 12px;">Hi ${escapeHtml(first)},</p>
          <p style="margin:0 0 12px;"><strong style="color:#fff;">Your personalised quote is ${escapeHtml(details.amountLabel)}.</strong></p>
          <p style="margin:0 0 12px;">This quote is valid for <strong style="color:#fff;">${escapeHtml(validity)}</strong>.</p>
          <p style="margin:0 0 12px;">Your booking is only confirmed once payment has been completed.</p>
          <p style="margin:0 0 20px;">Availability may change if payment is not made within this time.</p>
          <p style="margin:0 0 4px;font-size:13px;color:#9fb0c0;">Pickup</p>
          <p style="margin:0 0 12px;color:#fff;">${escapeHtml(details.pickupLabel)}</p>
          <p style="margin:0 0 4px;font-size:13px;color:#9fb0c0;">Drop-off</p>
          <p style="margin:0 0 12px;color:#fff;">${escapeHtml(details.dropoffLabel)}</p>
          <p style="margin:0 0 4px;font-size:13px;color:#9fb0c0;">When</p>
          <p style="margin:0 0 ${hasReturn ? "12" : "20"}px;color:#fff;">${escapeHtml(details.tripDate)} · ${escapeHtml(details.tripTime)}</p>
          ${returnHtml}
          <p style="margin:0 0 24px;text-align:center;">
            <a href="${escapeHtml(details.payUrl)}" style="display:inline-block;background:${ACCENT};color:${NAVY};text-decoration:none;font-weight:700;padding:14px 28px;border-radius:999px;font-size:16px;">Pay Securely</a>
          </p>
          <p style="margin:0;font-size:12px;color:#9fb0c0;text-align:center;">Secure card payment powered by SumUp.</p>
          <p style="margin:16px 0 0;font-size:12px;color:#9fb0c0;text-align:center;">Ref ${escapeHtml(details.reference)}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}
