import { formatMarketingOptInLine } from "./marketing";
import {
  BRAND_EMERALD,
  BRAND_NAVY,
  BUSINESS_MAILBOX,
  BUSINESS_PHONE_DISPLAY,
  BUSINESS_PHONE_TEL,
  BUSINESS_WEBSITE as CANONICAL_BUSINESS_WEBSITE,
  businessWhatsAppChatUrl,
  businessWhatsAppPublicPageUrl,
} from "./business-email";
import { contactVCardPublicUrl } from "./business-links";
import { vehicleServiceLabel } from "./booking-notice";
import { formatUkDate, formatUkTime, UK_LOCAL_TIME_LABEL } from "./uk-time";
import {
  formatEmailFareIncludesBlock,
  formatEmailFareIncludesHtml,
  resolveJourneyInclusions,
} from "./journey-inclusions";
import {
  EXPRESS_DROP_OFF_PASSED_ON_NOTE,
  formatAirportAccessOptionCustomerLine,
  formatAirportAccessOptionOwnerLine,
  formatExpressDropOffSummaryLine,
} from "./express-drop-off";
import {
  formatCustomerPromoPricingHtmlRows,
  formatCustomerPromoPricingLines,
} from "./website-promo-pricing";
import {
  REFUND_FUNDS_TIMING,
  REFUND_REASON_LABELS,
  type RefundReasonCategory,
} from "./refund-ops";
import {
  formatAdsAttributionForOwner,
  type AdsAttribution,
} from "./ads-attribution";
import {
  CANCELLATION_POLICY_PATH,
  CONFIRMATION_EMAIL_CANCELLATION_POLICY,
  UNDER_24H_CANCEL_CUSTOMER_NOTICE,
} from "./cancellation-policy";
import {
  AIRPORT_PICKUP_HEADING,
  buildArrivedCompanyVoiceEmailBody,
  buildOnTheWayCompanyVoiceMessage,
  isCompanyVoiceAirportPickup,
  type CompanyVoiceAirportAccessOption,
} from "./company-voice-journey";

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
  /** Open-website quote context for authoritative requote / fee resolution. */
  journeyKind?: string;
  pickupAirportCode?: string;
  dropoffAirportCode?: string;
  isAirportToAirport?: boolean;
  expressDropOffSelected?: boolean;
  expressDropOffFee?: number;
  expressDropOffAirport?: "BFS" | "BHD" | null;
  /** Explicit access choice stored with the booking ("express" | "free"). */
  airportAccessOption?: "express" | "free" | null;
  dublinArrivalTerminal?: "T1" | "T2" | null;
  /** Snapshot of applied promotional pricing (open website). */
  journeyFareBeforePromotionsGbp?: number;
  originalEligibleJourneyPriceGbp?: number;
  returnJourneySavingGbp?: number;
  totalPromotionalSavingGbp?: number;
  airportAccessChargeGbp?: number;
  journeyFareAfterPromotionsGbp?: number;
  finalAmountPayableGbp?: number;
  returnOfferSavingGbp?: number;
  returnOfferOriginalPaymentReference?: string;
  /** Optional per-leg fares — persisted on the paid record when both are known. */
  outboundFare?: number;
  returnFare?: number;
  /** Operational coordinates / route snapshot from the quote or payment resolve. */
  pickupLat?: number | null;
  pickupLng?: number | null;
  dropoffLat?: number | null;
  dropoffLng?: number | null;
  routeDistanceKm?: number | null;
  routeDurationMinutes?: number | null;
  termsAcceptedAt?: string;
  termsVersion?: string;
  cancellationPolicyVersion?: string;
  marketingOptIn?: boolean;
  marketingOptInAt?: string;
  marketingConsentVersion?: string;
  /** Consented, non-PII campaign attribution; owner/server use only. */
  attribution?: AdsAttribution;
};

export type PaidBookingReceipt = PaidBookingDetails & {
  amountPaid: string;
  /**
   * Internal / SumUp payment key (transaction code or checkout ref).
   * Prefer {@link customerReference} for customer-facing “Booking reference”.
   */
  paymentReference: string;
  /** Short customer-facing booking reference (MAT-4827). */
  customerReference?: string;
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

const JOURNEY_STATUS_WHATSAPP_LINK_LABEL = "Chat with us on WhatsApp";

/** Driver on the way / arrived emails only — email + WhatsApp, no landline. */
function journeyStatusContactText(businessName: string): string {
  return (
    `Questions? Email us at ${BUSINESS_EMAIL} or chat with us on WhatsApp.\n` +
    `${businessWhatsAppPublicPageUrl()}\n\n` +
    `${businessName}\n${BUSINESS_WEBSITE}`
  );
}

function journeyStatusContactHtml(businessName: string): string {
  const whatsappHref = businessWhatsAppChatUrl();
  return `<tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 32px;font-size:13px;line-height:1.7;color:#64748b;">
              <strong style="color:${NAVY};">${escapeHtml(businessName)}</strong>
              <p style="margin:12px 0 0;">Questions? Email us at <a href="mailto:${BUSINESS_EMAIL}" style="color:${NAVY};">${BUSINESS_EMAIL}</a> or</p>
              <p style="margin:14px 0 0;">
                <a href="${escapeHtml(whatsappHref)}" style="display:inline-block;background:#25D366;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;line-height:1.2;padding:12px 18px;border-radius:8px;">${JOURNEY_STATUS_WHATSAPP_LINK_LABEL}</a>
              </p>
            </td>
          </tr>`;
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
    `Service: ${vehicleServiceLabel(details.vehicle)}`,
    `Vehicle: ${details.vehicle}`,
  );

  // Owner/ops: keep distance when present. Customer-facing uses duration only.
  if (details.journeyDistance && details.journeyDuration) {
    lines.push(`Journey: ${details.journeyDistance} · ${details.journeyDuration}`);
  } else if (details.journeyDuration) {
    lines.push(`Estimated journey time: ${details.journeyDuration}`);
  }

  return lines;
}

function formatCustomerTripScheduleLines(details: PaidBookingDetails): string[] {
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
    `Service: ${vehicleServiceLabel(details.vehicle)}`,
    `Vehicle: ${details.vehicle}`,
  );

  if (details.journeyDuration) {
    lines.push(`Approx. ${details.journeyDuration}`);
  }

  return lines;
}

function formatTripSchedule(details: PaidBookingDetails): string {
  return formatTripScheduleLines(details).join("\n");
}

function formatCustomerTripSchedule(details: PaidBookingDetails): string {
  return formatCustomerTripScheduleLines(details).join("\n");
}

function formatOwnerAttributionBlock(details: Pick<PaidBookingDetails, "attribution">): string {
  const lines = formatAdsAttributionForOwner(details.attribution);
  return lines.length > 0
    ? `\n\nATTRIBUTION\n${"=".repeat(40)}\n${lines.join("\n")}`
    : "";
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

  const accessOption = formatAirportAccessOptionCustomerLine({
    expressDropOffSelected: details.expressDropOffSelected,
    expressDropOffFee: details.expressDropOffFee,
    expressDropOffAirport: details.expressDropOffAirport ?? details.airportCode,
    fromAirport: details.isFromAirport,
  });
  if (accessOption) {
    const value = accessOption.replace(/^Airport access option:\s*/i, "");
    rows.push({ label: "Airport access option", value });
  }

  rows.push(
    { label: "Passengers", value: String(details.passengers) },
    { label: "Suitcases", value: String(details.suitcases) },
    { label: "Service", value: vehicleServiceLabel(details.vehicle) },
    { label: "Vehicle", value: details.vehicle },
  );

  // Customer invoice: show estimated time only — distance stays internal/ops.
  if (details.journeyDuration) {
    rows.push({
      label: "Estimated journey time",
      value: details.journeyDuration,
    });
  }

  if (details.customerReference?.trim()) {
    rows.unshift({ label: "Booking reference", value: details.customerReference.trim().toUpperCase() });
  } else if (details.checkoutReference) {
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
  _trackUrl?: string,
  manageUrl?: string,
): string {
  void _trackUrl;
  const customerRef =
    details.customerReference?.trim().toUpperCase() ||
    details.checkoutReference?.trim() ||
    "";
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
              ${
                customerRef
                  ? `<div style="margin-top:14px;display:inline-block;background:rgba(16,185,129,0.15);border:1px solid ${ACCENT};border-radius:10px;padding:10px 16px;font-size:15px;color:#ffffff;"><span style="color:${ACCENT};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;font-weight:bold;">Booking reference</span><br /><span style="font-size:22px;font-weight:bold;letter-spacing:0.04em;">${escapeHtml(customerRef)}</span></div>`
                  : ""
              }
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 8px;font-size:15px;line-height:1.7;color:#334155;">
              <p style="margin:0 0 16px;">Your card payment has been received and your airport transfer with <strong style="color:${NAVY};">${escapeHtml(businessName)}</strong> is confirmed. Please keep this invoice for your records.</p>
              ${
                customerRef
                  ? `<p style="margin:0 0 16px;font-size:15px;"><strong style="color:${NAVY};">Booking reference:</strong> ${escapeHtml(customerRef)}</p>`
                  : ""
              }
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
                      ${(() => {
                        const promoRows = formatCustomerPromoPricingHtmlRows(
                          details,
                          details.amountPaid,
                        );
                        if (promoRows.length > 1) {
                          return promoRows
                            .map(
                              (row) =>
                                `<strong>${escapeHtml(row.label)}:</strong> ${escapeHtml(row.value)}<br />`,
                            )
                            .join("");
                        }
                        return "";
                      })()}
                      ${customerRef ? `<strong>Booking reference:</strong> ${escapeHtml(customerRef)}<br />` : ""}
                      <strong>Payment method:</strong> Card (SumUp)<br />
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
            manageUrl
              ? `<tr>
            <td style="padding:8px 32px 8px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;">
                <tr>
                  <td style="padding:20px 24px;text-align:center;">
                    <div style="font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:#047857;font-weight:bold;margin-bottom:10px;">Need to change something?</div>
                    <div style="font-size:14px;line-height:1.7;color:#475569;margin-bottom:14px;">
                      Update your pickup, destination, date, time, or passenger details online.
                    </div>
                    <a href="${escapeHtml(manageUrl)}" style="display:inline-block;background:${ACCENT};color:${NAVY};text-decoration:none;font-size:15px;font-weight:bold;padding:14px 24px;border-radius:8px;">Manage Your Booking</a>
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
                ${CONFIRMATION_EMAIL_CANCELLATION_POLICY}
                See our <a href="${BUSINESS_WEBSITE}${CANCELLATION_POLICY_PATH}" style="color:${NAVY};">Cancellation Policy</a> and <a href="${BUSINESS_WEBSITE}/terms/" style="color:${NAVY};">Terms &amp; Conditions</a> for full details.
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
  options?: { trackUrl?: string; manageUrl?: string },
): CustomerPaidBookingEmail {
  const trackUrl = options?.trackUrl?.trim();
  const manageUrl = options?.manageUrl?.trim();
  // Customer website live-tracking links are retired. Keep the optional param for
  // call-site compatibility, but never include a Track Your Driver CTA.
  void trackUrl;
  const customerRef =
    details.customerReference?.trim().toUpperCase() ||
    details.checkoutReference?.trim() ||
    "";
  const subject = customerRef
    ? `Invoice & booking confirmed — ${customerRef}`
    : `Invoice & booking confirmed — ${businessName}`;

  const text =
    `Dear ${details.customerName},\n\n` +
    `Thank you for your booking with ${businessName}. Your card payment has been received and your transfer is confirmed.\n\n` +
    (customerRef ? `Booking reference: ${customerRef}\n\n` : "") +
    `${BUSINESS_WEBSITE}\n` +
    `Phone: ${BUSINESS_PHONE_DISPLAY}\n` +
    `Email: ${BUSINESS_EMAIL}\n\n` +
    `Please find your invoice details below.\n\n` +
    `BOOKING DETAILS\n` +
    `${"=".repeat(40)}\n` +
    (customerRef ? `Booking reference: ${customerRef}\n` : "") +
    `Customer: ${details.customerName}\n` +
    `Email: ${details.customerEmail}\n` +
    `Mobile: ${details.mobileNumber || "Not provided"}\n` +
    `${formatCustomerTripSchedule(details)}\n` +
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
    )}\n` +
    (() => {
      const accessLine = formatAirportAccessOptionCustomerLine({
        expressDropOffSelected: details.expressDropOffSelected,
        expressDropOffFee: details.expressDropOffFee,
        expressDropOffAirport: details.expressDropOffAirport ?? details.airportCode,
        fromAirport: details.isFromAirport,
      });
      if (!accessLine) return "\n";
      const breakdown = formatExpressDropOffSummaryLine({
        expressDropOffSelected: details.expressDropOffSelected,
        expressDropOffFee: details.expressDropOffFee,
        expressDropOffAirport: details.expressDropOffAirport ?? details.airportCode,
        fromAirport: details.isFromAirport,
      });
      return (
        `${accessLine}\n` +
        (breakdown && breakdown !== accessLine ? `${breakdown}\n` : "") +
        `${EXPRESS_DROP_OFF_PASSED_ON_NOTE}\n\n`
      );
    })() +
    `PAYMENT / INVOICE\n` +
    `${"=".repeat(40)}\n` +
    (() => {
      const promoLines = formatCustomerPromoPricingLines(details, details.amountPaid);
      if (promoLines.length > 1) {
        return `${promoLines.join("\n")}\n`;
      }
      return `Amount paid: ${details.amountPaid}\n`;
    })() +
    (customerRef ? `Booking reference: ${customerRef}\n` : "") +
    `Payment method: Card (SumUp)\n` +
    `Status: Paid & confirmed\n` +
    (manageUrl
      ? `\nMANAGE YOUR BOOKING\n${"=".repeat(40)}\n` +
        `Need to change pickup, destination, date, time, or passenger details?\n` +
        `Manage Your Booking:\n${manageUrl}\n`
      : "") +
    `\nSAVE US FOR YOUR NEXT JOURNEY\n${"=".repeat(40)}\n` +
    `Keep ${businessName} in your contacts so we're easy to find whenever you need another airport transfer.\n` +
    `Save My Airport Taxi NI to Contacts:\n${contactVCardPublicUrl()}\n` +
    `\nWe will contact you if we need any further information before your journey.\n\n` +
    `If you have questions, reply to this email, call ${BUSINESS_PHONE_DISPLAY}, or contact us at ${BUSINESS_EMAIL}.\n\n` +
    `${businessName}\n` +
    `${BUSINESS_WEBSITE}`;

  const html = buildInvoiceHtml(details, businessName, undefined, manageUrl);

  return { subject, text, html };
}

export function buildOwnerPaidBookingEmail(
  details: PaidBookingReceipt,
  businessName = "My Airport Taxi NI",
  options?: { trackUrl?: string },
): { subject: string; body: string } {
  // Customer website track links are retired; ignore any trackUrl for owner alerts too.
  void options?.trackUrl;
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
    `${formatTripSchedule(details)}\n` +
    (() => {
      const ownerAccess = formatAirportAccessOptionOwnerLine({
        expressDropOffSelected: details.expressDropOffSelected,
        expressDropOffFee: details.expressDropOffFee,
        expressDropOffAirport: details.expressDropOffAirport ?? details.airportCode,
        fromAirport: details.isFromAirport,
      });
      if (!ownerAccess) return "";
      const detail = formatAirportAccessOptionCustomerLine({
        expressDropOffSelected: details.expressDropOffSelected,
        expressDropOffFee: details.expressDropOffFee,
        expressDropOffAirport: details.expressDropOffAirport ?? details.airportCode,
        fromAirport: details.isFromAirport,
      });
      return (
        `\n${ownerAccess}\n` +
        (detail ? `${detail}\n` : "") +
        `${EXPRESS_DROP_OFF_PASSED_ON_NOTE}\n`
      );
    })() +
    `\n` +
    `PAYMENT\n` +
    `${"=".repeat(40)}\n` +
    `Amount paid: ${details.amountPaid}\n` +
    (details.customerReference
      ? `Customer booking reference: ${details.customerReference.trim().toUpperCase()}\n`
      : "") +
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
    formatOwnerAttributionBlock(details);

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
    `\nYou will get a separate “Paid booking” email if SumUp confirms payment.` +
    formatOwnerAttributionBlock(details);

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
    `Status: ${status} (not paid)\n` +
    formatOwnerAttributionBlock(details);

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

export type CancellationEmailDetails = RefundConfirmationDetails & {
  refundAmountValue: number;
  originalAmount: string;
  originalAmountValue: number;
  cumulativeRefunded: string;
  remainingPaid: string;
  cancelBooking: boolean;
  within24h: boolean;
  reasonCategory: string;
  customerFacingReason?: string;
  bookingRemainsActive: boolean;
  actionKind: string;
  /** Internal only — never included in customer-facing emails. */
  ownerNotes?: string;
  auditId?: string;
  sumUpTransactionId?: string;
  cumulativeRefundedValue?: number;
  amountRetained?: string;
  paymentStatusAfter?: string;
  operationalStatusAfter?: string;
  initiatedBy?: string;
};

function isFullyRefundedMoney(details: CancellationEmailDetails): boolean {
  const remainingNum = Number(String(details.remainingPaid).replace(/[^\d.]/g, ""));
  if (Number.isFinite(remainingNum) && remainingNum <= 0.001) return true;
  return details.originalAmountValue - details.refundAmountValue < 0.01;
}

function customerRefundTypeLabel(
  details: CancellationEmailDetails,
  fullyRefunded: boolean,
): string {
  if (details.cancelBooking && details.refundAmountValue > 0) {
    return "Cancellation & Refund";
  }
  if (fullyRefunded) return "Full Refund";
  return "Partial Refund";
}

function customerBookingStatusLabel(details: CancellationEmailDetails): string {
  if (details.operationalStatusAfter?.trim()) {
    return details.operationalStatusAfter.trim();
  }
  if (details.cancelBooking || !details.bookingRemainsActive) {
    return "Cancelled";
  }
  return "Confirmed — journey remains booked as scheduled";
}

function reasonLabelForOwner(reasonCategory: string): string {
  if (reasonCategory in REFUND_REASON_LABELS) {
    return REFUND_REASON_LABELS[reasonCategory as RefundReasonCategory];
  }
  return reasonCategory;
}

/**
 * Dedicated owner audit body for refund/cancellation outcomes.
 * Includes internal notes and references that must never go to the customer.
 */
export function buildOwnerRefundAuditEmailBody(
  details: CancellationEmailDetails,
  businessName = "My Airport Taxi NI",
): string {
  const when = formatTripDateTime(details.tripDate, details.tripTime);
  const cumulativeLabel =
    details.cumulativeRefundedValue != null
      ? formatPaidAmount(details.cumulativeRefundedValue)
      : details.cumulativeRefunded;
  const timestamp = new Date().toISOString();
  const notes = details.ownerNotes?.trim() || "(none)";

  return (
    `Refund / cancellation audit — ${businessName}\n\n` +
    `CUSTOMER\n${"=".repeat(40)}\n` +
    `Name: ${details.customerName}\n` +
    `Booking reference: ${details.paymentReference}\n\n` +
    `OPERATION\n${"=".repeat(40)}\n` +
    `Reason: ${reasonLabelForOwner(details.reasonCategory)}\n` +
    `Action kind: ${details.actionKind}\n` +
    `Initiated by: ${details.initiatedBy?.trim() || "owner"}\n` +
    `Owner notes (internal): ${notes}\n` +
    (details.customerFacingReason
      ? `Customer-facing reason: ${details.customerFacingReason}\n`
      : "") +
    `Within 24h of pickup: ${details.within24h ? "Yes" : "No"}\n` +
    `\nMONEY\n${"=".repeat(40)}\n` +
    `Amount refunded (this operation): ${details.refundAmount}\n` +
    `Cumulative refunded to date: ${cumulativeLabel}\n` +
    `Original payment: ${details.originalAmount}\n` +
    `Remaining balance: ${details.remainingPaid}\n` +
    (details.amountRetained ? `Amount retained: ${details.amountRetained}\n` : "") +
    (details.paymentStatusAfter
      ? `Payment status after: ${details.paymentStatusAfter}\n`
      : "") +
    `\nBOOKING STATUS\n${"=".repeat(40)}\n` +
    `Cancel booking: ${details.cancelBooking ? "Yes" : "No"}\n` +
    `Booking remains active: ${details.bookingRemainsActive ? "Yes" : "No"}\n` +
    `Booking status: ${customerBookingStatusLabel(details)}\n` +
    (details.operationalStatusAfter
      ? `Operational status after: ${details.operationalStatusAfter}\n`
      : "") +
    `\nREFERENCES\n${"=".repeat(40)}\n` +
    (details.sumUpTransactionId
      ? `SumUp transaction / reference: ${details.sumUpTransactionId}\n`
      : `SumUp transaction / reference: (not recorded)\n`) +
    `Payment / booking reference: ${details.paymentReference}\n` +
    (details.auditId ? `Audit ID: ${details.auditId}\n` : "Audit ID: (not recorded)\n") +
    `Timestamp: ${timestamp}\n\n` +
    `TRIP\n${"=".repeat(40)}\n` +
    `Trip: ${details.tripLabel}\n` +
    (when ? `Journey: ${when}\n` : "") +
    `Pickup: ${details.pickupLabel}\n` +
    `Drop-off: ${details.dropoffLabel}\n`
  );
}

function buildOwnerCancellationEmail(
  details: CancellationEmailDetails,
  subject: string,
  businessName: string,
): { subject: string; body: string } {
  return {
    subject,
    body: buildOwnerRefundAuditEmailBody(details, businessName),
  };
}

/** Customer-facing refund/cancellation intent paragraph(s). Never includes ownerNotes. */
function buildCustomerRefundIntentCopy(details: CancellationEmailDetails): {
  fullyRefunded: boolean;
  refundType: string;
  intentText: string;
  intentHtml: string;
  bookingStatus: string;
} {
  const fullyRefunded = isFullyRefundedMoney(details);
  const refundType = customerRefundTypeLabel(details, fullyRefunded);
  const bookingStatus = customerBookingStatusLabel(details);
  const remainsActive = details.bookingRemainsActive && !details.cancelBooking;
  const amount = details.refundAmount;

  let intentText: string;
  let intentHtml: string;

  if (details.cancelBooking && details.refundAmountValue > 0) {
    intentText =
      `Your booking has been cancelled. A refund of ${amount} has been issued to your original payment method. ${REFUND_FUNDS_TIMING}`;
    intentHtml =
      `<p>Your booking has been cancelled. A refund of <strong>${escapeHtml(amount)}</strong> has been issued to your original payment method. ${escapeHtml(REFUND_FUNDS_TIMING)}</p>`;
  } else if (fullyRefunded && remainsActive) {
    intentText =
      `A full refund of ${amount} has been issued to your original payment method. ${REFUND_FUNDS_TIMING}\n\n` +
      `Your journey has NOT been cancelled and remains booked as scheduled.`;
    intentHtml =
      `<p>A full refund of <strong>${escapeHtml(amount)}</strong> has been issued to your original payment method. ${escapeHtml(REFUND_FUNDS_TIMING)}</p>` +
      `<p><strong>Your journey has NOT been cancelled and remains booked as scheduled.</strong></p>`;
  } else if (!fullyRefunded && details.refundAmountValue > 0) {
    intentText =
      `A partial refund of ${amount} has been issued to your original payment method. ${REFUND_FUNDS_TIMING}` +
      (remainsActive
        ? `\n\nYour journey remains booked as scheduled.`
        : details.cancelBooking
          ? `\n\nYour booking has been cancelled.`
          : "");
    intentHtml =
      `<p>A partial refund of <strong>${escapeHtml(amount)}</strong> has been issued to your original payment method. ${escapeHtml(REFUND_FUNDS_TIMING)}</p>` +
      (remainsActive
        ? `<p>Your journey remains booked as scheduled.</p>`
        : details.cancelBooking
          ? `<p>Your booking has been cancelled.</p>`
          : "");
  } else {
    intentText =
      `A refund of ${amount} has been issued to your original payment method. ${REFUND_FUNDS_TIMING}`;
    intentHtml =
      `<p>A refund of <strong>${escapeHtml(amount)}</strong> has been issued to your original payment method. ${escapeHtml(REFUND_FUNDS_TIMING)}</p>`;
  }

  return { fullyRefunded, refundType, intentText, intentHtml, bookingStatus };
}

function buildCustomerRefundDetailsBlock(details: CancellationEmailDetails): {
  text: string;
  html: string;
} {
  const { fullyRefunded, refundType, bookingStatus } = buildCustomerRefundIntentCopy(details);
  const when = formatTripDateTime(details.tripDate, details.tripTime);
  const showCumulative =
    details.refundAmountValue > 0 &&
    (details.cumulativeRefunded.trim() !== details.refundAmount.trim() || !fullyRefunded);

  const text =
    `Customer: ${details.customerName}\n` +
    `Booking reference: ${details.paymentReference}\n` +
    `Refund type: ${refundType}\n` +
    `Amount refunded (this operation): ${details.refundAmount}\n` +
    (showCumulative ? `Total refunded to date: ${details.cumulativeRefunded}\n` : "") +
    `Original payment amount: ${details.originalAmount}\n` +
    `Booking status: ${bookingStatus}\n` +
    `Original payment method: Card (SumUp) — refund returned to your original payment method\n` +
    `Trip: ${details.tripLabel}\n` +
    (when ? `When: ${when}\n` : "") +
    `Pickup: ${details.pickupLabel}\n` +
    `Drop-off: ${details.dropoffLabel}\n` +
    (details.customerFacingReason ? `Note: ${details.customerFacingReason}\n` : "");

  const html =
    `<p>` +
    `<strong>Customer:</strong> ${escapeHtml(details.customerName)}<br/>` +
    `<strong>Booking reference:</strong> ${escapeHtml(details.paymentReference)}<br/>` +
    `<strong>Refund type:</strong> ${escapeHtml(refundType)}<br/>` +
    `<strong>Amount refunded (this operation):</strong> ${escapeHtml(details.refundAmount)}<br/>` +
    (showCumulative
      ? `<strong>Total refunded to date:</strong> ${escapeHtml(details.cumulativeRefunded)}<br/>`
      : "") +
    `<strong>Original payment amount:</strong> ${escapeHtml(details.originalAmount)}<br/>` +
    `<strong>Booking status:</strong> ${escapeHtml(bookingStatus)}<br/>` +
    `<strong>Original payment method:</strong> Card (SumUp) — refund returned to your original payment method<br/>` +
    `<strong>Trip:</strong> ${escapeHtml(details.tripLabel)}<br/>` +
    (when ? `<strong>When:</strong> ${escapeHtml(when)}<br/>` : "") +
    `<strong>Pickup:</strong> ${escapeHtml(details.pickupLabel)}<br/>` +
    `<strong>Drop-off:</strong> ${escapeHtml(details.dropoffLabel)}` +
    (details.customerFacingReason
      ? `<br/><strong>Note:</strong> ${escapeHtml(details.customerFacingReason)}`
      : "") +
    `</p>`;

  return { text, html };
}

/**
 * Choose the correct customer + owner email for a refund/cancellation outcome.
 * Never returns a customer “refund completed” template when refundAmountValue is 0
 * unless it is an explicit cancellation notice.
 * Customer emails never include ownerNotes.
 */
export function buildCustomerCancellationEmails(
  details: CancellationEmailDetails,
  businessName = "My Airport Taxi NI",
): {
  customer: CustomerPaidBookingEmail | null;
  owner: { subject: string; body: string } | null;
} {
  const when = formatTripDateTime(details.tripDate, details.tripTime);
  const ref = details.paymentReference;
  const isBusiness = details.reasonCategory === "business_cancelled";

  // Business cancels → apology + refund/cancellation confirmation (when money returned).
  if (isBusiness && details.cancelBooking) {
    if (details.refundAmountValue > 0) {
      const { intentText, intentHtml, refundType } = buildCustomerRefundIntentCopy(details);
      const detailsBlock = buildCustomerRefundDetailsBlock(details);
      const subject = `Cancellation & Refund – ${ref}`;
      const text =
        `Hi ${details.customerName},\n\n` +
        `We're sorry — ${businessName} has had to cancel your booking.\n\n` +
        `${intentText}\n\n` +
        `${detailsBlock.text}\n` +
        `We apologise for the inconvenience and hope to welcome you again soon.\n\n` +
        `${businessName}\n${BUSINESS_WEBSITE}`;
      const html = buildSimpleBrandedEmailHtml({
        title: refundType,
        headline: `We're sorry, ${escapeHtml(details.customerName)}`,
        bodyHtml:
          `<p>We're sorry — ${escapeHtml(businessName)} has had to cancel your booking.</p>` +
          intentHtml +
          detailsBlock.html +
          `<p>We apologise for the inconvenience and hope to welcome you again soon.</p>`,
        businessName,
      });
      return {
        customer: { subject, text, html },
        owner: buildOwnerCancellationEmail(
          details,
          `Business cancellation — ${details.customerName} — ${ref}`,
          businessName,
        ),
      };
    }

    const subject = `Booking Cancellation Confirmed – ${ref}`;
    const text =
      `Hi ${details.customerName},\n\n` +
      `We're sorry — ${businessName} has had to cancel your booking ${ref}.\n\n` +
      `Trip: ${details.tripLabel}\n` +
      (when ? `When: ${when}\n` : "") +
      `Pickup: ${details.pickupLabel}\n` +
      `Drop-off: ${details.dropoffLabel}\n\n` +
      `Please contact us if you have any questions about payment.\n\n` +
      `We apologise for the inconvenience and hope to welcome you again soon.\n\n` +
      `${businessName}\n${BUSINESS_WEBSITE}`;
    const html = buildSimpleBrandedEmailHtml({
      title: "Booking cancelled",
      headline: `We're sorry, ${escapeHtml(details.customerName)}`,
      bodyHtml:
        `<p>We have had to cancel booking <strong>${escapeHtml(ref)}</strong>.</p>` +
        `<p>${escapeHtml(details.tripLabel)}${when ? `<br/>${escapeHtml(when)}` : ""}<br/>` +
        `${escapeHtml(details.pickupLabel)} → ${escapeHtml(details.dropoffLabel)}</p>` +
        `<p>Please contact us if you have any questions about payment.</p>`,
      businessName,
    });
    return {
      customer: { subject, text, html },
      owner: buildOwnerCancellationEmail(
        details,
        `Business cancellation — ${details.customerName} — ${ref}`,
        businessName,
      ),
    };
  }

  // Cancel within 24h, no refund
  if (details.cancelBooking && details.refundAmountValue <= 0 && details.within24h) {
    const subject = `Booking Cancellation Confirmed – ${ref}`;
    const text =
      `Hi ${details.customerName},\n\n` +
      `Your booking ${ref} has been cancelled.\n\n` +
      `Customer: ${details.customerName}\n` +
      `Booking reference: ${ref}\n` +
      `Trip: ${details.tripLabel}\n` +
      (when ? `When: ${when}\n` : "") +
      `Pickup: ${details.pickupLabel}\n` +
      `Drop-off: ${details.dropoffLabel}\n\n` +
      `${UNDER_24H_CANCEL_CUSTOMER_NOTICE}\n\n` +
      `If you believe a refund is appropriate in your circumstances, please contact us.\n\n` +
      `Your statutory rights are not affected.\n\n` +
      `${businessName}\n${BUSINESS_WEBSITE}`;
    const html = buildSimpleBrandedEmailHtml({
      title: "Cancellation confirmed",
      headline: `Booking cancelled — ${escapeHtml(ref)}`,
      bodyHtml:
        `<p>Your booking has been cancelled.</p>` +
        `<p>${escapeHtml(details.tripLabel)}${when ? `<br/>${escapeHtml(when)}` : ""}</p>` +
        `<p>${UNDER_24H_CANCEL_CUSTOMER_NOTICE}</p>` +
        `<p>Your statutory rights are not affected. Contact us if you believe a refund is appropriate.</p>`,
      businessName,
    });
    return {
      customer: { subject, text, html },
      owner: buildOwnerCancellationEmail(
        details,
        `Cancellation (<24h, no refund) — ${details.customerName} — ${ref}`,
        businessName,
      ),
    };
  }

  // Cancel >24h with full refund (explicit parentheses — avoid && / || precedence bugs)
  if (
    details.cancelBooking &&
    details.refundAmountValue > 0 &&
    !details.within24h &&
    (details.remainingPaid.replace(/[^\d.]/g, "") === "0" ||
      details.originalAmountValue - details.refundAmountValue < 0.01)
  ) {
    const { intentText, intentHtml, refundType } = buildCustomerRefundIntentCopy(details);
    const detailsBlock = buildCustomerRefundDetailsBlock(details);
    const subject = `Cancellation & Refund – ${ref}`;
    const text =
      `Hi ${details.customerName},\n\n` +
      `${intentText}\n\n` +
      `Your cancellation was received at least 24 hours before pickup.\n\n` +
      `${detailsBlock.text}\n` +
      `We'd be glad to welcome you again — book anytime at ${BUSINESS_WEBSITE}.\n\n` +
      `${businessName}\n${BUSINESS_WEBSITE}`;
    const html = buildSimpleBrandedEmailHtml({
      title: refundType,
      headline: `Booking cancelled — full refund`,
      bodyHtml:
        intentHtml +
        `<p>Your cancellation was received at least 24 hours before pickup.</p>` +
        detailsBlock.html +
        `<p>We'd love to welcome you again soon.</p>`,
      businessName,
    });
    return {
      customer: { subject, text, html },
      owner: buildOwnerCancellationEmail(
        details,
        `Cancellation & refund — ${details.customerName} — ${details.refundAmount}`,
        businessName,
      ),
    };
  }

  // Partial or full refund while booking may remain active or be cancelled
  if (details.refundAmountValue > 0) {
    const { fullyRefunded, intentText, intentHtml, refundType } =
      buildCustomerRefundIntentCopy(details);
    const detailsBlock = buildCustomerRefundDetailsBlock(details);
    const remainsActive = details.bookingRemainsActive && !details.cancelBooking;

    const subject =
      details.cancelBooking
        ? `Cancellation & Refund – ${ref}`
        : fullyRefunded && remainsActive
          ? `Full Refund Issued – Booking Remains Confirmed – ${ref}`
          : fullyRefunded
            ? `Full Refund Issued – ${ref}`
            : `Partial Refund Issued – ${ref}`;

    const text =
      `Hi ${details.customerName},\n\n` +
      `${intentText}\n\n` +
      `${detailsBlock.text}\n` +
      `${businessName}\n${BUSINESS_WEBSITE}`;

    const html = buildSimpleBrandedEmailHtml({
      title: refundType,
      headline: `${escapeHtml(refundType)} — ${escapeHtml(ref)}`,
      bodyHtml: intentHtml + detailsBlock.html,
      businessName,
    });

    return {
      customer: { subject, text, html },
      owner: buildOwnerCancellationEmail(
        details,
        `${refundType} — ${details.customerName} — ${details.refundAmount}`,
        businessName,
      ),
    };
  }

  // Cancel without refund outside the <24h template (e.g. goodwill cancel £0)
  if (details.cancelBooking) {
    const subject = `Booking Cancellation Confirmed – ${ref}`;
    const text =
      `Hi ${details.customerName},\n\n` +
      `Your booking ${ref} has been cancelled.\n\n` +
      `Customer: ${details.customerName}\n` +
      `Booking reference: ${ref}\n` +
      `Trip: ${details.tripLabel}\n` +
      (when ? `When: ${when}\n` : "") +
      `Pickup: ${details.pickupLabel}\n` +
      `Drop-off: ${details.dropoffLabel}\n\n` +
      `No refund was issued for this cancellation.\n\n` +
      `${businessName}\n${BUSINESS_WEBSITE}`;
    return {
      customer: {
        subject,
        text,
        html: buildSimpleBrandedEmailHtml({
          title: "Cancellation confirmed",
          headline: `Booking cancelled — ${escapeHtml(ref)}`,
          bodyHtml: `<p>Your booking has been cancelled. No refund was issued for this cancellation.</p>`,
          businessName,
        }),
      },
      owner: buildOwnerCancellationEmail(
        details,
        `Cancellation (no refund) — ${details.customerName} — ${ref}`,
        businessName,
      ),
    };
  }

  return { customer: null, owner: null };
}

function buildSimpleBrandedEmailHtml(input: {
  title: string;
  headline: string;
  bodyHtml: string;
  businessName: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(input.title)} — ${escapeHtml(input.businessName)}</title></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1a2b3c;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
<tr><td style="background:${NAVY};padding:28px 32px;text-align:center;">
<img src="${LOGO_URL}" alt="${escapeHtml(input.businessName)}" height="72" style="display:block;margin:0 auto;height:72px;width:auto;" />
<div style="margin-top:16px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${ACCENT};font-weight:bold;">${escapeHtml(input.title)}</div>
<div style="margin-top:8px;font-size:22px;line-height:1.35;color:#ffffff;font-weight:bold;">${input.headline}</div>
</td></tr>
<tr><td style="padding:28px 32px;font-size:15px;line-height:1.7;color:#334155;">${input.bodyHtml}</td></tr>
<tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 32px;font-size:13px;color:#64748b;">
<strong style="color:${NAVY};">${escapeHtml(input.businessName)}</strong><br />
<a href="${BUSINESS_WEBSITE}" style="color:${NAVY};">${BUSINESS_WEBSITE.replace(/^https:\/\//, "")}</a>
</td></tr>
</table></td></tr></table>
</body></html>`;
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
  bookedPickupTime?: string;
  pickupLabel?: string;
  isAirportPickup?: boolean;
  airportCode?: string | null;
  airportAccessOption?: CompanyVoiceAirportAccessOption | null;
  expressDropOffSelected?: boolean | null;
  expressDropOffAirport?: string | null;
  expressDropOffFee?: number | null;
  dublinArrivalTerminal?: "T1" | "T2" | string | null;
  /** @deprecated Operator identity must not appear in customer email. */
  driverFirstName?: string;
  /** @deprecated Not shown to customers — kept optional for call-site compatibility. */
  driverMobile?: string;
  /** @deprecated Vehicle details must not appear in customer email. */
  vehicleColour?: string;
  /** @deprecated Vehicle details must not appear in customer email. */
  partialRegistration?: string;
  /**
   * @deprecated Website GPS tracking is retired — ignored for Driver on the way email.
   */
  trackUrl?: string;
};

/** Customer message when the driver taps Arrived at Pickup. */
export function buildDriverArrivedPickupEmail(
  details: ArrivalNotificationDetails,
  businessName = "My Airport Taxi NI",
): CustomerPaidBookingEmail {
  void details.driverFirstName;
  void details.driverMobile;
  void details.vehicleColour;
  void details.partialRegistration;
  void details.trackUrl;
  const booking = {
    customerName: details.customerName,
    bookedPickupTime: details.bookedPickupTime,
    pickupLabel: details.pickupLabel,
    isAirportPickup: details.isAirportPickup,
    airportCode: details.airportCode,
    airportAccessOption: details.airportAccessOption,
    expressDropOffSelected: details.expressDropOffSelected,
    expressDropOffAirport: details.expressDropOffAirport,
    expressDropOffFee: details.expressDropOffFee,
    dublinArrivalTerminal: details.dublinArrivalTerminal,
  };
  const airportPickup = isCompanyVoiceAirportPickup(booking);
  const statusHeading = airportPickup ? AIRPORT_PICKUP_HEADING : "Your driver has arrived";
  const subject = airportPickup
    ? `${AIRPORT_PICKUP_HEADING} — ${businessName}`
    : `Your driver has arrived — ${businessName}`;
  const bodyLine = buildArrivedCompanyVoiceEmailBody(booking);

  const text = `${bodyLine}\n\n${journeyStatusContactText(businessName)}`;

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
              <div style="margin-top:8px;font-size:22px;line-height:1.35;color:#ffffff;font-weight:bold;">${escapeHtml(statusHeading)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px;font-size:15px;line-height:1.7;color:#334155;">
              <p style="margin:0;">${escapeHtml(bodyLine)}</p>
            </td>
          </tr>
          ${journeyStatusContactHtml(businessName)}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}

/**
 * Customer message when driver/owner marks Driver on the way.
 * Company voice only — identical for owner-operated and assigned-driver journeys.
 * Website GPS / Track Your Driver links are retired; WhatsApp Live Location is optional (“may”).
 */
export function buildDriverOnTheWayEmail(
  details: ArrivalNotificationDetails,
  businessName = "My Airport Taxi NI",
): CustomerPaidBookingEmail {
  void details.trackUrl;
  void details.driverMobile;
  void details.driverFirstName;
  void details.vehicleColour;
  void details.partialRegistration;
  const subject = `Your driver is on the way — ${businessName}`;
  const statusHeading = "Your driver is on the way";
  const bodyLine = buildOnTheWayCompanyVoiceMessage({
    customerName: details.customerName,
    bookedPickupTime: details.bookedPickupTime,
  });

  const text = `${bodyLine}\n\n${journeyStatusContactText(businessName)}`;

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
              <div style="margin-top:8px;font-size:22px;line-height:1.35;color:#ffffff;font-weight:bold;">${escapeHtml(statusHeading)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px;font-size:15px;line-height:1.7;color:#334155;">
              <p style="margin:0;">${escapeHtml(bodyLine)}</p>
              <p style="margin:16px 0 0;font-size:14px;color:#64748b;">
                WhatsApp contact and live location sharing, when used, are sent by My Airport Taxi NI — they are not automatic and are not a website tracking link.
              </p>
            </td>
          </tr>
          ${journeyStatusContactHtml(businessName)}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}

/** Customer email after a confirmed booking amendment (auto or resend). */
export function buildUpdatedBookingConfirmationEmail(
  receipt: PaidBookingReceipt,
  businessName = "My Airport Taxi NI",
  options?: {
    trackUrl?: string;
    manageUrl?: string;
    /** Concise “What changed” bullets (optional). */
    whatChanged?: string[];
    /** Fare position line, e.g. "No change to your fare" / "Additional payment received: £14". */
    fareNote?: string;
  },
): CustomerPaidBookingEmail {
  const base = buildCustomerConfirmationEmail(receipt, businessName, options);
  const displayRef =
    receipt.customerReference?.trim().toUpperCase() || receipt.paymentReference;
  const subject = `Updated Booking Confirmation – ${displayRef}`;
  const whatChangedBlock =
    options?.whatChanged && options.whatChanged.length > 0
      ? `What changed\n${options.whatChanged.map((line) => `• ${line}`).join("\n")}\n\n`
      : "";
  const fareBlock = options?.fareNote ? `${options.fareNote}\n\n` : "";
  const intro =
    `Dear ${receipt.customerName},\n\n` +
    `Your booking has been updated.\n\n` +
    fareBlock +
    whatChangedBlock +
    `Please review the updated journey details below.\n\n`;

  const detailsStart = base.text.indexOf("BOOKING DETAILS");
  const text =
    detailsStart >= 0
      ? intro + base.text.slice(detailsStart)
      : intro +
        base.text.replace(
          /^Dear [^\n]+,\n\n[\s\S]*?\n\nPlease find your invoice details below\.\n\n/,
          "",
        );

  let html = base.html
    .replace(
      /Your card payment has been received and your transfer is confirmed\.?/i,
      "Your booking has been updated. Please review the updated journey details below.",
    )
    .replace(/Thank you for your booking with [^.<]+?\./i, "Your booking has been updated.")
    .replace(
      /(<div style="margin-top:8px;font-size:22px;line-height:1\.35;color:#ffffff;font-weight:bold;">)([^<]*)(<\/div>)/,
      `$1Your booking has been updated$3`,
    );

  if (options?.fareNote || (options?.whatChanged && options.whatChanged.length > 0)) {
    const extraBits: string[] = [];
    if (options.fareNote) {
      extraBits.push(
        `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#334155;"><strong>${escapeHtml(options.fareNote)}</strong></p>`,
      );
    }
    if (options.whatChanged && options.whatChanged.length > 0) {
      extraBits.push(
        `<p style="margin:0 0 6px;font-size:13px;letter-spacing:0.04em;text-transform:uppercase;color:#64748b;">What changed</p>`,
        `<ul style="margin:0 0 16px;padding-left:18px;color:#334155;font-size:14px;line-height:1.6;">${options.whatChanged
          .map((line) => `<li>${escapeHtml(line)}</li>`)
          .join("")}</ul>`,
      );
    }
    html = html.replace(
      /(Your booking has been updated\. Please review the updated journey details below\.)/i,
      `$1${extraBits.join("")}`,
    );
  }

  return { subject, text, html };
}
