/**
 * Customer email after Owner approves an Address-to-Address personalised quote.
 * Simple approval when journey matches the original request; counter-offer email
 * when Owner amended pickup / destination / date / time / return / pax / luggage.
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
  passengers?: number;
  suitcases?: number;
  amountLabel: string;
  reference: string;
  payUrl: string;
  validityMinutes: number;
  /** When true, email is framed as a counter-offer vs the original request. */
  isCounterOffer?: boolean;
  originalPickupLabel?: string;
  originalDropoffLabel?: string;
  originalTripDate?: string;
  originalTripTime?: string;
  originalReturnJourney?: boolean;
  originalReturnDate?: string;
  originalReturnTime?: string;
  originalPassengers?: number;
  originalSuitcases?: number;
};

function journeyLines(options: {
  pickupLabel: string;
  dropoffLabel: string;
  tripDate: string;
  tripTime: string;
  returnJourney?: boolean;
  returnDate?: string;
  returnTime?: string;
  passengers?: number;
  suitcases?: number;
  includePrice?: string;
}): string[] {
  const lines = [
    `Pickup: ${options.pickupLabel}`,
    `Destination: ${options.dropoffLabel}`,
    `Date: ${options.tripDate}`,
    `Time: ${options.tripTime}`,
  ];
  if (
    options.returnJourney &&
    (String(options.returnDate ?? "").trim() || String(options.returnTime ?? "").trim())
  ) {
    lines.push(
      `Return: ${[options.returnDate, options.returnTime].filter(Boolean).join(" · ")}`,
    );
  }
  if (typeof options.passengers === "number") {
    lines.push(`Passengers: ${options.passengers}`);
  }
  if (typeof options.suitcases === "number") {
    lines.push(`Luggage: ${options.suitcases}`);
  }
  if (options.includePrice) {
    lines.push(`Fixed price: ${options.includePrice}`);
  }
  return lines;
}

function journeyBlockHtml(options: {
  pickupLabel: string;
  dropoffLabel: string;
  tripDate: string;
  tripTime: string;
  returnJourney?: boolean;
  returnDate?: string;
  returnTime?: string;
  passengers?: number;
  suitcases?: number;
  includePrice?: string;
}): string {
  const rows: Array<[string, string]> = [
    ["Pickup", options.pickupLabel],
    ["Destination", options.dropoffLabel],
    ["Date", options.tripDate],
    ["Time", options.tripTime],
  ];
  if (
    options.returnJourney &&
    (String(options.returnDate ?? "").trim() || String(options.returnTime ?? "").trim())
  ) {
    rows.push([
      "Return",
      [options.returnDate, options.returnTime].filter(Boolean).join(" · "),
    ]);
  }
  if (typeof options.passengers === "number") {
    rows.push(["Passengers", String(options.passengers)]);
  }
  if (typeof options.suitcases === "number") {
    rows.push(["Luggage", String(options.suitcases)]);
  }
  if (options.includePrice) {
    rows.push(["Fixed price", options.includePrice]);
  }
  return rows
    .map(
      ([label, value], index) =>
        `<p style="margin:0 0 4px;font-size:13px;color:#9fb0c0;">${escapeHtml(label)}</p>
          <p style="margin:0 0 ${index === rows.length - 1 ? "0" : "12"}px;color:#fff;">${escapeHtml(value)}</p>`,
    )
    .join("\n          ");
}

export function buildA2aQuotePaymentLinkEmail(details: A2aQuotePaymentLinkEmailDetails): {
  subject: string;
  text: string;
  html: string;
} {
  const first = customerFirstName(details.customerName);
  const validity = formatA2aQuoteValidityLabel(details.validityMinutes);
  const isCounterOffer = Boolean(details.isCounterOffer);
  const ctaLabel = isCounterOffer ? "Accept Changes & Pay Securely" : "Pay Securely";
  const subject = isCounterOffer
    ? `Alternative journey offer ${details.amountLabel} — valid for ${validity}`
    : `Your personalised quote ${details.amountLabel} — valid for ${validity}`;

  const offered = {
    pickupLabel: details.pickupLabel,
    dropoffLabel: details.dropoffLabel,
    tripDate: details.tripDate,
    tripTime: details.tripTime,
    returnJourney: details.returnJourney,
    returnDate: details.returnDate,
    returnTime: details.returnTime,
    passengers: details.passengers,
    suitcases: details.suitcases,
  };

  const original = {
    pickupLabel: details.originalPickupLabel || details.pickupLabel,
    dropoffLabel: details.originalDropoffLabel || details.dropoffLabel,
    tripDate: details.originalTripDate || details.tripDate,
    tripTime: details.originalTripTime || details.tripTime,
    returnJourney: details.originalReturnJourney ?? details.returnJourney,
    returnDate: details.originalReturnDate || details.returnDate,
    returnTime: details.originalReturnTime || details.returnTime,
    passengers: details.originalPassengers ?? details.passengers,
    suitcases: details.originalSuitcases ?? details.suitcases,
  };

  const textLines = [`Hi ${first},`, ""];
  if (isCounterOffer) {
    textLines.push(
      "Unfortunately, we’re unable to offer your journey exactly as originally requested. However, we can offer the alternative shown below. Please review the updated journey details carefully before making payment.",
      "",
      "Your original request",
      ...journeyLines(original),
      "",
      "What we can offer",
      ...journeyLines({ ...offered, includePrice: details.amountLabel }),
      "",
      `This offer is valid for ${validity}.`,
      "Your booking is only confirmed once payment has been completed.",
      "Payment accepts these amended journey details.",
    );
  } else {
    textLines.push(
      `Your requested journey has been approved at ${details.amountLabel}.`,
      "",
      `This quote is valid for ${validity}.`,
      "",
      "Your booking is only confirmed once payment has been completed.",
      "Availability may change if payment is not made within this time.",
      "",
      ...journeyLines(offered),
    );
  }
  textLines.push(
    "",
    `Reference: ${details.reference}`,
    "",
    `${ctaLabel}: ${details.payUrl}`,
    "",
    "Secure card payment powered by SumUp.",
    "",
    `My Airport Taxi NI · ${BUSINESS_PHONE_DISPLAY} · ${BUSINESS_EMAIL}`,
    BUSINESS_WEBSITE,
  );
  const text = textLines.join("\n");

  const bodyHtml = isCounterOffer
    ? `<p style="margin:0 0 12px;">Hi ${escapeHtml(first)},</p>
          <p style="margin:0 0 16px;">Unfortunately, we’re unable to offer your journey exactly as originally requested. However, we can offer the alternative shown below. Please review the updated journey details carefully before making payment.</p>
          <p style="margin:0 0 8px;font-size:13px;letter-spacing:0.06em;text-transform:uppercase;color:${ACCENT};">Your original request</p>
          <div style="margin:0 0 20px;padding:14px 16px;border-radius:12px;background:rgba(255,255,255,0.06);">
            ${journeyBlockHtml(original)}
          </div>
          <p style="margin:0 0 8px;font-size:13px;letter-spacing:0.06em;text-transform:uppercase;color:${ACCENT};">What we can offer</p>
          <div style="margin:0 0 16px;padding:14px 16px;border-radius:12px;background:rgba(46,204,113,0.12);border:1px solid rgba(46,204,113,0.35);">
            ${journeyBlockHtml({ ...offered, includePrice: details.amountLabel })}
          </div>
          <p style="margin:0 0 12px;">This offer is valid for <strong style="color:#fff;">${escapeHtml(validity)}</strong>.</p>
          <p style="margin:0 0 20px;">Your booking is only confirmed once payment has been completed. Payment accepts these amended journey details.</p>`
    : `<p style="margin:0 0 12px;">Hi ${escapeHtml(first)},</p>
          <p style="margin:0 0 12px;"><strong style="color:#fff;">Your requested journey has been approved at ${escapeHtml(details.amountLabel)}.</strong></p>
          <p style="margin:0 0 12px;">This quote is valid for <strong style="color:#fff;">${escapeHtml(validity)}</strong>.</p>
          <p style="margin:0 0 12px;">Your booking is only confirmed once payment has been completed.</p>
          <p style="margin:0 0 20px;">Availability may change if payment is not made within this time.</p>
          ${journeyBlockHtml(offered)}
          <div style="height:20px;"></div>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0b1f33;font-family:Arial,Helvetica,sans-serif;color:#ffffff;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0b1f33;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:${NAVY};border-radius:16px;overflow:hidden;">
        <tr><td style="padding:28px 28px 12px;text-align:center;">
          <img src="${LOGO_URL}" alt="My Airport Taxi NI" width="120" style="display:block;margin:0 auto 16px;"/>
          <p style="margin:0;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:${ACCENT};">${
            isCounterOffer ? "Alternative Journey Offer" : "Personalised Quote"
          }</p>
          <h1 style="margin:8px 0 0;font-size:26px;line-height:1.25;color:#fff;">${escapeHtml(details.amountLabel)}</h1>
        </td></tr>
        <tr><td style="padding:8px 28px 24px;color:#d7e2ec;font-size:15px;line-height:1.55;">
          ${bodyHtml}
          <p style="margin:0 0 24px;text-align:center;">
            <a href="${escapeHtml(details.payUrl)}" style="display:inline-block;background:${ACCENT};color:${NAVY};text-decoration:none;font-weight:700;padding:14px 28px;border-radius:999px;font-size:16px;">${escapeHtml(ctaLabel)}</a>
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
