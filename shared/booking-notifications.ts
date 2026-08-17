import { formatMarketingOptInLine } from "./marketing";
import {
  BRAND_EMERALD,
  BRAND_NAVY,
  BUSINESS_MAILBOX,
  BUSINESS_PHONE_DISPLAY,
  BUSINESS_PHONE_TEL,
  BUSINESS_WEBSITE as CANONICAL_BUSINESS_WEBSITE,
} from "./business-email";
import { contactVCardPublicUrl } from "./business-links";
import { formatUkDate, formatUkTime, UK_LOCAL_TIME_LABEL } from "./uk-time";
import {
  formatEmailFareIncludesBlock,
  formatEmailFareIncludesHtml,
  resolveJourneyInclusions,
} from "./journey-inclusions";

export type PaidBookingDetails = {
  customerName: string;
  customerEmail: string;
  mobileNumber: string;
  tripLabel: string;
  pickupLabel: string;
  dropoffLabel: string;
  returnJourney: boolean;
  tripDate: string;
  tripTime: string;
  returnDate: string;
  returnTime: string;
  flightNumber: string;
  returnFlightNumber?: string;
  passengers: number;
  suitcases: number;
  vehicle: string;
  journeyDistance?: string;
  journeyDuration?: string;
  isAirportTrip: boolean;
  airportCode?: string;
  isFromAirport?: boolean;
  termsAcceptedAt?: string;
  termsVersion?: string;
  marketingOptIn?: boolean;
  marketingOptInAt?: string;
  marketingConsentVersion?: string;
};

export type PaidBookingReceipt = PaidBookingDetails & {
  amountPaid: string;
  paymentReference: string;
  transactionCode?: string;
  checkoutReference?: string;
};

export type CustomerPaidBookingEmail = {
  subject: string;
  text: string;
  html: string;
};

const BUSINESS_WEBSITE = CANONICAL_BUSINESS_WEBSITE;
const BUSINESS_EMAIL = BUSINESS_MAILBOX;
/** Official logo already hosted on the live site (same asset as Google Business). */
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


function formatDisplayDateDmy(date: string): string {
  return formatUkDate(date);
}

function formatDisplayTime(time: string): string {
  return formatUkTime(time);
}

function formatTripScheduleLines(details: PaidBookingDetails): string[] {
  const lines = [
    `Trip: ${details.tripLabel}`,
    `Pickup: ${details.pickupLabel}`,
    `Drop-off: ${details.dropoffLabel}`,
    `Return journey: ${details.returnJourney ? "Yes" : "No"}`,
    `${details.returnJourney ? "Outbound date" : "Date"}: ${formatDisplayDateDmy(details.tripDate)}`,
    `${details.returnJourney ? "Outbound time" : "Time"}: ${formatDisplayTime(details.tripTime)} (${UK_LOCAL_TIME_LABEL})`,
  ];

  if (details.returnJourney) {
    lines.push(
      `Return date: ${formatDisplayDateDmy(details.returnDate)}`,
      `Return time: ${formatDisplayTime(details.returnTime)} (${UK_LOCAL_TIME_LABEL})`,
    );
  }

  if (details.isAirportTrip && details.flightNumber) {
    lines.push(`Flight number for going: ${details.flightNumber}`);
  }

  if (details.isAirportTrip && details.returnFlightNumber) {
    lines.push(`Flight number for collection: ${details.returnFlightNumber}`);
  }

  lines.push(
    `Passengers: ${details.passengers}`,
    `Suitcases: ${details.suitcases}`,
    `Vehicle: ${details.vehicle}`,
  );

  if (details.journeyDistance && details.journeyDuration) {
    lines.push(`Journey: ${details.journeyDistance} · ${details.journeyDuration}`);
  }

  return lines;
}

function formatTripSchedule(details: PaidBookingDetails): string {
  return formatTripScheduleLines(details).join("\n");
}

function invoiceRows(details: PaidBookingReceipt): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [
    { label: "Customer", value: details.customerName },
    { label: "Email", value: details.customerEmail },
    { label: "Mobile", value: details.mobileNumber || "Not provided" },
    { label: "Trip", value: details.tripLabel },
    { label: "Pickup", value: details.pickupLabel },
    { label: "Drop-off", value: details.dropoffLabel },
    {
      label: details.returnJourney ? "Outbound date" : "Date",
      value: formatDisplayDateDmy(details.tripDate),
    },
    {
      label: details.returnJourney ? "Outbound time" : "Time",
      value: `${formatDisplayTime(details.tripTime)} (${UK_LOCAL_TIME_LABEL})`,
    },
  ];

  if (details.returnJourney) {
    rows.push({ label: "Return date", value: formatDisplayDateDmy(details.returnDate) });
    rows.push({
      label: "Return time",
      value: `${formatDisplayTime(details.returnTime)} (${UK_LOCAL_TIME_LABEL})`,
    });
  }

  if (details.isAirportTrip && details.flightNumber) {
    rows.push({ label: "Flight for going", value: details.flightNumber });
  }

  if (details.isAirportTrip && details.returnFlightNumber) {
    rows.push({ label: "Flight for collection", value: details.returnFlightNumber });
  }

  rows.push(
    { label: "Passengers", value: String(details.passengers) },
    { label: "Suitcases", value: String(details.suitcases) },
    { label: "Vehicle", value: details.vehicle },
  );

  if (details.journeyDistance && details.journeyDuration) {
    rows.push({
      label: "Journey",
      value: `${details.journeyDistance} · ${details.journeyDuration}`,
    });
  }

  if (details.checkoutReference) {
    rows.push({ label: "Booking reference", value: details.checkoutReference });
  }

  return rows;
}

function brandFooterHtml(businessName: string): string {
  return `<tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 32px;font-size:13px;line-height:1.7;color:#64748b;">
              <strong style="color:${NAVY};">${escapeHtml(businessName)}</strong><br />
              <a href="${BUSINESS_WEBSITE}" style="color:${NAVY};">${BUSINESS_WEBSITE.replace("https://", "")}</a> ·
              <a href="tel:${BUSINESS_PHONE_TEL}" style="color:${NAVY};">${BUSINESS_PHONE_DISPLAY}</a> ·
              <a href="mailto:${BUSINESS_EMAIL}" style="color:${NAVY};">${BUSINESS_EMAIL}</a><br />
              <a href="${BUSINESS_WEBSITE}/terms/" style="color:${NAVY};">Terms &amp; Conditions</a> ·
              <a href="${BUSINESS_WEBSITE}/privacy/" style="color:${NAVY};">Privacy Policy</a>
            </td>
          </tr>
          <tr>
            <td style="background:${NAVY};padding:16px 32px;text-align:center;font-size:12px;line-height:1.6;color:#94a3b8;">
              Premium airport transfers across Northern Ireland · Belfast · Dublin · Derry
            </td>
          </tr>`;
}

function buildInvoiceHtml(
  details: PaidBookingReceipt,
  businessName: string,
  trackUrl?: string,
): string {
  const invoiceNumber = escapeHtml(details.paymentReference);
  const customerName = escapeHtml(details.customerName);
  const rowsHtml = invoiceRows(details)
    .map(
      (row) =>
        `<tr><td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:14px;width:38%;vertical-align:top;">${escapeHtml(row.label)}</td><td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:${NAVY};font-size:14px;font-weight:600;vertical-align:top;">${escapeHtml(row.value)}</td></tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Invoice — ${escapeHtml(businessName)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1a2b3c;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:${NAVY};padding:28px 32px;text-align:center;">
              <img src="${LOGO_URL}" alt="${escapeHtml(businessName)}" height="72" style="display:block;margin:0 auto;height:72px;width:auto;max-width:100%;" />
              <div style="margin-top:16px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${ACCENT};font-weight:bold;">Invoice &amp; booking confirmation</div>
              <div style="margin-top:8px;font-size:22px;line-height:1.35;color:#ffffff;font-weight:bold;">Thank you, ${customerName}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 8px;font-size:15px;line-height:1.7;color:#334155;">
              <p style="margin:0 0 16px;">Your card payment has been received and your airport transfer with <strong style="color:${NAVY};">${escapeHtml(businessName)}</strong> is confirmed. Please keep this invoice for your records.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 8px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-left:4px solid ${ACCENT};border-radius:10px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <div style="font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:${ACCENT};font-weight:bold;margin-bottom:12px;">Payment summary</div>
                    <div style="font-size:28px;font-weight:bold;color:${NAVY};line-height:1.2;margin-bottom:12px;">${escapeHtml(details.amountPaid)}</div>
                    <div style="display:inline-block;background:${ACCENT};color:${NAVY};font-size:12px;font-weight:bold;letter-spacing:0.06em;text-transform:uppercase;padding:6px 12px;border-radius:999px;margin-bottom:12px;">Paid in full</div>
                    <div style="font-size:14px;line-height:1.8;color:#475569;">
                      <strong>Invoice / payment reference:</strong> ${invoiceNumber}<br />
                      ${details.checkoutReference ? `<strong>Booking reference:</strong> ${escapeHtml(details.checkoutReference)}<br />` : ""}
                      <strong>Payment method:</strong> Card (SumUp)<br />
                      ${details.transactionCode ? `<strong>Transaction code:</strong> ${escapeHtml(details.transactionCode)}<br />` : ""}
                      <strong>Status:</strong> Paid &amp; confirmed
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 8px;">
              <div style="font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:${ACCENT};font-weight:bold;margin-bottom:12px;">Booking details</div>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rowsHtml}</table>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 8px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
                <tr>
                  <td style="padding:16px 20px;">
                    ${formatEmailFareIncludesHtml(
                      resolveJourneyInclusions({
                        isAirportTrip: details.isAirportTrip,
                        isFromAirport: Boolean(details.isFromAirport),
                        returnJourney: details.returnJourney,
                        airportCode: details.airportCode,
                        addressToAddress: !details.isAirportTrip,
                      }),
                      details.amountPaid,
                    )}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ${
            trackUrl
              ? `<tr>
            <td style="padding:8px 32px 8px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <div style="font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:#15803d;font-weight:bold;margin-bottom:12px;">Live driver tracking</div>
                    <div style="font-size:14px;line-height:1.8;color:#475569;">
                      On the day of travel, your driver can share their live location around pickup time.
                      Save this link — it activates about 1 hour before your scheduled pickup.
                    </div>
                    <div style="margin-top:12px;">
                      <a href="${escapeHtml(trackUrl)}" style="display:inline-block;background:${NAVY};color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;padding:12px 20px;border-radius:8px;">Track Your Driver</a>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`
              : ""
          }
          <tr>
            <td style="padding:8px 32px 8px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <div style="font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:${ACCENT};font-weight:bold;margin-bottom:12px;">Save us for your next journey</div>
                    <div style="font-size:14px;line-height:1.8;color:#475569;">
                      Keep ${escapeHtml(businessName)} in your contacts so we&apos;re easy to find whenever you need another airport transfer.
                    </div>
                    <div style="margin-top:12px;">
                      <a href="${escapeHtml(contactVCardPublicUrl())}" style="display:inline-block;background:${NAVY};color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;padding:12px 20px;border-radius:8px;">Save My Airport Taxi NI to Contacts</a>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 8px;">
              <div style="font-size:13px;line-height:1.7;color:#64748b;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px 20px;">
                <strong style="color:#92400e;">Cancellation policy:</strong>
                With at least 24 hours’ notice we issue a full refund of the fare paid. Bookings cancelled within 24 hours of pickup are non-refundable.
                See our <a href="${BUSINESS_WEBSITE}/terms/" style="color:${NAVY};">Terms &amp; Conditions</a> for full details.
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 28px;font-size:14px;line-height:1.7;color:#475569;">
              <p style="margin:0 0 12px;">We will contact you if we need any further information before your journey.</p>
              <p style="margin:0;">Questions? Reply to this email, call <a href="tel:${BUSINESS_PHONE_TEL}" style="color:${NAVY};">${BUSINESS_PHONE_DISPLAY}</a>, or email <a href="mailto:${BUSINESS_EMAIL}" style="color:${NAVY};">${BUSINESS_EMAIL}</a>.</p>
            </td>
          </tr>
          ${brandFooterHtml(businessName)}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildCustomerConfirmationEmail(
  details: PaidBookingReceipt,
  businessName = "My Airport Taxi NI",
  options?: { trackUrl?: string },
): CustomerPaidBookingEmail {
  const trackUrl = options?.trackUrl?.trim();
  const subject = `Invoice & booking confirmed — ${businessName}`;

  const text =
    `Dear ${details.customerName},\n\n` +
    `Thank you for your booking with ${businessName}. Your card payment has been received and your transfer is confirmed.\n\n` +
    `${BUSINESS_WEBSITE}\n` +
    `Phone: ${BUSINESS_PHONE_DISPLAY}\n` +
    `Email: ${BUSINESS_EMAIL}\n\n` +
    `Please find your invoice details below.\n\n` +
    `BOOKING DETAILS\n` +
    `${"=".repeat(40)}\n` +
    `Customer: ${details.customerName}\n` +
    `Email: ${details.customerEmail}\n` +
    `Mobile: ${details.mobileNumber || "Not provided"}\n` +
    `${formatTripSchedule(details)}\n` +
    (details.checkoutReference ? `Booking reference: ${details.checkoutReference}\n` : "") +
    `\n` +
    `${formatEmailFareIncludesBlock(
      resolveJourneyInclusions({
        isAirportTrip: details.isAirportTrip,
        isFromAirport: Boolean(details.isFromAirport),
        returnJourney: details.returnJourney,
        airportCode: details.airportCode,
        addressToAddress: !details.isAirportTrip,
      }),
      details.amountPaid,
    )}\n\n` +
    `PAYMENT / INVOICE\n` +
    `${"=".repeat(40)}\n` +
    `Amount paid: ${details.amountPaid}\n` +
    `Invoice / payment reference: ${details.paymentReference}\n` +
    (details.transactionCode ? `Transaction code: ${details.transactionCode}\n` : "") +
    `Payment method: Card (SumUp)\n` +
    `Status: Paid & confirmed\n` +
    (trackUrl
      ? `\nLIVE DRIVER TRACKING\n${"=".repeat(40)}\n` +
        `On the day of travel, your driver can share their live location around pickup time.\n` +
        `Save this link — it activates about 1 hour before your scheduled pickup:\n` +
        `${trackUrl}\n`
      : "") +
    `\nSAVE US FOR YOUR NEXT JOURNEY\n${"=".repeat(40)}\n` +
    `Keep ${businessName} in your contacts so we're easy to find whenever you need another airport transfer.\n` +
    `Save My Airport Taxi NI to Contacts:\n${contactVCardPublicUrl()}\n` +
    `\nWe will contact you if we need any further information before your journey.\n\n` +
    `If you have questions, reply to this email, call ${BUSINESS_PHONE_DISPLAY}, or contact us at ${BUSINESS_EMAIL}.\n\n` +
    `${businessName}\n` +
    `${BUSINESS_WEBSITE}`;

  const html = buildInvoiceHtml(details, businessName, trackUrl);

  return { subject, text, html };
}

export function buildOwnerPaidBookingEmail(
  details: PaidBookingReceipt,
  businessName = "My Airport Taxi NI",
  options?: { trackUrl?: string },
): { subject: string; body: string } {
  const trackUrl = options?.trackUrl?.trim();
  const subject = `Paid booking — ${details.customerName} — ${details.amountPaid}`;

  const body =
    `New paid booking via ${businessName} website.\n\n` +
    `CUSTOMER\n` +
    `${"=".repeat(40)}\n` +
    `Name: ${details.customerName}\n` +
    `Email: ${details.customerEmail}\n` +
    `Mobile: ${details.mobileNumber || "Not provided"}\n\n` +
    `TRIP\n` +
    `${"=".repeat(40)}\n` +
    `${formatTripSchedule(details)}\n\n` +
    `PAYMENT\n` +
    `${"=".repeat(40)}\n` +
    `Amount paid: ${details.amountPaid}\n` +
    `Payment reference: ${details.paymentReference}\n` +
    (details.transactionCode ? `Transaction code: ${details.transactionCode}\n` : "") +
    (details.checkoutReference ? `Checkout reference: ${details.checkoutReference}\n` : "") +
    `Status: PAID (verified via SumUp)` +
    (details.termsAcceptedAt
      ? `\nTerms accepted: ${details.termsAcceptedAt}${details.termsVersion ? ` (${details.termsVersion})` : ""}`
      : "") +
    (() => {
      const marketingLine = formatMarketingOptInLine(details);
      return marketingLine ? `\n${marketingLine}` : "";
    })() +
    (trackUrl ? `\n\nDRIVER TRACK LINK\n${"=".repeat(40)}\n${trackUrl}` : "");

  return { subject, body };
}

/** Sent as soon as the customer opens SumUp — even if payment later fails or is abandoned. */
export function buildOwnerPaymentAttemptEmail(
  details: PaidBookingDetails,
  options: {
    amountLabel: string;
    checkoutId: string;
    checkoutReference?: string;
  },
  businessName = "My Airport Taxi NI",
): { subject: string; body: string } {
  const subject = `Customer details captured — payment started — ${options.amountLabel}`;

  const body =
    `A customer entered their details and started online card payment on the ${businessName} website.\n` +
    `Payment is NOT confirmed yet — contact details below are from the booking form (stored server-side before SumUp).\n\n` +
    `CUSTOMER\n` +
    `${"=".repeat(40)}\n` +
    `Name: ${details.customerName}\n` +
    `Email: ${details.customerEmail}\n` +
    `Mobile: ${details.mobileNumber || "Not provided"}\n\n` +
    `TRIP\n` +
    `${"=".repeat(40)}\n` +
    `${formatTripSchedule(details)}\n\n` +
    `PAYMENT\n` +
    `${"=".repeat(40)}\n` +
    `Quoted fare: ${options.amountLabel}\n` +
    `Checkout id: ${options.checkoutId}\n` +
    (options.checkoutReference ? `Checkout / booking reference: ${options.checkoutReference}\n` : "") +
    `Status: PAYMENT STARTED — NOT YET PAID\n` +
    (details.termsAcceptedAt
      ? `Terms accepted: ${details.termsAcceptedAt}${details.termsVersion ? ` (${details.termsVersion})` : ""}\n`
      : "") +
    `\nYou will get a separate “Paid booking” email if SumUp confirms payment.`;

  return { subject, body };
}

/** Sent when SumUp reports the checkout did not complete successfully. */
export function buildOwnerPaymentUnsuccessfulEmail(
  details: PaidBookingDetails,
  options: {
    amountLabel: string;
    checkoutId: string;
    checkoutReference?: string;
    sumUpStatus?: string;
  },
  businessName = "My Airport Taxi NI",
): { subject: string; body: string } {
  const status = options.sumUpStatus?.trim() || "UNSUCCESSFUL";
  const subject = `SumUp payment unsuccessful — ${details.customerName} — ${options.amountLabel}`;

  const body =
    `A customer’s SumUp payment did not complete on the ${businessName} website.\n` +
    `No card payment was taken. Contact details are below so you can follow up.\n\n` +
    `CUSTOMER\n` +
    `${"=".repeat(40)}\n` +
    `Name: ${details.customerName}\n` +
    `Email: ${details.customerEmail}\n` +
    `Mobile: ${details.mobileNumber || "Not provided"}\n\n` +
    `TRIP\n` +
    `${"=".repeat(40)}\n` +
    `${formatTripSchedule(details)}\n\n` +
    `PAYMENT\n` +
    `${"=".repeat(40)}\n` +
    `Quoted amount: ${options.amountLabel}\n` +
    `Checkout id: ${options.checkoutId}\n` +
    (options.checkoutReference ? `Checkout reference: ${options.checkoutReference}\n` : "") +
    `Status: ${status} (not paid)\n`;

  return { subject, body };
}

export function formatPaidAmount(amount: number, currency = "GBP"): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount);
}

export type TrackingReminderDetails = {
  customerName: string;
  pickupLabel: string;
  dropoffLabel: string;
  tripDate: string;
  tripTime: string;
  /** Invoice / payment / checkout reference shown to the customer */
  bookingReference?: string;
};

function formatTripDateTime(tripDate: string, tripTime: string): string {
  if (!tripDate || !tripTime) {
    return "";
  }

  const date = formatDisplayDateDmy(tripDate);
  const time = formatDisplayTime(tripTime);
  return date ? `${date} at ${time} (${UK_LOCAL_TIME_LABEL})` : "";
}

function buildTrackingReminderHtml(
  details: TrackingReminderDetails,
  trackUrl: string,
  businessName: string,
): string {
  const customerName = escapeHtml(details.customerName);
  const pickup = escapeHtml(details.pickupLabel);
  const dropoff = escapeHtml(details.dropoffLabel);
  const when = escapeHtml(formatTripDateTime(details.tripDate, details.tripTime));
  const bookingReference = details.bookingReference?.trim()
    ? escapeHtml(details.bookingReference.trim())
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Live tracking — ${escapeHtml(businessName)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1a2b3c;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:${NAVY};padding:28px 32px;text-align:center;">
              <img src="${LOGO_URL}" alt="${escapeHtml(businessName)}" height="72" style="display:block;margin:0 auto;height:72px;width:auto;max-width:100%;" />
              <div style="margin-top:16px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${ACCENT};font-weight:bold;">${escapeHtml(businessName)}</div>
              <div style="margin-top:8px;font-size:22px;line-height:1.35;color:#ffffff;font-weight:bold;">Your driver tracking is now available</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 8px;font-size:15px;line-height:1.7;color:#334155;">
              <p style="margin:0 0 16px;">Hi ${customerName}, live driver tracking for your transfer is now available. Use the secure link below to open your tracking page.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 8px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
                <tr>
                  <td style="padding:20px 24px;font-size:14px;line-height:1.8;color:#475569;">
                    ${when ? `<strong>Pickup time:</strong> ${when}<br />` : ""}
                    ${bookingReference ? `<strong>Booking reference:</strong> ${bookingReference}<br />` : ""}
                    <strong>Pickup:</strong> ${pickup}<br />
                    <strong>Drop-off:</strong> ${dropoff}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 28px;text-align:center;">
              <a href="${escapeHtml(trackUrl)}" style="display:inline-block;background:${NAVY};color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;padding:14px 28px;border-radius:8px;">Track Your Driver</a>
              <p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#64748b;">Or copy this link:<br /><a href="${escapeHtml(trackUrl)}" style="color:${NAVY};word-break:break-all;">${escapeHtml(trackUrl)}</a></p>
            </td>
          </tr>
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 32px;font-size:13px;line-height:1.7;color:#64748b;">
              <strong style="color:${NAVY};">${escapeHtml(businessName)}</strong><br />
              Questions? <a href="mailto:${BUSINESS_EMAIL}" style="color:${NAVY};">${BUSINESS_EMAIL}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildTrackingReminderEmail(
  details: TrackingReminderDetails,
  trackUrl: string,
  businessName = "My Airport Taxi NI",
): CustomerPaidBookingEmail {
  const when = formatTripDateTime(details.tripDate, details.tripTime);
  const subject = `Your driver tracking is now available | ${businessName}`;
  const bookingReference = details.bookingReference?.trim();

  const text =
    `Hi ${details.customerName},\n\n` +
    `Live driver tracking for your transfer is now available.\n\n` +
    (when ? `Pickup time: ${when}\n` : "") +
    (bookingReference ? `Booking reference: ${bookingReference}\n` : "") +
    `Pickup: ${details.pickupLabel}\n` +
    `Drop-off: ${details.dropoffLabel}\n\n` +
    `Track Your Driver:\n${trackUrl}\n\n` +
    `${businessName}\n${BUSINESS_WEBSITE}`;

  const html = buildTrackingReminderHtml(details, trackUrl, businessName);

  return { subject, text, html };
}

export type RefundConfirmationDetails = {
  customerName: string;
  paymentReference: string;
  refundAmount: string;
  tripLabel: string;
  pickupLabel: string;
  dropoffLabel: string;
  tripDate: string;
  tripTime: string;
};

function buildRefundConfirmationHtml(
  details: RefundConfirmationDetails,
  businessName: string,
): string {
  const customerName = escapeHtml(details.customerName);
  const when = escapeHtml(formatTripDateTime(details.tripDate, details.tripTime));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Refund confirmation — ${escapeHtml(businessName)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1a2b3c;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:${NAVY};padding:28px 32px;text-align:center;">
              <img src="${LOGO_URL}" alt="${escapeHtml(businessName)}" height="72" style="display:block;margin:0 auto;height:72px;width:auto;max-width:100%;" />
              <div style="margin-top:16px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${ACCENT};font-weight:bold;">Refund confirmation</div>
              <div style="margin-top:8px;font-size:22px;line-height:1.35;color:#ffffff;font-weight:bold;">Your refund is on its way, ${customerName}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 8px;font-size:15px;line-height:1.7;color:#334155;">
              <p style="margin:0 0 16px;">We've processed a refund of <strong style="color:${NAVY};font-size:17px;">${escapeHtml(details.refundAmount)}</strong> for your booking with ${escapeHtml(businessName)}. The amount should return to your original payment method within <strong>5&ndash;7 working days</strong>, depending on your bank or card provider.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 8px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <div style="font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:${ACCENT};font-weight:bold;margin-bottom:12px;">Refund summary</div>
                    <div style="font-size:28px;font-weight:bold;color:${NAVY};line-height:1.2;margin-bottom:12px;">${escapeHtml(details.refundAmount)}</div>
                    <div style="font-size:14px;line-height:1.8;color:#475569;">
                      <strong>Original reference:</strong> ${escapeHtml(details.paymentReference)}<br />
                      <strong>Trip:</strong> ${escapeHtml(details.tripLabel)}<br />
                      ${when ? `<strong>Journey:</strong> ${when}<br />` : ""}
                      <strong>Pickup:</strong> ${escapeHtml(details.pickupLabel)}<br />
                      <strong>Drop-off:</strong> ${escapeHtml(details.dropoffLabel)}<br />
                      <strong>Status:</strong> Cancelled and refunded
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 28px;font-size:14px;line-height:1.7;color:#475569;">
              <p style="margin:0;">If you have any questions about this refund, reply to this email or contact us at <a href="mailto:${BUSINESS_EMAIL}" style="color:${NAVY};">${BUSINESS_EMAIL}</a>.</p>
            </td>
          </tr>
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 32px;font-size:13px;line-height:1.7;color:#64748b;">
              <strong style="color:${NAVY};">${escapeHtml(businessName)}</strong><br />
              <a href="${BUSINESS_WEBSITE}" style="color:${NAVY};">${BUSINESS_WEBSITE.replace(/^https:\/\//, "")}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildCustomerRefundConfirmationEmail(
  details: RefundConfirmationDetails,
  businessName = "My Airport Taxi NI",
): CustomerPaidBookingEmail {
  const when = formatTripDateTime(details.tripDate, details.tripTime);
  const subject = `Refund confirmation — ${details.refundAmount} — ${businessName}`;

  const text =
    `Hi ${details.customerName},\n\n` +
    `Refund amount: ${details.refundAmount}\n\n` +
    `We've processed a refund of ${details.refundAmount} for your booking with ${businessName}.\n\n` +
    `Original reference: ${details.paymentReference}\n` +
    `Trip: ${details.tripLabel}\n` +
    (when ? `Journey: ${when}\n` : "") +
    `Pickup: ${details.pickupLabel}\n` +
    `Drop-off: ${details.dropoffLabel}\n\n` +
    `The refund should appear on your original payment method within 5-7 working days.\n\n` +
    `Questions? Contact us at ${BUSINESS_EMAIL}.\n\n` +
    `${businessName}\n${BUSINESS_WEBSITE}`;

  const html = buildRefundConfirmationHtml(details, businessName);

  return { subject, text, html };
}

export function buildOwnerRefundConfirmationEmail(
  details: RefundConfirmationDetails,
  businessName = "My Airport Taxi NI",
): { subject: string; body: string } {
  const when = formatTripDateTime(details.tripDate, details.tripTime);
  const subject = `Refund issued — ${details.customerName} — ${details.refundAmount}`;

  const body =
    `A refund was issued via ${businessName}.\n\n` +
    `CUSTOMER\n${"=".repeat(40)}\n` +
    `Name: ${details.customerName}\n\n` +
    `REFUND\n${"=".repeat(40)}\n` +
    `Amount refunded: ${details.refundAmount}\n` +
    `Original reference: ${details.paymentReference}\n\n` +
    `TRIP\n${"=".repeat(40)}\n` +
    `Trip: ${details.tripLabel}\n` +
    (when ? `Journey: ${when}\n` : "") +
    `Pickup: ${details.pickupLabel}\n` +
    `Drop-off: ${details.dropoffLabel}\n\n` +
    `Calendar events marked as cancelled and the booking marked as refunded on the driver dashboard.`;

  return { subject, body };
}

export type GoogleReviewRequestDetails = {
  customerName: string;
  pickupLabel?: string;
  dropoffLabel?: string;
  tripDate?: string;
  tripTime?: string;
};

/** Safe first-name greeting token — never empty. */
export function customerFirstName(fullName: string): string {
  const first = fullName.trim().split(/\s+/).filter(Boolean)[0];
  return first || "there";
}

function buildGoogleReviewRequestHtml(
  details: GoogleReviewRequestDetails,
  reviewUrl: string,
  businessName: string,
): string {
  const firstName = escapeHtml(customerFirstName(details.customerName));
  const safeReviewUrl = escapeHtml(reviewUrl);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>How was your journey — ${escapeHtml(businessName)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1a2b3c;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:${NAVY};padding:28px 32px;text-align:center;">
              <img src="${LOGO_URL}" alt="${escapeHtml(businessName)}" height="72" style="display:block;margin:0 auto;height:72px;width:auto;max-width:100%;" />
              <div style="margin-top:16px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${ACCENT};font-weight:bold;">${escapeHtml(businessName)}</div>
              <div style="margin-top:8px;font-size:22px;line-height:1.35;color:#ffffff;font-weight:bold;">How was your journey?</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 8px;font-size:15px;line-height:1.7;color:#334155;">
              <p style="margin:0 0 16px;">Hi ${firstName},</p>
              <p style="margin:0 0 16px;">Thank you for travelling with ${escapeHtml(businessName)}.</p>
              <p style="margin:0 0 16px;">I hope you had a comfortable journey.</p>
              <p style="margin:0;">If you have a moment, I’d really appreciate you sharing your experience on Google. Your feedback helps other customers find and trust our service.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 28px;text-align:center;">
              <a href="${safeReviewUrl}" style="display:inline-block;background:${ACCENT};color:${NAVY};text-decoration:none;font-size:16px;font-weight:bold;padding:14px 28px;border-radius:8px;">Leave a Google Review</a>
              <p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#64748b;">Or copy this link:<br /><a href="${safeReviewUrl}" style="color:${NAVY};word-break:break-all;">${safeReviewUrl}</a></p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px;font-size:15px;line-height:1.7;color:#334155;">
              <p style="margin:0 0 16px;">Thank you again for choosing ${escapeHtml(businessName)}.</p>
              <p style="margin:0;">Kind regards,<br /><strong>${escapeHtml(businessName)}</strong></p>
            </td>
          </tr>
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 32px;font-size:13px;line-height:1.7;color:#64748b;">
              <strong style="color:${NAVY};">${escapeHtml(businessName)}</strong><br />
              <a href="${BUSINESS_WEBSITE}" style="color:${NAVY};">${BUSINESS_WEBSITE.replace(/^https:\/\//, "")}</a> ·
              <a href="tel:${BUSINESS_PHONE_TEL}" style="color:${NAVY};">${BUSINESS_PHONE_DISPLAY}</a>
            </td>
          </tr>
          <tr>
            <td style="background:${NAVY};padding:16px 32px;text-align:center;font-size:12px;line-height:1.6;color:#94a3b8;">
              Premium airport transfers across Northern Ireland · Belfast · Dublin · Derry
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildGoogleReviewRequestEmail(
  details: GoogleReviewRequestDetails,
  reviewUrl: string,
  businessName = "My Airport Taxi NI",
): CustomerPaidBookingEmail {
  const firstName = customerFirstName(details.customerName);
  const subject = `How was your journey with ${businessName}?`;

  const text =
    `Hi ${firstName},\n\n` +
    `Thank you for travelling with ${businessName}.\n\n` +
    `I hope you had a comfortable journey.\n\n` +
    `If you have a moment, I'd really appreciate you sharing your experience on Google. ` +
    `Your feedback helps other customers find and trust our service.\n\n` +
    `Leave a Google Review:\n${reviewUrl}\n\n` +
    `Thank you again for choosing ${businessName}.\n\n` +
    `Kind regards,\n` +
    `${businessName}\n` +
    `${BUSINESS_WEBSITE}`;

  const html = buildGoogleReviewRequestHtml(details, reviewUrl, businessName);

  return { subject, text, html };
}

export type ArrivalNotificationDetails = {
  customerName: string;
};

/** Customer message when the driver taps Arrived at Pickup. */
export function buildDriverArrivedPickupEmail(
  details: ArrivalNotificationDetails,
  businessName = "My Airport Taxi NI",
): CustomerPaidBookingEmail {
  const firstName = customerFirstName(details.customerName);
  const subject = `Your driver has arrived — ${businessName}`;
  const bodyLine = `Hi ${firstName}, your ${businessName} driver has arrived at your pickup location. Please make your way to the vehicle when ready.`;

  const text =
    `${bodyLine}\n\n` +
    `Questions? Contact us at ${BUSINESS_EMAIL} or ${BUSINESS_PHONE_DISPLAY}.\n\n` +
    `${businessName}\n${BUSINESS_WEBSITE}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1a2b3c;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:${NAVY};padding:28px 32px;text-align:center;">
              <img src="${LOGO_URL}" alt="${escapeHtml(businessName)}" height="72" style="display:block;margin:0 auto;height:72px;width:auto;max-width:100%;" />
              <div style="margin-top:16px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${ACCENT};font-weight:bold;">${escapeHtml(businessName)}</div>
              <div style="margin-top:8px;font-size:22px;line-height:1.35;color:#ffffff;font-weight:bold;">Your driver has arrived</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px;font-size:15px;line-height:1.7;color:#334155;">
              <p style="margin:0;">${escapeHtml(bodyLine)}</p>
            </td>
          </tr>
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 32px;font-size:13px;line-height:1.7;color:#64748b;">
              <strong style="color:${NAVY};">${escapeHtml(businessName)}</strong><br />
              <a href="mailto:${BUSINESS_EMAIL}" style="color:${NAVY};">${BUSINESS_EMAIL}</a> ·
              <a href="tel:${BUSINESS_PHONE_TEL}" style="color:${NAVY};">${BUSINESS_PHONE_DISPLAY}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}

/** Customer email after an owner edits an existing paid booking (optional send). */
export function buildUpdatedBookingConfirmationEmail(
  receipt: PaidBookingReceipt,
  businessName = "My Airport Taxi NI",
  options?: { trackUrl?: string },
): CustomerPaidBookingEmail {
  const base = buildCustomerConfirmationEmail(receipt, businessName, options);
  const subject = `Your booking has been updated — ${businessName}`;
  const intro =
    `Dear ${receipt.customerName},\n\n` +
    `Your booking has been updated.\n\n` +
    `Please review the updated journey details below.\n\n`;

  const detailsStart = base.text.indexOf("BOOKING DETAILS");
  const text =
    detailsStart >= 0
      ? intro + base.text.slice(detailsStart)
      : intro + base.text.replace(/^Dear [^\n]+,\n\n[\s\S]*?\n\nPlease find your invoice details below\.\n\n/, "");

  const html = base.html
    .replace(
      /Your card payment has been received and your transfer is confirmed\.?/i,
      "Your booking has been updated. Please review the updated journey details below.",
    )
    .replace(
      /Thank you for your booking with [^.<]+?\./i,
      "Your booking has been updated.",
    )
    .replace(
      /(<div style="margin-top:8px;font-size:22px;line-height:1\.35;color:#ffffff;font-weight:bold;">)([^<]*)(<\/div>)/,
      `$1Your booking has been updated$3`,
    );

  return { subject, text, html };
}
