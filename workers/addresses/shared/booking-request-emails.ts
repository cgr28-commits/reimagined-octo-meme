/**
 * Branded booking-request emails (customer confirmation + business notification).
 * Uses My Airport Taxi NI navy/emerald branding and Europe/London display times.
 */

import {
  BRAND,
  BUSINESS_NAME,
  BUSINESS_PHONE_DISPLAY,
  BUSINESS_TAGLINE,
  BUSINESS_WEBSITE,
  BUSINESS_WEBSITE_DISPLAY,
  BUSINESS_WHATSAPP_HANDLE,
  LOGO_URL,
} from "./email-config";
import { formatUkCustomerDateTime } from "./uk-time";

export type BookingRequestEmailDetails = {
  customerName: string;
  customerEmail?: string;
  mobileNumber?: string;
  bookingReference?: string;
  tripLabel?: string;
  pickupLabel?: string;
  dropoffLabel?: string;
  airportCode?: string;
  flightNumber?: string;
  returnFlightNumber?: string;
  tripDate?: string;
  tripTime?: string;
  returnJourney?: boolean;
  returnDate?: string;
  returnTime?: string;
  passengers?: number | string;
  suitcases?: number | string;
  vehicle?: string;
  estimatedPrice?: string | null;
  journeyDistance?: string;
  journeyDuration?: string;
  childSeats?: string;
  notes?: string;
  isAirportTrip?: boolean;
  isEnquiry?: boolean;
};

export type BuiltEmail = {
  subject: string;
  text: string;
  html: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function nonEmpty(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).trim();
  return text ? text : null;
}

function detailRows(details: BookingRequestEmailDetails): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  const push = (label: string, value: unknown) => {
    const text = nonEmpty(value);
    if (text) {
      rows.push({ label, value: text });
    }
  };

  push("Booking reference", details.bookingReference);
  push("Customer name", details.customerName);
  push("Email", details.customerEmail);
  push("Mobile", details.mobileNumber);
  push("Journey type", details.tripLabel);
  push("Pickup", details.pickupLabel);
  push("Destination", details.dropoffLabel);
  push("Airport", details.airportCode);

  if (details.tripDate) {
    push(
      details.returnJourney ? "Outbound pickup" : "Pickup date & time",
      formatUkCustomerDateTime(details.tripDate, details.tripTime || ""),
    );
  }

  if (details.returnJourney && details.returnDate) {
    push(
      "Return pickup",
      formatUkCustomerDateTime(details.returnDate, details.returnTime || ""),
    );
  }

  push("Flight number", details.flightNumber);
  push("Return flight number", details.returnFlightNumber);
  push("Passengers", details.passengers);
  push("Suitcases", details.suitcases);
  push("Vehicle", details.vehicle);
  push("Child seats", details.childSeats);

  if (details.journeyDistance || details.journeyDuration) {
    const parts = [details.journeyDistance, details.journeyDuration].filter(Boolean);
    push("Journey", parts.join(" · "));
  }

  push("Quoted / fixed fare", details.estimatedPrice);
  push("Notes / special requirements", details.notes);

  return rows;
}

function rowsHtml(rows: Array<{ label: string; value: string }>): string {
  return rows
    .map(
      (row) =>
        `<tr>
          <td style="padding:10px 0;border-bottom:1px solid #e8edf2;color:${BRAND.muted};font-size:14px;width:38%;vertical-align:top;">${escapeHtml(row.label)}</td>
          <td style="padding:10px 0;border-bottom:1px solid #e8edf2;color:${BRAND.navy};font-size:14px;font-weight:600;vertical-align:top;">${escapeHtml(row.value)}</td>
        </tr>`,
    )
    .join("");
}

function emailFooterHtml(): string {
  return `
    <tr>
      <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:22px 28px;font-size:13px;line-height:1.7;color:${BRAND.muted};">
        <strong style="color:${BRAND.navy};">${escapeHtml(BUSINESS_NAME)}</strong><br />
        Website: <a href="${BUSINESS_WEBSITE}" style="color:${BRAND.navy};text-decoration:none;">${BUSINESS_WEBSITE_DISPLAY}</a><br />
        Business Line: <a href="tel:+442896022952" style="color:${BRAND.navy};text-decoration:none;">${BUSINESS_PHONE_DISPLAY}</a><br />
        WhatsApp: ${escapeHtml(BUSINESS_WHATSAPP_HANDLE)}
      </td>
    </tr>
    <tr>
      <td style="background:${BRAND.navy};padding:16px 28px;text-align:center;font-size:12px;line-height:1.6;color:#a8b7c9;">
        ${escapeHtml(BUSINESS_TAGLINE)}
      </td>
    </tr>`;
}

function emailShell(options: {
  title: string;
  heading: string;
  introHtml: string;
  reference?: string;
  rows: Array<{ label: string; value: string }>;
  highlightRows?: Array<{ label: string; value: string }>;
}): string {
  const referencePanel = options.reference
    ? `<tr>
        <td style="padding:8px 28px 4px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${BRAND.navy};border-radius:10px;">
            <tr>
              <td style="padding:18px 20px;text-align:center;">
                <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${BRAND.emerald};font-weight:bold;margin-bottom:8px;">Booking reference</div>
                <div style="font-size:24px;line-height:1.2;color:${BRAND.white};font-weight:bold;letter-spacing:0.04em;">${escapeHtml(options.reference)}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : "";

  const highlightHtml = options.highlightRows?.length
    ? `<tr>
        <td style="padding:8px 28px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;">
            <tr>
              <td style="padding:16px 18px;">
                <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#15803d;font-weight:bold;margin-bottom:10px;">At a glance</div>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rowsHtml(options.highlightRows)}</table>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(options.title)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.pageBg};font-family:Arial,Helvetica,sans-serif;color:${BRAND.text};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${BRAND.pageBg};padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:${BRAND.cardBg};border-radius:12px;overflow:hidden;box-shadow:0 8px 28px rgba(7,28,56,0.08);">
          <tr>
            <td style="background:${BRAND.navy};padding:26px 28px;text-align:center;">
              <img src="${LOGO_URL}" alt="${escapeHtml(BUSINESS_NAME)}" height="64" style="display:block;margin:0 auto;height:64px;width:auto;max-width:100%;" />
              <div style="margin-top:14px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${BRAND.emerald};font-weight:bold;">${escapeHtml(BUSINESS_NAME)}</div>
              <div style="margin-top:8px;font-size:22px;line-height:1.35;color:${BRAND.white};font-weight:bold;">${escapeHtml(options.heading)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px 8px;font-size:15px;line-height:1.7;color:#334155;">
              ${options.introHtml}
            </td>
          </tr>
          ${referencePanel}
          ${highlightHtml}
          <tr>
            <td style="padding:12px 28px 8px;">
              <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND.emerald};font-weight:bold;margin-bottom:8px;">Booking details</div>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rowsHtml(options.rows)}</table>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 24px;font-size:14px;line-height:1.7;color:#475569;">
              <p style="margin:0;">Questions? Reply to this email or call <a href="tel:+442896022952" style="color:${BRAND.navy};">${BUSINESS_PHONE_DISPLAY}</a>.</p>
            </td>
          </tr>
          ${emailFooterHtml()}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function rowsText(rows: Array<{ label: string; value: string }>): string {
  return rows.map((row) => `${row.label}: ${row.value}`).join("\n");
}

export function buildCustomerBookingRequestEmail(
  details: BookingRequestEmailDetails,
): BuiltEmail {
  const reference = nonEmpty(details.bookingReference) || "";
  const isEnquiry = details.isEnquiry === true || !nonEmpty(details.estimatedPrice);
  const heading = "Booking Request Received";
  const subject = reference
    ? `${heading} — ${reference}`
    : `${heading} — ${BUSINESS_NAME}`;

  const statusLine = isEnquiry
    ? "We have received your enquiry. This is <strong>not</strong> a confirmed booking yet — our team will review the details and confirm the fare and availability by email."
    : "We have received your booking request. This is <strong>not</strong> a confirmed booking yet — once we confirm the job we will email a SumUp payment link. Your journey is confirmed after payment.";

  const rows = detailRows(details);
  const introHtml = `<p style="margin:0 0 12px;">Hi ${escapeHtml(details.customerName || "there")},</p>
    <p style="margin:0 0 12px;">Thank you for choosing ${escapeHtml(BUSINESS_NAME)}.</p>
    <p style="margin:0;">${statusLine}</p>`;

  const text =
    `Hi ${details.customerName || "there"},\n\n` +
    `Thank you for choosing ${BUSINESS_NAME}.\n\n` +
    (isEnquiry
      ? "We have received your enquiry. This is NOT a confirmed booking yet — our team will review the details and confirm the fare and availability by email.\n\n"
      : "We have received your booking request. This is NOT a confirmed booking yet — once we confirm the job we will email a SumUp payment link. Your journey is confirmed after payment.\n\n") +
    (reference ? `Booking reference: ${reference}\n\n` : "") +
    `BOOKING DETAILS\n${"=".repeat(40)}\n` +
    `${rowsText(rows)}\n\n` +
    `${BUSINESS_NAME}\n` +
    `Website: ${BUSINESS_WEBSITE_DISPLAY}\n` +
    `Business Line: ${BUSINESS_PHONE_DISPLAY}\n` +
    `WhatsApp: ${BUSINESS_WHATSAPP_HANDLE}\n` +
    `${BUSINESS_TAGLINE}\n`;

  const html = emailShell({
    title: subject,
    heading,
    introHtml,
    reference: reference || undefined,
    rows,
  });

  return { subject, text, html };
}

export function buildBusinessBookingNotificationEmail(
  details: BookingRequestEmailDetails,
): BuiltEmail {
  const reference = nonEmpty(details.bookingReference) || "";
  const heading = "New Booking Request";
  const subject = reference
    ? `${heading} — ${reference} — ${details.customerName || "Customer"}`
    : `${heading} — ${details.customerName || "Customer"}`;

  const highlightRows: Array<{ label: string; value: string }> = [];
  const pushHighlight = (label: string, value: unknown) => {
    const text = nonEmpty(value);
    if (text) {
      highlightRows.push({ label, value: text });
    }
  };

  pushHighlight("Reference", reference);
  if (details.tripDate) {
    pushHighlight(
      "Pickup",
      formatUkCustomerDateTime(details.tripDate, details.tripTime || ""),
    );
  }
  pushHighlight("From", details.pickupLabel);
  pushHighlight("To", details.dropoffLabel);
  pushHighlight("Fare", details.estimatedPrice);
  pushHighlight("Customer", details.customerName);
  pushHighlight("Mobile", details.mobileNumber);
  pushHighlight("Flight", details.flightNumber);

  const rows = detailRows(details);
  const introHtml = `<p style="margin:0;">A new booking request was submitted on the website. Reply to this email to contact the customer directly.</p>`;

  const text =
    `${heading}\n\n` +
    `AT A GLANCE\n${"=".repeat(40)}\n` +
    `${rowsText(highlightRows)}\n\n` +
    `FULL DETAILS\n${"=".repeat(40)}\n` +
    `${rowsText(rows)}\n`;

  const html = emailShell({
    title: subject,
    heading,
    introHtml,
    reference: reference || undefined,
    highlightRows,
    rows,
  });

  return { subject, text, html };
}
