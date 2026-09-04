/**
 * Branded Return Journey Offer emails (one send per eligible booking).
 */

import {
  BRAND_EMERALD,
  BRAND_NAVY,
  BUSINESS_MAILBOX,
  BUSINESS_NAME,
  BUSINESS_WEBSITE as CANONICAL_BUSINESS_WEBSITE,
} from "./business-email";
import {
  firstNameFromCustomerName,
  formatReturnOfferPercent,
  type ReturnOfferDirection,
} from "./return-offer";

export type ReturnOfferEmail = {
  subject: string;
  text: string;
  html: string;
};

const BUSINESS_WEBSITE = CANONICAL_BUSINESS_WEBSITE;
const BUSINESS_EMAIL = BUSINESS_MAILBOX;
const LOGO_URL = `${BUSINESS_WEBSITE}/google-business-logo.png`;
const NAVY = BRAND_NAVY;
const ACCENT = BRAND_EMERALD;

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function brandedHtml(input: {
  title: string;
  headline: string;
  bodyHtml: string;
  ctaUrl: string;
  ctaLabel: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(input.title)} — ${escapeHtml(BUSINESS_NAME)}</title></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1a2b3c;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
<tr><td style="background:${NAVY};padding:28px 32px;text-align:center;">
<img src="${LOGO_URL}" alt="${escapeHtml(BUSINESS_NAME)}" height="72" style="display:block;margin:0 auto;height:72px;width:auto;" />
<div style="margin-top:16px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${ACCENT};font-weight:bold;">${escapeHtml(input.title)}</div>
<div style="margin-top:8px;font-size:22px;line-height:1.35;color:#ffffff;font-weight:bold;">${input.headline}</div>
</td></tr>
<tr><td style="padding:28px 32px;font-size:15px;line-height:1.7;color:#334155;">${input.bodyHtml}
<p style="margin:24px 0 8px;text-align:center;">
<a href="${escapeHtml(input.ctaUrl)}" style="display:inline-block;background:${NAVY};color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;padding:14px 28px;border-radius:8px;">${escapeHtml(input.ctaLabel)}</a>
</p>
<p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#64748b;text-align:center;">Your ${formatReturnOfferPercent()} return saving will be applied automatically.</p>
</td></tr>
<tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 32px;font-size:13px;color:#64748b;">
<strong style="color:${NAVY};">${escapeHtml(BUSINESS_NAME)}</strong><br />
<a href="${BUSINESS_WEBSITE}" style="color:${NAVY};">${BUSINESS_WEBSITE.replace(/^https:\/\//, "")}</a> ·
<a href="mailto:${BUSINESS_EMAIL}" style="color:${NAVY};">${BUSINESS_EMAIL}</a>
</td></tr>
</table></td></tr></table>
</body></html>`;
}

export function buildReturnOfferEmail(input: {
  direction: ReturnOfferDirection;
  customerName: string;
  airportName: string;
  ctaUrl: string;
}): ReturnOfferEmail {
  const first = firstNameFromCustomerName(input.customerName);
  const airport = input.airportName.trim() || "the airport";
  const saving = formatReturnOfferPercent();

  if (input.direction === "airport_to_local") {
    const subject = `Need a transfer back to the airport? Save ${saving}`;
    const text =
      `Hi ${first},\n\n` +
      `We hope you’re enjoying your stay.\n\n` +
      `If you haven’t arranged your journey back to ${airport} yet, you can book your airport transfer with ${BUSINESS_NAME} and save ${saving}.\n\n` +
      `We’ve made it easy — use the button below and we’ll reverse your original journey for you.\n\n` +
      `You can change the pickup date, time or location before booking.\n\n` +
      `Book My Airport Return & Save ${saving}:\n${input.ctaUrl}\n\n` +
      `Your ${saving} return saving will be applied automatically.\n\n` +
      `${BUSINESS_NAME}`;
    const html = brandedHtml({
      title: "Return airport transfer",
      headline: `Need a transfer back to the airport? Save ${saving}`,
      ctaUrl: input.ctaUrl,
      ctaLabel: `Book My Airport Return & Save ${saving}`,
      bodyHtml:
        `<p>Hi ${escapeHtml(first)},</p>` +
        `<p>We hope you’re enjoying your stay.</p>` +
        `<p>If you haven’t arranged your journey back to <strong>${escapeHtml(airport)}</strong> yet, you can book your airport transfer with ${escapeHtml(BUSINESS_NAME)} and save ${escapeHtml(saving)}.</p>` +
        `<p>We’ve made it easy — use the button below and we’ll reverse your original journey for you.</p>` +
        `<p>You can change the pickup date, time or location before booking.</p>`,
    });
    return { subject, text, html };
  }

  const subject = `Need your journey home? Save ${saving} on your return`;
  const text =
    `Hi ${first},\n\n` +
    `Thanks for booking your journey to ${airport} with ${BUSINESS_NAME}.\n\n` +
    `If you haven’t arranged your journey home yet, you can book your return airport transfer with us and save ${saving}.\n\n` +
    `We’ve made it easy — use the button below and we’ll reverse your original journey for you.\n\n` +
    `You can change the date, time or locations before booking.\n\n` +
    `Book My Return & Save ${saving}:\n${input.ctaUrl}\n\n` +
    `Your ${saving} return saving will be applied automatically.\n\n` +
    `Safe travels,\n\n` +
    `${BUSINESS_NAME}`;
  const html = brandedHtml({
    title: "Return journey offer",
    headline: `Need your journey home? Save ${saving} on your return`,
    ctaUrl: input.ctaUrl,
    ctaLabel: `Book My Return & Save ${saving}`,
    bodyHtml:
      `<p>Hi ${escapeHtml(first)},</p>` +
      `<p>Thanks for booking your journey to <strong>${escapeHtml(airport)}</strong> with ${escapeHtml(BUSINESS_NAME)}.</p>` +
      `<p>If you haven’t arranged your journey home yet, you can book your return airport transfer with us and save ${escapeHtml(saving)}.</p>` +
      `<p>We’ve made it easy — use the button below and we’ll reverse your original journey for you.</p>` +
      `<p>You can change the date, time or locations before booking.</p>` +
      `<p>Safe travels,</p>`,
  });
  return { subject, text, html };
}
