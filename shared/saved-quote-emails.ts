/**
 * Transactional emails for Saved Quotes (immediate + reminders).
 * Not marketing — quote-related only. Never subscribe to mailing lists.
 */

import {
  BRAND_EMERALD,
  BRAND_NAVY,
  BUSINESS_MAILBOX,
  BUSINESS_WEBSITE as CANONICAL_BUSINESS_WEBSITE,
  lightCustomerEmailHtml,
  businessEmailClientMeta,
  businessEmailLogoHtml,
} from "./business-email";
import {
  SAVED_QUOTE_ADD_SCHEDULE_COPY,
  activeSavedQuoteHeldPrice,
  buildSavedQuoteCustomerUrl,
  firstNameFromCustomerName,
  formatSavedQuoteExpiryLabel,
  savedQuoteHasSchedule,
  type SavedQuoteHeldPrice,
  type SavedQuoteRecord,
} from "./saved-quote";
import { formatUkDateTime } from "./uk-time";

export type SavedQuoteEmail = {
  subject: string;
  text: string;
  html: string;
};

const BUSINESS_WEBSITE = CANONICAL_BUSINESS_WEBSITE;
const BUSINESS_EMAIL = BUSINESS_MAILBOX;
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
  if (!d || !t) return "Not set";
  return formatUkDateTime(d, t) || `${d} at ${t}`;
}

function journeySummary(record: SavedQuoteRecord): string {
  const j = record.journey;
  const when = journeyScheduleLabel(j.tripDate, j.tripTime);
  const ret =
    j.returnJourney
      ? `\nReturn: ${journeyScheduleLabel(j.returnDate, j.returnTime)}`
      : "";
  return `From: ${j.pickupLabel}\nTo: ${j.dropoffLabel}\nJourney: ${when}${ret}`;
}

function journeySummaryHtml(record: SavedQuoteRecord): string {
  const j = record.journey;
  const when = journeyScheduleLabel(j.tripDate, j.tripTime);
  const ret =
    j.returnJourney
      ? `<br/><strong>Return:</strong> ${escapeHtml(journeyScheduleLabel(j.returnDate, j.returnTime))}`
      : "";
  return (
    `<strong>From:</strong> ${escapeHtml(j.pickupLabel)}<br/>` +
    `<strong>To:</strong> ${escapeHtml(j.dropoffLabel)}<br/>` +
    `<strong>Journey:</strong> ${escapeHtml(when)}${ret}`
  );
}

/**
 * What the email offers: a held fixed price (book straight away at that price),
 * or the saved journey link (no date/time given, or no hold available).
 */
type SavedQuoteOffer =
  | { kind: "held"; held: SavedQuoteHeldPrice; heldUntilLabel: string; savedUrl: string }
  | { kind: "add-schedule"; savedUrl: string }
  | { kind: "recalculated"; savedUrl: string };

function savedQuoteOffer(record: SavedQuoteRecord, origin: string, now: Date): SavedQuoteOffer {
  const savedUrl = buildSavedQuoteCustomerUrl(record.token, origin);
  const held = activeSavedQuoteHeldPrice(record, now);
  if (held) return { kind: "held", held, heldUntilLabel: formatSavedQuoteExpiryLabel(held.heldUntil), savedUrl };
  if (!savedQuoteHasSchedule(record.journey)) return { kind: "add-schedule", savedUrl };
  return { kind: "recalculated", savedUrl };
}

function offerCta(offer: SavedQuoteOffer, fallbackLabel: string): { url: string; label: string } {
  if (offer.kind === "held") return { url: offer.held.bookingUrl, label: `Book now at ${offer.held.amountLabel}` };
  if (offer.kind === "add-schedule") return { url: offer.savedUrl, label: "Add Your Date and Time" };
  return { url: offer.savedUrl, label: fallbackLabel };
}

function offerPrice(record: SavedQuoteRecord, offer: SavedQuoteOffer): string {
  return offer.kind === "held" ? offer.held.amountLabel : record.pricing.amountLabel;
}

function heldLine(offer: Extract<SavedQuoteOffer, { kind: "held" }>): string {
  return `Your price of ${offer.held.amountLabel} is held until ${offer.heldUntilLabel}.`;
}

function changeLinkText(offer: SavedQuoteOffer): string {
  return offer.kind === "held"
    ? `\n\nTo change the date, time or other details, view your saved quote (a changed journey is priced again):\n${offer.savedUrl}`
    : "";
}

function changeLinkHtml(offer: SavedQuoteOffer): string {
  return offer.kind === "held"
    ? `<p style="margin:12px 0 0;font-size:13px;text-align:center;"><a href="${escapeHtml(offer.savedUrl)}" style="color:${NAVY};">View or change your quote</a> (a changed journey is priced again)</p>`
    : "";
}

function brandedHtml(input: {
  title: string;
  headline: string;
  bodyHtml: string;
  ctaUrl: string;
  ctaLabel: string;
  businessName: string;
  afterCtaHtml?: string;
}): string {
  return lightCustomerEmailHtml(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
${businessEmailClientMeta()}
<title>${escapeHtml(input.title)} — ${escapeHtml(input.businessName)}</title></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1a2b3c;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
<tr><td style="background:${NAVY};padding:28px 32px;text-align:center;">
${businessEmailLogoHtml()}
<div style="margin-top:16px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${ACCENT};font-weight:bold;">${escapeHtml(input.title)}</div>
<div style="margin-top:8px;font-size:22px;line-height:1.35;color:#ffffff;font-weight:bold;">${input.headline}</div>
</td></tr>
<tr><td style="padding:28px 32px;font-size:15px;line-height:1.7;color:#334155;">${input.bodyHtml}
<p style="margin:24px 0 8px;text-align:center;">
<a href="${escapeHtml(input.ctaUrl)}" style="display:inline-block;background:${NAVY};color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;padding:14px 28px;border-radius:8px;">${escapeHtml(input.ctaLabel)}</a>
</p>${input.afterCtaHtml ?? ""}
<p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#64748b;text-align:center;">Secure card payment powered by SumUp.</p>
</td></tr>
<tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 32px;font-size:13px;color:#64748b;">
<strong style="color:${NAVY};">${escapeHtml(input.businessName)}</strong><br />
<a href="${BUSINESS_WEBSITE}" style="color:${NAVY};">${BUSINESS_WEBSITE.replace(/^https:\/\//, "")}</a> ·
<a href="mailto:${BUSINESS_EMAIL}" style="color:${NAVY};">${BUSINESS_EMAIL}</a>
</td></tr>
</table></td></tr></table>
</body></html>`);
}

export function buildSavedQuoteInitialEmail(
  record: SavedQuoteRecord,
  options?: { origin?: string; businessName?: string; now?: Date },
): SavedQuoteEmail {
  const businessName = options?.businessName ?? "My Airport Taxi NI";
  const origin = options?.origin ?? BUSINESS_WEBSITE;
  const offer = savedQuoteOffer(record, origin, options?.now ?? new Date());
  const cta = offerCta(offer, "Return to My Quote");
  const first = firstNameFromCustomerName(record.customerName);
  const expiry = formatSavedQuoteExpiryLabel(record.expiresAt);
  const price = offerPrice(record, offer);
  const days = Math.round((Date.parse(record.expiresAt) - Date.parse(record.createdAt)) / 86400000);
  const subject = "Your Airport Transfer Quote — My Airport Taxi NI";

  const priceIntro =
    offer.kind === "held" ? "Your fixed price for this journey is:" : "Your airport transfer quote is:";
  const validity =
    offer.kind === "held"
      ? `Price held until:\n${offer.heldUntilLabel}`
      : `Your quote is valid until:\n${expiry}`;
  const terms =
    offer.kind === "held"
      ? `${heldLine(offer)} No obligation to book. No marketing subscription or follow-up messages.`
      : offer.kind === "add-schedule"
        ? `${SAVED_QUOTE_ADD_SCHEDULE_COPY} Your quote can be retrieved for ${days} days. No marketing subscription or follow-up messages.`
        : `Your quote can be retrieved for ${days} days. The fare will be recalculated before booking and may change. No marketing subscription or follow-up messages.`;
  const ctaIntro =
    offer.kind === "held"
      ? "To book at this price and pay securely, use the link below:"
      : offer.kind === "add-schedule"
        ? "To add your date and time and book, use the link below:"
        : "To complete your booking and pay securely, use the link below:";

  const text =
    `Your airport transfer quote is saved\n\n` +
    `Hi ${first},\n\n` +
    `Thanks for requesting a quote from ${businessName}.\n\n` +
    `${priceIntro}\n\n` +
    `${price}\n\n` +
    `${journeySummary(record)}\n${quoteDetails(record)}\n\n` +
    `Quote reference:\n${record.reference}\n\n` +
    `${validity}\n\n` +
    `Your journey has not yet been booked. ${terms}\n\n` +
    `${ctaIntro}\n\n` +
    `${cta.label}\n${cta.url}` +
    `${changeLinkText(offer)}\n\n` +
    `Secure card payment powered by SumUp.\n\n` +
    `${businessName}\n${BUSINESS_WEBSITE}`;

  const html = brandedHtml({
    title: "Saved quote",
    headline: `Hi ${escapeHtml(first)}, your quote is saved`,
    bodyHtml:
      `<p>Thanks for requesting a quote from ${escapeHtml(businessName)}.</p>` +
      `<p style="font-size:28px;font-weight:bold;color:${NAVY};margin:16px 0;">${escapeHtml(price)}</p>` +
      `<p>${journeySummaryHtml(record)}</p>` +
      `<p>${escapeHtml(quoteDetails(record)).replace(/\n/g, "<br/>")}</p>` +
      `<p><strong>Quote reference:</strong> ${escapeHtml(record.reference)}<br/>` +
      (offer.kind === "held"
        ? `<strong>Price held until:</strong> ${escapeHtml(offer.heldUntilLabel)}</p>`
        : `<strong>Valid until:</strong> ${escapeHtml(expiry)}</p>`) +
      `<p><strong>Your journey has not yet been booked.</strong> ${escapeHtml(terms)}</p>`,
    ctaUrl: cta.url,
    ctaLabel: cta.label,
    businessName,
    afterCtaHtml: changeLinkHtml(offer),
  });

  return { subject, text, html };
}

export function buildSavedQuoteFirstReminderEmail(
  record: SavedQuoteRecord,
  options?: { origin?: string; businessName?: string; now?: Date },
): SavedQuoteEmail {
  const businessName = options?.businessName ?? "My Airport Taxi NI";
  const origin = options?.origin ?? BUSINESS_WEBSITE;
  const offer = savedQuoteOffer(record, origin, options?.now ?? new Date());
  const cta = offerCta(offer, "Book This Journey");
  const first = firstNameFromCustomerName(record.customerName);
  const expiry = formatSavedQuoteExpiryLabel(record.expiresAt);
  const price = offerPrice(record, offer);
  const subject = `Your My Airport Taxi NI quote is still available`;
  const priceLine = offer.kind === "held" ? `Your fixed price: ${price}` : `Your quote: ${price}`;
  const status =
    offer.kind === "held"
      ? heldLine(offer)
      : offer.kind === "add-schedule"
        ? `Your quote is saved until ${expiry}. ${SAVED_QUOTE_ADD_SCHEDULE_COPY}`
        : `Your quote is saved until ${expiry}.`;

  const text =
    `Hi ${first},\n\n` +
    `Just a reminder that your airport transfer quote is still available.\n\n` +
    `${priceLine}\n\n` +
    `${journeySummary(record)}\n\n` +
    `${status}\n\n` +
    `If you’d like to secure your journey, you can continue below:\n\n` +
    `${cta.label}\n${cta.url}` +
    `${changeLinkText(offer)}\n\n` +
    `Your journey is not booked until payment has been completed.\n\n` +
    `${businessName}\n${BUSINESS_WEBSITE}`;

  const html = brandedHtml({
    title: "Quote reminder",
    headline: `Hi ${escapeHtml(first)}, your quote is still available`,
    bodyHtml:
      `<p>Just a reminder that your airport transfer quote is still available.</p>` +
      `<p style="font-size:24px;font-weight:bold;color:${NAVY};">${escapeHtml(price)}</p>` +
      `<p>${journeySummaryHtml(record)}</p>` +
      `<p>${escapeHtml(status)}</p>` +
      `<p>Your journey is not booked until payment has been completed.</p>`,
    ctaUrl: cta.url,
    ctaLabel: cta.label,
    businessName,
    afterCtaHtml: changeLinkHtml(offer),
  });

  return { subject, text, html };
}

export function buildSavedQuoteFinalReminderEmail(
  record: SavedQuoteRecord,
  options?: { origin?: string; businessName?: string; now?: Date },
): SavedQuoteEmail {
  const businessName = options?.businessName ?? "My Airport Taxi NI";
  const origin = options?.origin ?? BUSINESS_WEBSITE;
  const offer = savedQuoteOffer(record, origin, options?.now ?? new Date());
  const cta = offerCta(offer, "Book This Journey");
  const first = firstNameFromCustomerName(record.customerName);
  const expiry = formatSavedQuoteExpiryLabel(record.expiresAt);
  const price = offerPrice(record, offer);
  const subject = `Your airport transfer quote expires soon`;
  const priceLine = offer.kind === "held" ? `Fixed price: ${price}` : `Quote: ${price}`;
  const status =
    offer.kind === "held"
      ? heldLine(offer)
      : offer.kind === "add-schedule"
        ? `Your saved quote expires on ${expiry}. ${SAVED_QUOTE_ADD_SCHEDULE_COPY}`
        : `Your saved quote expires on ${expiry}.`;

  const text =
    `Hi ${first},\n\n` +
    `Your ${businessName} quote will expire soon.\n\n` +
    `${priceLine}\n\n` +
    `${journeySummary(record)}\n\n` +
    `${status}\n\n` +
    `If you still need the transfer, you can complete your booking below:\n\n` +
    `${cta.label}\n${cta.url}` +
    `${changeLinkText(offer)}\n\n` +
    `After the quote expires, a new quote will be required.\n\n` +
    `${businessName}\n${BUSINESS_WEBSITE}`;

  const html = brandedHtml({
    title: "Quote expires soon",
    headline: `Hi ${escapeHtml(first)}, your quote expires soon`,
    bodyHtml:
      `<p>Your ${escapeHtml(businessName)} quote will expire soon.</p>` +
      `<p style="font-size:24px;font-weight:bold;color:${NAVY};">${escapeHtml(price)}</p>` +
      `<p>${journeySummaryHtml(record)}</p>` +
      `<p>${escapeHtml(status)}</p>` +
      `<p>After the quote expires, a new quote will be required.</p>`,
    ctaUrl: cta.url,
    ctaLabel: cta.label,
    businessName,
    afterCtaHtml: changeLinkHtml(offer),
  });

  return { subject, text, html };
}

function quoteDetails(record: SavedQuoteRecord): string {
  const j = record.journey;
  // Only mention charges or savings that actually apply to this quote.
  const airportCharges = record.pricing.airportChargesGbp ?? 0;
  const returnSaving = record.pricing.returnSavingGbp ?? 0;
  return [
    `Vehicle: ${j.vehicle}`,
    `Passengers: ${j.passengers} · Suitcases: ${j.suitcases}`,
    j.returnJourney ? "Return journey" : "One-way journey",
    ...(airportCharges > 0 ? [`Airport charges included: £${airportCharges.toFixed(2)}`] : []),
    ...(returnSaving > 0 ? [`Return saving included: £${returnSaving.toFixed(2)}`] : []),
  ].join("\n");
}
