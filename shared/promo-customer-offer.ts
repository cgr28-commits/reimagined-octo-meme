/**
 * "Send codes to my customer list" (owner, 16 Nov 2026): a thank-you offer emailed to people who
 * have already booked, each with their own email-bound promo code. Pure rules + the email itself;
 * storage and sending live in workers/addresses/src/promo-customer-send.ts.
 */
import {
  BRAND_EMERALD,
  BRAND_NAVY,
  BUSINESS_MAILBOX,
  BUSINESS_NAME,
  BUSINESS_WEBSITE,
  brandFrameEmailHtml,
  businessEmailClientMeta,
  businessEmailLogoHtml,
} from "./business-email";
import { formatPromoExpiryDate, formatPromoPercent, normalizePromoEmail } from "./promo-code";
import { promoBookingUrl } from "./promo-email";

/** Default life of a customer-list code (owner asked for 2 weeks). */
export const CUSTOMER_OFFER_DEFAULT_VALIDITY_DAYS = 14;
/** Codes sent per request; the dashboard loops batches so no single request runs long. */
export const CUSTOMER_OFFER_BATCH_MAX = 20;
export const CUSTOMER_OFFER_SOURCE = "customer-list";

export type CustomerOfferExclusion =
  | "owner_address"
  | "refunded_or_cancelled"
  | "unsubscribed"
  | "has_active_code"
  | "already_used_code"
  | "blocked_code";

export const CUSTOMER_OFFER_EXCLUSION_LABEL: Record<CustomerOfferExclusion, string> = {
  owner_address: "Your own address",
  refunded_or_cancelled: "Cancelled or refunded",
  unsubscribed: "Unsubscribed from offers",
  has_active_code: "Already has a live code",
  already_used_code: "Already used a code",
  blocked_code: "Code was deactivated",
};

/** Hard exclusions can never be sent, even if the owner ticks them. */
export const CUSTOMER_OFFER_HARD_EXCLUSIONS: ReadonlySet<CustomerOfferExclusion> = new Set([
  "owner_address",
  "unsubscribed",
  "has_active_code",
  "already_used_code",
  "blocked_code",
]);

export type CustomerOfferBooking = {
  customerName?: string;
  customerEmail?: string;
  tripDate?: string;
  createdAt?: string;
  operationalStatus?: string;
  paymentStatus?: string;
  amountRefunded?: number;
  cancelledAt?: string;
  refundedAt?: string;
};

export type CustomerOfferCandidate = {
  email: string;
  name: string;
  bookings: number;
  lastTripDate: string;
  /** Every booking this customer made was cancelled or refunded. */
  refundedOrCancelled: boolean;
};

export function bookingCancelledOrRefunded(b: CustomerOfferBooking): boolean {
  return (
    b.operationalStatus === "cancelled" ||
    b.paymentStatus === "fully_refunded" ||
    Boolean(b.cancelledAt)
  );
}

const OWNER_DOMAINS = ["myairporttaxini.co.uk"];

export function isOwnerAddress(email: string, extraOwnerEmails: string[] = []): boolean {
  const e = normalizePromoEmail(email);
  if (!e) return false;
  const domain = e.split("@")[1] ?? "";
  if (OWNER_DOMAINS.includes(domain)) return true;
  return extraOwnerEmails.map((x) => normalizePromoEmail(x)).filter(Boolean).includes(e);
}

/** One row per customer email (newest trip first). A customer counts as cancelled only if every booking was. */
export function customersFromBookings(bookings: CustomerOfferBooking[]): CustomerOfferCandidate[] {
  const byEmail = new Map<string, CustomerOfferCandidate & { live: number }>();
  for (const b of bookings) {
    const email = normalizePromoEmail(b.customerEmail);
    if (!email) continue;
    const row = byEmail.get(email) ?? { email, name: "", bookings: 0, lastTripDate: "", refundedOrCancelled: false, live: 0 };
    row.bookings += 1;
    if (!bookingCancelledOrRefunded(b)) row.live += 1;
    const trip = String(b.tripDate ?? "");
    if (trip > row.lastTripDate) {
      row.lastTripDate = trip;
      if (b.customerName?.trim()) row.name = b.customerName.trim();
    }
    if (!row.name && b.customerName?.trim()) row.name = b.customerName.trim();
    byEmail.set(email, row);
  }
  return [...byEmail.values()]
    .map(({ live, ...row }) => ({ ...row, refundedOrCancelled: live === 0 }))
    .sort((a, b) => b.lastTripDate.localeCompare(a.lastTripDate) || a.email.localeCompare(b.email));
}

export function firstName(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  if (!first || /^(mr|mrs|ms|miss|dr)\.?$/i.test(first)) return "";
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

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

export function buildCustomerOfferEmail(input: {
  code: string;
  expiresAt: string;
  discountRate: number;
  minimumVehicleFareGbp: number;
  name?: string;
  hasExcludedDates?: boolean;
  unsubscribeUrl: string;
  siteUrl?: string;
}): { subject: string; text: string; html: string } {
  const site = (input.siteUrl || BUSINESS_WEBSITE).replace(/\/$/, "");
  const pct = formatPromoPercent(input.discountRate);
  const expiry = formatPromoExpiryDate(input.expiresAt);
  const bookUrl = promoBookingUrl(site, input.code);
  const minimum = pounds(Math.round(input.minimumVehicleFareGbp * 100) / 100);
  const first = firstName(input.name ?? "");
  const greeting = first ? `Hi ${first},` : "Hello,";
  const subject = `A thank-you from ${BUSINESS_NAME}: ${pct} off your next journey`;
  const terms =
    `${pct} off the vehicle fare. Airport charges are excluded. Minimum eligible vehicle fare ${minimum}. One use per customer.` +
    (input.hasExcludedDates ? " Some peak travel dates are excluded; you'll see this when you enter the code." : "") +
    " The code is linked to this email address, so please book using it.";
  const why = `You're receiving this because you've booked with ${BUSINESS_NAME}.`;

  const text =
    `${greeting}\n\n` +
    `Thank you for travelling with ${BUSINESS_NAME}. As a thank-you, here's ${pct} off your next journey with us.\n\n` +
    `Your code:\n\n${input.code}\n\n` +
    `Valid until ${expiry}.\n\n` +
    `Get your price on our website and enter the code at checkout.\n\n` +
    `Book online: ${bookUrl}\n\n` +
    `${terms}\n\n` +
    `${BUSINESS_NAME}\n${site}\n\n` +
    `${why} Don't want offers from us? Unsubscribe: ${input.unsubscribeUrl}`;

  const card = `<!doctype html><html><head><meta charset="utf-8">${businessEmailClientMeta()}<title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f7fa;font-family:Arial,Helvetica,sans-serif;color:${BRAND_NAVY};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fa;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;">
<tr><td bgcolor="${BRAND_NAVY}" style="background:${BRAND_NAVY};padding:22px 24px;text-align:center;">${businessEmailLogoHtml()}</td></tr>
<tr><td style="padding:28px 24px 8px;font-size:15px;line-height:1.6;color:${BRAND_NAVY};">
<p style="margin:0 0 14px;">${esc(greeting)}</p>
<p style="margin:0 0 14px;">Thank you for travelling with ${esc(BUSINESS_NAME)}. As a thank-you, here's <strong>${esc(pct)} off your next journey</strong> with us.</p>
<p style="margin:0 0 10px;">Your code:</p>
</td></tr>
<tr><td align="center" style="padding:4px 24px 6px;">
<table role="presentation" cellpadding="0" cellspacing="0" style="border:2px dashed ${BRAND_EMERALD};border-radius:12px;background:#f2fbf4;"><tr>
<td style="padding:16px 26px;font-family:'Courier New',Courier,monospace;font-size:26px;letter-spacing:3px;font-weight:bold;color:${BRAND_NAVY};">${esc(input.code)}</td>
</tr></table>
</td></tr>
<tr><td style="padding:14px 24px 4px;font-size:15px;line-height:1.6;color:${BRAND_NAVY};">
<p style="margin:0 0 12px;">Valid until <strong>${esc(expiry)}</strong>.</p>
<p style="margin:0 0 18px;">Get your price on our website and enter the code at checkout.</p>
<p style="margin:0 0 22px;text-align:center;"><a href="${esc(bookUrl)}" style="display:inline-block;background:${BRAND_EMERALD};color:#ffffff;-webkit-text-fill-color:#ffffff;text-decoration:none;font-weight:bold;font-size:16px;padding:14px 28px;border-radius:10px;">Book online</a></p>
<p style="margin:0 0 18px;font-size:12px;line-height:1.5;color:#5b6b80;">${esc(terms)}</p>
</td></tr>
<tr><td style="padding:0 24px 18px;font-size:14px;color:${BRAND_NAVY};"><p style="margin:0;font-weight:bold;">${esc(BUSINESS_NAME)}</p></td></tr>
<tr><td style="padding:14px 24px;border-top:1px solid #e6e9ee;font-size:12px;line-height:1.5;color:#5b6b80;">${esc(why)} Don't want offers from us? <a href="${esc(input.unsubscribeUrl)}" style="color:#5b6b80;">Unsubscribe</a>.</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html: brandFrameEmailHtml(card) };
}

/** Sample code used only in the owner's test email (never stored, never valid at checkout). */
export const CUSTOMER_OFFER_SAMPLE_CODE = "MATNI-SAMP-LE00";
export const CUSTOMER_OFFER_TEST_TO_DEFAULT = BUSINESS_MAILBOX;
