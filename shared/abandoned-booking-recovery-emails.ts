/**
 * Transactional abandoned-booking recovery email (single reminder).
 * Not marketing — booking completion only.
 */

import {
  BRAND_EMERALD,
  BRAND_NAVY,
  BUSINESS_MAILBOX,
  BUSINESS_WEBSITE as CANONICAL_BUSINESS_WEBSITE,
} from "./business-email";
import {
  buildAbandonedBookingOptOutUrl,
  buildAbandonedBookingRecoveryUrl,
  firstNameFromCustomerName,
  formatAbandonedAmount,
  type AbandonedBookingRecord,
} from "./abandoned-booking-recovery";

export type AbandonedBookingEmail = {
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

function journeyScheduleLabel(date?: string, time?: string): string {
  const d = String(date ?? "").trim();
  const t = String(time ?? "").trim();
  if (!d && !t) return "Date/time to be confirmed";
  if (!d) return t;
  if (!t) return d;
  return `${d} at ${t}`;
}

function brandedHtml(input: {
  title: string;
  headline: string;
  bodyHtml: string;
  ctaUrl: string;
  ctaLabel: string;
  optOutUrl: string;
  businessName: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(input.title)} — ${escapeHtml(input.businessName)}</title></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1a2b3c;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
<tr><td style="background:${NAVY};padding:28px 32px;text-align:center;">
<img src="${LOGO_URL}" alt="${escapeHtml(input.businessName)}" height="72" style="display:block;margin:0 auto;height:72px;width:auto;" />
<div style="margin-top:16px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${ACCENT};font-weight:bold;">${escapeHtml(input.title)}</div>
<div style="margin-top:8px;font-size:22px;line-height:1.35;color:#ffffff;font-weight:bold;">${input.headline}</div>
</td></tr>
<tr><td style="padding:28px 32px;font-size:15px;line-height:1.7;color:#334155;">${input.bodyHtml}
<p style="margin:24px 0 8px;text-align:center;">
<a href="${escapeHtml(input.ctaUrl)}" style="display:inline-block;background:${NAVY};color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;padding:14px 28px;border-radius:8px;">${escapeHtml(input.ctaLabel)}</a>
</p>
<p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#64748b;text-align:center;">If you’ve changed your plans, there’s nothing you need to do.</p>
<p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:#94a3b8;text-align:center;">
This is a single booking-recovery reminder, not a marketing email.
<a href="${escapeHtml(input.optOutUrl)}" style="color:${NAVY};">Stop booking recovery emails</a>
</p>
</td></tr>
<tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 32px;font-size:13px;color:#64748b;">
<strong style="color:${NAVY};">${escapeHtml(input.businessName)}</strong><br />
<a href="${BUSINESS_WEBSITE}" style="color:${NAVY};">${BUSINESS_WEBSITE.replace(/^https:\/\//, "")}</a> ·
<a href="mailto:${BUSINESS_EMAIL}" style="color:${NAVY};">${BUSINESS_EMAIL}</a>
</td></tr>
</table></td></tr></table>
</body></html>`;
}

export function buildAbandonedBookingRecoveryEmail(
  record: AbandonedBookingRecord,
  options?: { origin?: string; businessName?: string },
): AbandonedBookingEmail {
  const businessName = options?.businessName ?? "My Airport Taxi NI";
  const origin = options?.origin ?? BUSINESS_WEBSITE;
  const resumeUrl = buildAbandonedBookingRecoveryUrl(record.token, origin);
  const optOutUrl = buildAbandonedBookingOptOutUrl(record.token, origin);
  const first = firstNameFromCustomerName(record.customerName);
  const j = record.journey;
  const price =
    j.quotedAmountLabel || formatAbandonedAmount(j.quotedAmount) || "as quoted";
  const when = journeyScheduleLabel(j.tripDate, j.tripTime);
  const subject = "Still need your airport transfer?";

  const text =
    `Still need your airport transfer?\n\n` +
    `Hi ${first},\n\n` +
    `You recently started arranging a journey with ${businessName} but didn’t complete your booking.\n\n` +
    `Your journey:\n` +
    `${j.pickupLabel} → ${j.dropoffLabel}\n` +
    `${when}\n` +
    `Quoted price: ${price}\n\n` +
    `If you’d still like to travel with us, continue your booking here:\n${resumeUrl}\n\n` +
    `If you’ve changed your plans, there’s nothing you need to do.\n\n` +
    `This is a single booking-recovery reminder, not a marketing email.\n` +
    `Stop booking recovery emails: ${optOutUrl}\n\n` +
    `${businessName}\n`;

  const bodyHtml =
    `<p style="margin:0 0 16px;">Hi ${escapeHtml(first)},</p>` +
    `<p style="margin:0 0 16px;">You recently started arranging a journey with ${escapeHtml(businessName)} but didn’t complete your booking.</p>` +
    `<p style="margin:0 0 8px;"><strong>Your journey:</strong></p>` +
    `<p style="margin:0 0 16px;">${escapeHtml(j.pickupLabel)} → ${escapeHtml(j.dropoffLabel)}<br/>` +
    `${escapeHtml(when)}<br/>` +
    `Quoted price: ${escapeHtml(price)}</p>` +
    `<p style="margin:0 0 8px;">If you’d still like to travel with us, you can continue your booking below.</p>`;

  return {
    subject,
    text,
    html: brandedHtml({
      title: "Booking reminder",
      headline: "Still need your airport transfer?",
      bodyHtml,
      ctaUrl: resumeUrl,
      ctaLabel: "Continue My Booking",
      optOutUrl,
      businessName,
    }),
  };
}
