/**
 * Emails for bespoke (manually priced) Event / Business Class requests.
 * New templates only — existing airport booking emails are not touched.
 *
 * Privacy rules:
 * - Customer emails contain only that customer's own journey and quote.
 * - Customer emails never contain owner notes, costs, profit or availability notes.
 * - The owner alert contains customer contact details (owner mailbox only) but no
 *   dashboard key and no customer quote link.
 * - The quote link carries its token after "#" so it never reaches web-server logs.
 */

import {
  BRAND_EMERALD,
  BRAND_NAVY,
  BUSINESS_LANDLINE_DISPLAY,
  BUSINESS_MAILBOX,
  BUSINESS_PHONE_DISPLAY,
  BUSINESS_WEBSITE,
  businessEmailClientMeta,
  businessEmailLogoHtml,
  lightCustomerEmailHtml,
} from "./business-email";
import {
  BESPOKE_QUOTE_CATEGORY_LABELS,
  BUSINESS_CLASS_REQUEST_SERVICE_LABELS,
  type BespokeQuoteRecord,
} from "./bespoke-quote";
import { formatUkDate, formatUkInstant } from "./uk-time";

export type BespokeEmail = { subject: string; text: string; html: string };

/** Path of the customer quotation page (static, noindex). Token goes in the fragment. */
export const BESPOKE_QUOTATION_PATH = "/quotation/";

export function bespokeQuotationUrl(token: string, siteOrigin = BUSINESS_WEBSITE): string {
  return `${siteOrigin.replace(/\/+$/, "")}${BESPOKE_QUOTATION_PATH}#t=${encodeURIComponent(token)}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "there";
}

function gbp(amount: number): string {
  return `£${amount.toFixed(2)}`;
}

function serviceLine(record: BespokeQuoteRecord): string {
  if (record.category === "event" && record.event) {
    return `${record.event.title}, ${record.event.venue} (${formatUkDate(record.event.date)})`;
  }
  if (record.serviceType) return BUSINESS_CLASS_REQUEST_SERVICE_LABELS[record.serviceType];
  return BESPOKE_QUOTE_CATEGORY_LABELS[record.category];
}

/** Customer-safe journey lines (their own details only). */
function journeyLines(record: BespokeQuoteRecord): Array<[string, string]> {
  const j = record.journey;
  const lines: Array<[string, string]> = [
    [record.category === "event" ? "Event" : "Service", serviceLine(record)],
    ["Pickup", j.pickupAddress],
    ["Destination", j.destinationAddress],
    ["Date and time", `${formatUkDate(j.date)} at ${j.time}`],
  ];
  if (j.returnJourney && j.returnDate && j.returnTime) {
    lines.push(["Return", `${formatUkDate(j.returnDate)} at ${j.returnTime}`]);
  }
  if (j.additionalStops.length > 0) lines.push(["Additional stops", j.additionalStops.join("; ")]);
  lines.push(["Passengers", String(j.passengers)]);
  if (j.groupVehicleRequested) lines.push(["Group vehicle", "Requested — subject to vehicle and driver availability"]);
  if (j.flightNumber) lines.push(["Flight", j.flightNumber]);
  return lines;
}

function linesText(lines: Array<[string, string]>): string[] {
  return lines.map(([k, v]) => `${k}: ${v}`);
}

function linesHtml(lines: Array<[string, string]>): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">${lines
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 8px 6px 0;vertical-align:top;color:#9fb3c8;font-size:14px;white-space:nowrap;">${escapeHtml(k)}</td><td style="padding:6px 0;font-size:14px;color:#ffffff;">${escapeHtml(v)}</td></tr>`,
    )
    .join("")}</table>`;
}

const CONTACT_TEXT = `My Airport Taxi NI · Call ${BUSINESS_LANDLINE_DISPLAY} · WhatsApp ${BUSINESS_PHONE_DISPLAY} · ${BUSINESS_MAILBOX}`;

function shell(label: string, bodyHtml: string): string {
  return lightCustomerEmailHtml(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
${businessEmailClientMeta()}</head>
<body style="margin:0;padding:0;background:#0b1f33;font-family:Arial,Helvetica,sans-serif;color:#ffffff;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0b1f33;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:${BRAND_NAVY};border-radius:16px;overflow:hidden;">
        <tr><td style="padding:28px 28px 12px;text-align:center;">
          ${businessEmailLogoHtml()}
          <div style="margin-top:12px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND_EMERALD};font-weight:bold;">My Airport Taxi NI</div>
          <p style="margin:8px 0 0;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND_EMERALD};">${escapeHtml(label)}</p>
        </td></tr>
        <tr><td style="padding:12px 28px 28px;font-size:15px;line-height:1.55;color:#e6eef7;">
          ${bodyHtml}
          <p style="margin:24px 0 0;font-size:13px;color:#9fb3c8;">${escapeHtml(CONTACT_TEXT)}<br/>${escapeHtml(BUSINESS_WEBSITE)}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`);
}

// ---------------------------------------------------------------------------
// 1. Customer acknowledgement
// ---------------------------------------------------------------------------

export function buildBespokeRequestAcknowledgementEmail(record: BespokeQuoteRecord): BespokeEmail {
  const kind = BESPOKE_QUOTE_CATEGORY_LABELS[record.category];
  const subject = `We've received your ${kind} request — ${record.reference}`;
  const lines = journeyLines(record);
  const groupNote = record.journey.groupVehicleRequested
    ? "Group and 7-seater vehicles are subject to vehicle and driver availability."
    : "";
  const text = [
    `Hi ${firstName(record.customer.name)},`,
    "",
    `Thank you — we've received your ${kind.toLowerCase()} request.`,
    "This is a quotation request, not a confirmed booking. We'll check availability and send you a personalised quotation.",
    ...(groupNote ? ["", groupNote] : []),
    "",
    ...linesText(lines),
    "",
    `Reference: ${record.reference}`,
    "",
    CONTACT_TEXT,
    BUSINESS_WEBSITE,
  ].join("\n");
  const html = shell(
    "Request received",
    `<p style="margin:0 0 12px;">Hi ${escapeHtml(firstName(record.customer.name))},</p>
     <p style="margin:0 0 12px;">Thank you — we've received your ${escapeHtml(kind.toLowerCase())} request.</p>
     <p style="margin:0 0 16px;"><strong style="color:#fff;">This is a quotation request, not a confirmed booking.</strong> We'll check availability and send you a personalised quotation.</p>
     ${groupNote ? `<p style="margin:0 0 16px;">${escapeHtml(groupNote)}</p>` : ""}
     ${linesHtml(lines)}
     <p style="margin:16px 0 0;">Reference: <strong style="color:#fff;">${escapeHtml(record.reference)}</strong></p>`,
  );
  return { subject, text, html };
}

// ---------------------------------------------------------------------------
// 2. Owner alert (owner mailbox only)
// ---------------------------------------------------------------------------

export function buildBespokeOwnerNewRequestEmail(record: BespokeQuoteRecord, dashboardUrl = `${BUSINESS_WEBSITE}/owner/`): BespokeEmail {
  const kind = BESPOKE_QUOTE_CATEGORY_LABELS[record.category];
  const j = record.journey;
  const subject = `New ${kind} request — ${record.reference} — ${formatUkDate(j.date)} ${j.time}`;
  const lines: Array<[string, string]> = [
    ...journeyLines(record),
    ["Customer", record.customer.name],
    ["Email", record.customer.email],
    ["Telephone", record.customer.phone],
    ...(j.luggage ? ([["Luggage", j.luggage]] as Array<[string, string]>) : []),
    ...(j.specialRequirements ? ([["Requirements", j.specialRequirements]] as Array<[string, string]>) : []),
    ["Submitted", formatUkInstant(record.createdAt)],
  ];
  // Dashboard link carries NO key — the owner signs in as usual.
  const text = [
    `New ${kind.toLowerCase()} request (manual quotation needed).`,
    "",
    ...linesText(lines),
    "",
    `Reference: ${record.reference}`,
    `Open the Owner Dashboard → More → Event & Business Class: ${dashboardUrl}`,
  ].join("\n");
  const html = shell(
    "New quotation request",
    `<p style="margin:0 0 16px;">New ${escapeHtml(kind.toLowerCase())} request — manual quotation needed.</p>
     ${linesHtml(lines)}
     <p style="margin:16px 0 0;">Reference: <strong style="color:#fff;">${escapeHtml(record.reference)}</strong></p>
     <p style="margin:12px 0 0;">Open the Owner Dashboard → More → Event &amp; Business Class: <a href="${escapeHtml(dashboardUrl)}" style="color:${BRAND_EMERALD};">${escapeHtml(dashboardUrl)}</a></p>`,
  );
  return { subject, text, html };
}

// ---------------------------------------------------------------------------
// 3. Customer quotation
// ---------------------------------------------------------------------------

export function buildBespokeQuotationEmail(record: BespokeQuoteRecord, quoteUrl: string): BespokeEmail {
  if (!record.quote) throw new Error("No quotation on record");
  const amount = gbp(record.quote.amountGbp);
  const expires = formatUkInstant(record.quote.expiresAt);
  const subject = `Your quotation ${amount} — ${record.reference}`;
  const lines = journeyLines(record);
  const message = record.quote.customerMessage;
  const text = [
    `Hi ${firstName(record.customer.name)},`,
    "",
    `Thank you for your request. We can offer this journey for ${amount}.`,
    ...(message ? ["", message] : []),
    "",
    `This quotation is valid until ${expires}.`,
    "Your booking is only confirmed once payment has been completed and we have confirmed it.",
    ...(record.journey.groupVehicleRequested ? ["Group and 7-seater vehicles remain subject to availability until confirmed."] : []),
    "",
    ...linesText(lines),
    "",
    `Reference: ${record.reference}`,
    `View your quotation: ${quoteUrl}`,
    "",
    "Please keep this link private — it is personal to your request.",
    "",
    CONTACT_TEXT,
    BUSINESS_WEBSITE,
  ].join("\n");
  const html = shell(
    "Your quotation",
    `<p style="margin:0 0 12px;">Hi ${escapeHtml(firstName(record.customer.name))},</p>
     <p style="margin:0 0 12px;">Thank you for your request. <strong style="color:#fff;">We can offer this journey for ${escapeHtml(amount)}.</strong></p>
     ${message ? `<p style="margin:0 0 12px;white-space:pre-line;">${escapeHtml(message)}</p>` : ""}
     <p style="margin:0 0 12px;">This quotation is valid until <strong style="color:#fff;">${escapeHtml(expires)}</strong>.</p>
     <p style="margin:0 0 16px;">Your booking is only confirmed once payment has been completed and we have confirmed it.</p>
     ${linesHtml(lines)}
     <p style="margin:16px 0 20px;">Reference: <strong style="color:#fff;">${escapeHtml(record.reference)}</strong></p>
     <p style="margin:0 0 12px;text-align:center;"><a href="${escapeHtml(quoteUrl)}" style="display:inline-block;padding:14px 24px;border-radius:12px;background:${BRAND_EMERALD};color:${BRAND_NAVY};font-weight:bold;text-decoration:none;">View your quotation</a></p>
     <p style="margin:0;font-size:13px;color:#9fb3c8;">Please keep this link private — it is personal to your request.</p>`,
  );
  return { subject, text, html };
}

// ---------------------------------------------------------------------------
// 4. Quotation expired
// ---------------------------------------------------------------------------

export function buildBespokeQuotationExpiredEmail(record: BespokeQuoteRecord): BespokeEmail {
  const subject = `Your quotation has expired — ${record.reference}`;
  const text = [
    `Hi ${firstName(record.customer.name)},`,
    "",
    `Your quotation for ${serviceLine(record)} on ${formatUkDate(record.journey.date)} has now expired, so it can no longer be paid.`,
    "If you would still like to travel, just reply to this email or contact us and we'll check availability again.",
    "",
    `Reference: ${record.reference}`,
    "",
    CONTACT_TEXT,
    BUSINESS_WEBSITE,
  ].join("\n");
  const html = shell(
    "Quotation expired",
    `<p style="margin:0 0 12px;">Hi ${escapeHtml(firstName(record.customer.name))},</p>
     <p style="margin:0 0 12px;">Your quotation for ${escapeHtml(serviceLine(record))} on ${escapeHtml(formatUkDate(record.journey.date))} has now expired, so it can no longer be paid.</p>
     <p style="margin:0 0 12px;">If you would still like to travel, just reply to this email or contact us and we'll check availability again.</p>
     <p style="margin:16px 0 0;">Reference: <strong style="color:#fff;">${escapeHtml(record.reference)}</strong></p>`,
  );
  return { subject, text, html };
}
