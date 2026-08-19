/**
 * Transactional emails for Saved Quotes (immediate + reminders).
 * Not marketing — quote-related only. Never subscribe to mailing lists.
 */

import {
  BRAND_EMERALD,
  BRAND_NAVY,
  BUSINESS_MAILBOX,
  BUSINESS_WEBSITE as CANONICAL_BUSINESS_WEBSITE,
} from "./business-email";
import {
  buildSavedQuoteCustomerUrl,
  firstNameFromCustomerName,
  formatSavedQuoteExpiryLabel,
  type SavedQuoteRecord,
} from "./saved-quote";

export type SavedQuoteEmail = {
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

function journeySummary(record: SavedQuoteRecord): string {
  const j = record.journey;
  const when = [j.tripDate, j.tripTime].filter(Boolean).join(" at ");
  const ret =
    j.returnJourney && j.returnDate
      ? `\nReturn: ${j.returnDate}${j.returnTime ? ` at ${j.returnTime}` : ""}`
      : "";
  return `From: ${j.pickupLabel}\nTo: ${j.dropoffLabel}\nJourney: ${when}${ret}`;
}

function journeySummaryHtml(record: SavedQuoteRecord): string {
  const j = record.journey;
  const when = [j.tripDate, j.tripTime].filter(Boolean).join(" at ");
  const ret =
    j.returnJourney && j.returnDate
      ? `<br/><strong>Return:</strong> ${escapeHtml(j.returnDate)}${j.returnTime ? ` at ${escapeHtml(j.returnTime)}` : ""}`
      : "";
  return (
    `<strong>From:</strong> ${escapeHtml(j.pickupLabel)}<br/>` +
    `<strong>To:</strong> ${escapeHtml(j.dropoffLabel)}<br/>` +
    `<strong>Journey:</strong> ${escapeHtml(when)}${ret}`
  );
}

function brandedHtml(input: {
  title: string;
  headline: string;
  bodyHtml: string;
  ctaUrl: string;
  ctaLabel: string;
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
<p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#64748b;text-align:center;">Secure card payment powered by SumUp.</p>
</td></tr>
<tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 32px;font-size:13px;color:#64748b;">
<strong style="color:${NAVY};">${escapeHtml(input.businessName)}</strong><br />
<a href="${BUSINESS_WEBSITE}" style="color:${NAVY};">${BUSINESS_WEBSITE.replace(/^https:\/\//, "")}</a> ·
<a href="mailto:${BUSINESS_EMAIL}" style="color:${NAVY};">${BUSINESS_EMAIL}</a>
</td></tr>
</table></td></tr></table>
</body></html>`;
}

export function buildSavedQuoteInitialEmail(
  record: SavedQuoteRecord,
  options?: { origin?: string; businessName?: string },
): SavedQuoteEmail {
  const businessName = options?.businessName ?? "My Airport Taxi NI";
  const origin = options?.origin ?? BUSINESS_WEBSITE;
  const url = buildSavedQuoteCustomerUrl(record.token, origin);
  const first = firstNameFromCustomerName(record.customerName);
  const expiry = formatSavedQuoteExpiryLabel(record.expiresAt);
  const price = record.pricing.amountLabel;
  const subject = `Your My Airport Taxi NI Quote – ${record.reference}`;

  const text =
    `Your airport transfer quote is saved\n\n` +
    `Hi ${first},\n\n` +
    `Thanks for requesting a quote from ${businessName}.\n\n` +
    `Your fixed-price airport transfer quote is:\n\n` +
    `${price}\n\n` +
    `${journeySummary(record)}\n\n` +
    `Quote reference:\n${record.reference}\n\n` +
    `Your quote is valid until:\n${expiry}\n\n` +
    `Your journey has not yet been booked.\n\n` +
    `To complete your booking and pay securely, use the link below:\n\n` +
    `Book This Journey\n${url}\n\n` +
    `Secure card payment powered by SumUp.\n\n` +
    `${businessName}\n${BUSINESS_WEBSITE}`;

  const html = brandedHtml({
    title: "Saved quote",
    headline: `Hi ${escapeHtml(first)}, your quote is saved`,
    bodyHtml:
      `<p>Thanks for requesting a quote from ${escapeHtml(businessName)}.</p>` +
      `<p style="font-size:28px;font-weight:bold;color:${NAVY};margin:16px 0;">${escapeHtml(price)}</p>` +
      `<p>${journeySummaryHtml(record)}</p>` +
      `<p><strong>Quote reference:</strong> ${escapeHtml(record.reference)}<br/>` +
      `<strong>Valid until:</strong> ${escapeHtml(expiry)}</p>` +
      `<p><strong>Your journey has not yet been booked.</strong></p>`,
    ctaUrl: url,
    ctaLabel: "Book This Journey",
    businessName,
  });

  return { subject, text, html };
}

export function buildSavedQuoteFirstReminderEmail(
  record: SavedQuoteRecord,
  options?: { origin?: string; businessName?: string },
): SavedQuoteEmail {
  const businessName = options?.businessName ?? "My Airport Taxi NI";
  const origin = options?.origin ?? BUSINESS_WEBSITE;
  const url = buildSavedQuoteCustomerUrl(record.token, origin);
  const first = firstNameFromCustomerName(record.customerName);
  const expiry = formatSavedQuoteExpiryLabel(record.expiresAt);
  const price = record.pricing.amountLabel;
  const subject = `Your My Airport Taxi NI quote is still available`;

  const text =
    `Hi ${first},\n\n` +
    `Just a reminder that your airport transfer quote is still available.\n\n` +
    `Your fixed price: ${price}\n\n` +
    `${journeySummary(record)}\n\n` +
    `Your quote is saved until ${expiry}.\n\n` +
    `If you’d like to secure your journey, you can continue below:\n\n` +
    `Book This Journey\n${url}\n\n` +
    `Your journey is not booked until payment has been completed.\n\n` +
    `${businessName}\n${BUSINESS_WEBSITE}`;

  const html = brandedHtml({
    title: "Quote reminder",
    headline: `Hi ${escapeHtml(first)}, your quote is still available`,
    bodyHtml:
      `<p>Just a reminder that your airport transfer quote is still available.</p>` +
      `<p style="font-size:24px;font-weight:bold;color:${NAVY};">${escapeHtml(price)}</p>` +
      `<p>${journeySummaryHtml(record)}</p>` +
      `<p>Your quote is saved until <strong>${escapeHtml(expiry)}</strong>.</p>` +
      `<p>Your journey is not booked until payment has been completed.</p>`,
    ctaUrl: url,
    ctaLabel: "Book This Journey",
    businessName,
  });

  return { subject, text, html };
}

export function buildSavedQuoteFinalReminderEmail(
  record: SavedQuoteRecord,
  options?: { origin?: string; businessName?: string },
): SavedQuoteEmail {
  const businessName = options?.businessName ?? "My Airport Taxi NI";
  const origin = options?.origin ?? BUSINESS_WEBSITE;
  const url = buildSavedQuoteCustomerUrl(record.token, origin);
  const first = firstNameFromCustomerName(record.customerName);
  const expiry = formatSavedQuoteExpiryLabel(record.expiresAt);
  const price = record.pricing.amountLabel;
  const subject = `Your airport transfer quote expires soon`;

  const text =
    `Hi ${first},\n\n` +
    `Your ${businessName} quote will expire soon.\n\n` +
    `Fixed price: ${price}\n\n` +
    `${journeySummary(record)}\n\n` +
    `Your saved quote expires on:\n${expiry}\n\n` +
    `If you still need the transfer, you can complete your booking below:\n\n` +
    `Book This Journey\n${url}\n\n` +
    `After the quote expires, a new quote will be required.\n\n` +
    `${businessName}\n${BUSINESS_WEBSITE}`;

  const html = brandedHtml({
    title: "Quote expires soon",
    headline: `Hi ${escapeHtml(first)}, your quote expires soon`,
    bodyHtml:
      `<p>Your ${escapeHtml(businessName)} quote will expire soon.</p>` +
      `<p style="font-size:24px;font-weight:bold;color:${NAVY};">${escapeHtml(price)}</p>` +
      `<p>${journeySummaryHtml(record)}</p>` +
      `<p>Your saved quote expires on <strong>${escapeHtml(expiry)}</strong>.</p>` +
      `<p>After the quote expires, a new quote will be required.</p>`,
    ctaUrl: url,
    ctaLabel: "Book This Journey",
    businessName,
  });

  return { subject, text, html };
}
