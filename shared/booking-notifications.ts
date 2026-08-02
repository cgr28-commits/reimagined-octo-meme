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

const BUSINESS_WEBSITE = "https://www.myairporttaxini.co.uk";
const BUSINESS_EMAIL = "bookings@myairporttaxini.co.uk";
const LOGO_URL = `${BUSINESS_WEBSITE}/google-business-logo.png`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatTripScheduleLines(details: PaidBookingDetails): string[] {
  const lines = [
    `Trip: ${details.tripLabel}`,
    `Pickup: ${details.pickupLabel}`,
    `Drop-off: ${details.dropoffLabel}`,
    `Return journey: ${details.returnJourney ? "Yes" : "No"}`,
    `${details.returnJourney ? "Outbound date" : "Date"}: ${details.tripDate}`,
    `${details.returnJourney ? "Outbound time" : "Time"}: ${details.tripTime}`,
  ];

  if (details.returnJourney) {
    lines.push(`Return date: ${details.returnDate}`, `Return time: ${details.returnTime}`);
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
    { label: "Trip", value: details.tripLabel },
    { label: "Pickup", value: details.pickupLabel },
    { label: "Drop-off", value: details.dropoffLabel },
    {
      label: details.returnJourney ? "Outbound date" : "Date",
      value: details.tripDate,
    },
    {
      label: details.returnJourney ? "Outbound time" : "Time",
      value: details.tripTime,
    },
  ];

  if (details.returnJourney) {
    rows.push({ label: "Return date", value: details.returnDate });
    rows.push({ label: "Return time", value: details.returnTime });
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

  return rows;
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
        `<tr><td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:14px;width:38%;vertical-align:top;">${escapeHtml(row.label)}</td><td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#0b1f33;font-size:14px;font-weight:600;vertical-align:top;">${escapeHtml(row.value)}</td></tr>`,
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
            <td style="background:#0b1f33;padding:28px 32px;text-align:center;">
              <img src="${LOGO_URL}" alt="${escapeHtml(businessName)}" height="72" style="display:block;margin:0 auto;height:72px;width:auto;max-width:100%;" />
              <div style="margin-top:16px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#c9a227;font-weight:bold;">Invoice &amp; booking confirmation</div>
              <div style="margin-top:8px;font-size:22px;line-height:1.35;color:#ffffff;font-weight:bold;">Thank you, ${customerName}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 8px;font-size:15px;line-height:1.7;color:#334155;">
              <p style="margin:0 0 16px;">Your card payment has been received and your airport transfer is confirmed. Please keep this invoice for your records.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 8px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <div style="font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:#c9a227;font-weight:bold;margin-bottom:12px;">Payment summary</div>
                    <div style="font-size:28px;font-weight:bold;color:#0b1f33;line-height:1.2;margin-bottom:12px;">${escapeHtml(details.amountPaid)}</div>
                    <div style="font-size:14px;line-height:1.8;color:#475569;">
                      <strong>Invoice / reference:</strong> ${invoiceNumber}<br />
                      <strong>Payment method:</strong> Card (SumUp)<br />
                      ${details.transactionCode ? `<strong>Transaction code:</strong> ${escapeHtml(details.transactionCode)}<br />` : ""}
                      <strong>Status:</strong> Paid in full
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 8px;">
              <div style="font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:#c9a227;font-weight:bold;margin-bottom:12px;">Booking details</div>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rowsHtml}</table>
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
                      Save this link — it activates about 2 hours before your scheduled pickup.
                    </div>
                    <div style="margin-top:12px;">
                      <a href="${escapeHtml(trackUrl)}" style="display:inline-block;background:#0b1f33;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;padding:12px 20px;border-radius:8px;">Open tracking page</a>
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
              <div style="font-size:13px;line-height:1.7;color:#64748b;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px 20px;">
                <strong style="color:#92400e;">Cancellation policy:</strong>
                Free cancellation more than 24 hours before pickup. Bookings cancelled within 24 hours of pickup are non-refundable.
                See our <a href="${BUSINESS_WEBSITE}/terms/" style="color:#0b1f33;">Terms &amp; Conditions</a> for full details.
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 28px;font-size:14px;line-height:1.7;color:#475569;">
              <p style="margin:0 0 12px;">We will contact you if we need any further information before your journey.</p>
              <p style="margin:0;">Questions? Reply to this email or contact us at <a href="mailto:${BUSINESS_EMAIL}" style="color:#0b1f33;">${BUSINESS_EMAIL}</a>.</p>
            </td>
          </tr>
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 32px;font-size:13px;line-height:1.7;color:#64748b;">
              <strong style="color:#0b1f33;">${escapeHtml(businessName)}</strong><br />
              <a href="${BUSINESS_WEBSITE}" style="color:#0b1f33;">${BUSINESS_WEBSITE.replace("https://", "")}</a> ·
              <a href="${BUSINESS_WEBSITE}/terms/" style="color:#0b1f33;">Terms &amp; Conditions</a> ·
              <a href="${BUSINESS_WEBSITE}/privacy/" style="color:#0b1f33;">Privacy Policy</a><br />
              Business address available on request — ${BUSINESS_EMAIL}
            </td>
          </tr>
          <tr>
            <td style="background:#0b1f33;padding:16px 32px;text-align:center;font-size:12px;line-height:1.6;color:#94a3b8;">
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
    `Logo: ${LOGO_URL}\n` +
    `${BUSINESS_WEBSITE}\n\n` +
    `Please find your invoice details below.\n\n` +
    `BOOKING DETAILS\n` +
    `${"=".repeat(40)}\n` +
    `${formatTripSchedule(details)}\n\n` +
    `PAYMENT / INVOICE\n` +
    `${"=".repeat(40)}\n` +
    `Amount paid: ${details.amountPaid}\n` +
    `Invoice / reference: ${details.paymentReference}\n` +
    (details.transactionCode ? `Transaction code: ${details.transactionCode}\n` : "") +
    `Payment method: Card (SumUp)\n` +
    `Status: Paid in full\n` +
    (trackUrl
      ? `\nLIVE DRIVER TRACKING\n${"=".repeat(40)}\n` +
        `On the day of travel, your driver can share their live location around pickup time.\n` +
        `Save this link — it activates about 2 hours before your scheduled pickup:\n` +
        `${trackUrl}\n`
      : "") +
    `\nWe will contact you if we need any further information before your journey.\n\n` +
    `If you have questions, reply to this email or contact us at ${BUSINESS_EMAIL}.\n\n` +
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
    (trackUrl ? `\n\nDRIVER TRACK LINK\n${"=".repeat(40)}\n${trackUrl}` : "");

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
};

function formatTripDateTime(tripDate: string, tripTime: string): string {
  if (!tripDate || !tripTime) {
    return "";
  }

  return new Date(`${tripDate}T${tripTime}:00`).toLocaleString("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
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
            <td style="background:#0b1f33;padding:28px 32px;text-align:center;">
              <img src="${LOGO_URL}" alt="${escapeHtml(businessName)}" height="72" style="display:block;margin:0 auto;height:72px;width:auto;max-width:100%;" />
              <div style="margin-top:16px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#c9a227;font-weight:bold;">Live driver tracking</div>
              <div style="margin-top:8px;font-size:22px;line-height:1.35;color:#ffffff;font-weight:bold;">Your driver is on the way</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 8px;font-size:15px;line-height:1.7;color:#334155;">
              <p style="margin:0 0 16px;">Hi ${customerName}, your driver has started sharing their live location. Open the link below to follow them on the map.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 8px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
                <tr>
                  <td style="padding:20px 24px;font-size:14px;line-height:1.8;color:#475569;">
                    ${when ? `<strong>Pickup time:</strong> ${when}<br />` : ""}
                    <strong>Pickup:</strong> ${pickup}<br />
                    <strong>Drop-off:</strong> ${dropoff}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 28px;text-align:center;">
              <a href="${escapeHtml(trackUrl)}" style="display:inline-block;background:#0b1f33;color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;padding:14px 28px;border-radius:8px;">Follow your driver live</a>
              <p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#64748b;">Or copy this link:<br /><a href="${escapeHtml(trackUrl)}" style="color:#0b1f33;word-break:break-all;">${escapeHtml(trackUrl)}</a></p>
            </td>
          </tr>
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 32px;font-size:13px;line-height:1.7;color:#64748b;">
              <strong style="color:#0b1f33;">${escapeHtml(businessName)}</strong><br />
              Questions? <a href="mailto:${BUSINESS_EMAIL}" style="color:#0b1f33;">${BUSINESS_EMAIL}</a>
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
  const subject = `Your driver is on the way — follow live | ${businessName}`;

  const text =
    `Hi ${details.customerName},\n\n` +
    `Your driver has started sharing their live location for your transfer today.\n\n` +
    (when ? `Pickup time: ${when}\n` : "") +
    `Pickup: ${details.pickupLabel}\n` +
    `Drop-off: ${details.dropoffLabel}\n\n` +
    `Follow your driver live:\n${trackUrl}\n\n` +
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
            <td style="background:#0b1f33;padding:28px 32px;text-align:center;">
              <img src="${LOGO_URL}" alt="${escapeHtml(businessName)}" height="72" style="display:block;margin:0 auto;height:72px;width:auto;max-width:100%;" />
              <div style="margin-top:16px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#c9a227;font-weight:bold;">Refund confirmation</div>
              <div style="margin-top:8px;font-size:22px;line-height:1.35;color:#ffffff;font-weight:bold;">Your refund is on its way, ${customerName}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 8px;font-size:15px;line-height:1.7;color:#334155;">
              <p style="margin:0 0 16px;">We've processed a refund of <strong style="color:#0b1f33;font-size:17px;">${escapeHtml(details.refundAmount)}</strong> for your booking with ${escapeHtml(businessName)}. The amount should return to your original payment method within a few working days, depending on your bank or card provider.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 8px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <div style="font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:#c9a227;font-weight:bold;margin-bottom:12px;">Refund summary</div>
                    <div style="font-size:28px;font-weight:bold;color:#0b1f33;line-height:1.2;margin-bottom:12px;">${escapeHtml(details.refundAmount)}</div>
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
              <p style="margin:0;">If you have any questions about this refund, reply to this email or contact us at <a href="mailto:${BUSINESS_EMAIL}" style="color:#0b1f33;">${BUSINESS_EMAIL}</a>.</p>
            </td>
          </tr>
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 32px;font-size:13px;line-height:1.7;color:#64748b;">
              <strong style="color:#0b1f33;">${escapeHtml(businessName)}</strong><br />
              <a href="${BUSINESS_WEBSITE}" style="color:#0b1f33;">${BUSINESS_WEBSITE.replace(/^https:\/\//, "")}</a>
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
    `The refund should appear on your original payment method within a few working days.\n\n` +
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
    `Calendar events marked as cancelled and tracking job removed where applicable.`;

  return { subject, body };
}
