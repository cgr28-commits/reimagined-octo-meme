/**
 * Customer email carrying a promo code (owner's suggested wording, 16 Nov 2026), in the house
 * email style: navy header with the wide logo, white card, green button, standard navy footer.
 * Signed as the business only (no personal name).
 */
import {
  BRAND_EMERALD,
  BRAND_NAVY,
  BUSINESS_NAME,
  BUSINESS_WEBSITE,
  brandFrameEmailHtml,
  businessEmailClientMeta,
  businessEmailLogoHtml,
} from "./business-email";
import { formatPromoExpiryDate, formatPromoPercent } from "./promo-code";

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function pounds(amount: number): string {
  return Number.isInteger(amount) ? `£${amount}` : `£${amount.toFixed(2)}`;
}

/** Page with a working Copy button (emails can't copy text themselves). */
export function promoCopyUrl(siteUrl: string, code: string): string {
  return `${siteUrl.replace(/\/$/, "")}/promo-code/?code=${encodeURIComponent(code)}`;
}

export function promoBookingUrl(siteUrl = BUSINESS_WEBSITE, code?: string): string {
  const base = siteUrl.replace(/\/$/, "");
  return code ? `${base}/?promo=${encodeURIComponent(code)}#quote` : `${base}/`;
}

export function buildPromoCodeEmail(input: {
  code: string;
  expiresAt: string;
  discountRate: number;
  minimumVehicleFareGbp: number;
  /** Days from issue (shown in the email); defaults to 30. */
  validityDays?: number;
  /** Owner has excluded some travel dates (shown in the terms line). */
  hasExcludedDates?: boolean;
  /** Scheduled offer the code was issued under, e.g. "Black Friday". */
  offerName?: string;
  siteUrl?: string;
}): { subject: string; text: string; html: string } {
  const days = Math.max(1, Math.round(Number(input.validityDays) || 30));
  const site = (input.siteUrl || BUSINESS_WEBSITE).replace(/\/$/, "");
  const pct = formatPromoPercent(input.discountRate);
  const expiry = formatPromoExpiryDate(input.expiresAt);
  const bookUrl = promoBookingUrl(site, input.code);
  const copyUrl = promoCopyUrl(site, input.code);
  const minimum = pounds(Math.round(input.minimumVehicleFareGbp * 100) / 100);
  const offer = input.offerName?.trim();
  const subject = offer ? `Your ${offer} ${pct} Airport Transfer Discount` : `Your Exclusive ${pct} Airport Transfer Discount`;
  const codeLine = offer ? `Your exclusive ${offer} ${pct} discount code is:` : `Your exclusive ${pct} discount code is:`;
  const terms = `Airport charges are excluded. Minimum eligible vehicle fare ${minimum}. One redemption per customer.${input.hasExcludedDates ? " Some peak travel dates are excluded; you'll see this when you enter the code." : ""} The code is linked to this email address, so please book using it.`;

  const text =
    `Thank you for choosing ${BUSINESS_NAME}.\n\n` +
    `${codeLine}\n\n` +
    `${input.code}\n\n` +
    `Copy your code: ${copyUrl}\n\n` +
    `Your code is valid for ${days} days from the date of issue, until ${expiry}.\n\n` +
    `Enter your code when booking your airport transfer online to receive ${pct} off your vehicle fare.\n\n` +
    `Book online: ${bookUrl}\n\n` +
    `${terms}\n\n` +
    `${BUSINESS_NAME}\n${site}\n\n` +
    `You received this email because this address was entered on our website to request a discount code. ` +
    `It does not sign you up to marketing emails.`;

  const card = `<!doctype html><html><head><meta charset="utf-8">${businessEmailClientMeta()}<title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f7fa;font-family:Arial,Helvetica,sans-serif;color:${BRAND_NAVY};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fa;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;">
<tr><td bgcolor="${BRAND_NAVY}" style="background:${BRAND_NAVY};padding:22px 24px;text-align:center;">${businessEmailLogoHtml()}</td></tr>
<tr><td style="padding:28px 24px 8px;font-size:15px;line-height:1.6;color:${BRAND_NAVY};">
<p style="margin:0 0 14px;">Thank you for choosing ${esc(BUSINESS_NAME)}.</p>
<p style="margin:0 0 10px;">${esc(codeLine)}</p>
</td></tr>
<tr><td align="center" style="padding:4px 24px 6px;">
<table role="presentation" cellpadding="0" cellspacing="0" style="border:2px dashed ${BRAND_EMERALD};border-radius:12px;background:#f2fbf4;"><tr>
<td style="padding:16px 26px;font-family:'Courier New',Courier,monospace;font-size:26px;letter-spacing:3px;font-weight:bold;color:${BRAND_NAVY};-webkit-user-select:all;user-select:all;">${esc(input.code)}</td>
</tr></table>
</td></tr>
<tr><td align="center" style="padding:10px 24px 2px;">
<a href="${esc(copyUrl)}" style="display:inline-block;background:#ffffff;color:${BRAND_NAVY};-webkit-text-fill-color:${BRAND_NAVY};text-decoration:none;font-weight:bold;font-size:15px;padding:11px 22px;border-radius:10px;border:2px solid ${BRAND_NAVY};">&#128203; Copy code</a>
</td></tr>
<tr><td style="padding:14px 24px 4px;font-size:15px;line-height:1.6;color:${BRAND_NAVY};">
<p style="margin:0 0 12px;">Your code is valid for ${days} days from the date of issue, until <strong>${esc(expiry)}</strong>.</p>
<p style="margin:0 0 18px;">Enter your code when booking your airport transfer online to receive ${esc(pct)} off your vehicle fare.</p>
<p style="margin:0 0 6px;text-align:center;"><a href="${esc(bookUrl)}" style="display:inline-block;background:${BRAND_EMERALD};color:#ffffff;-webkit-text-fill-color:#ffffff;text-decoration:none;font-weight:bold;font-size:16px;padding:14px 28px;border-radius:10px;">Book online</a></p>
<p style="margin:0 0 22px;text-align:center;font-size:12px;color:#5b6b80;">Booking with this button adds your code for you.</p>
<p style="margin:0 0 6px;font-size:12px;line-height:1.5;color:#5b6b80;">${esc(terms)}</p>
<p style="margin:0 0 18px;font-size:12px;line-height:1.5;color:#5b6b80;">You received this email because this address was entered on our website to request a discount code. It does not sign you up to marketing emails.</p>
</td></tr>
<tr><td style="padding:0 24px 22px;font-size:14px;color:${BRAND_NAVY};"><p style="margin:0;font-weight:bold;">${esc(BUSINESS_NAME)}</p></td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html: brandFrameEmailHtml(card) };
}

/** Sent instead of a new code to a customer who has already used their welcome discount. */
export function buildPromoAlreadyUsedEmail(input: { siteUrl?: string }): { subject: string; text: string; html: string } {
  const site = (input.siteUrl || BUSINESS_WEBSITE).replace(/\/$/, "");
  const subject = "About your discount code request";
  const text =
    `Thank you for your interest in ${BUSINESS_NAME}.\n\n` +
    `Our welcome discount can be used once per customer, and it has already been used with this email address, so we can't send another code.\n\n` +
    `You can still get an instant fixed price and book online: ${site}/\n\n` +
    `${BUSINESS_NAME}`;
  const card = `<!doctype html><html><head><meta charset="utf-8">${businessEmailClientMeta()}<title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f7fa;font-family:Arial,Helvetica,sans-serif;color:${BRAND_NAVY};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fa;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;">
<tr><td bgcolor="${BRAND_NAVY}" style="background:${BRAND_NAVY};padding:22px 24px;text-align:center;">${businessEmailLogoHtml()}</td></tr>
<tr><td style="padding:28px 24px 8px;font-size:15px;line-height:1.6;color:${BRAND_NAVY};">
<p style="margin:0 0 14px;">Thank you for your interest in ${esc(BUSINESS_NAME)}.</p>
<p style="margin:0 0 18px;">Our welcome discount can be used once per customer, and it has already been used with this email address, so we can't send another code.</p>
<p style="margin:0 0 22px;text-align:center;"><a href="${esc(site)}/" style="display:inline-block;background:${BRAND_EMERALD};color:#ffffff;-webkit-text-fill-color:#ffffff;text-decoration:none;font-weight:bold;font-size:16px;padding:14px 28px;border-radius:10px;">Get a fixed price</a></p>
</td></tr>
<tr><td style="padding:0 24px 22px;font-size:14px;color:${BRAND_NAVY};"><p style="margin:0;font-weight:bold;">${esc(BUSINESS_NAME)}</p></td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html: brandFrameEmailHtml(card) };
}
