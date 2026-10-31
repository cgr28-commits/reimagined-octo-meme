/**
 * Unfinished payments: a customer reached the SumUp card page but didn't pay.
 *
 * 10 minutes later (cron, every 5 minutes) the owner gets an email with the customer's
 * contact details and journey, and the customer gets one "finish your booking" email with
 * a link back to a fixed price. Once per customer per journey; never when they went on to
 * pay, for past journeys, or for £1 owner test payments.
 */
import {
  BRAND_EMERALD,
  BRAND_NAVY,
  BUSINESS_MAILBOX,
  BUSINESS_PHONE_DISPLAY,
  BUSINESS_WEBSITE,
  businessEmailClientMeta,
  businessEmailLogoHtml,
  lightCustomerEmailHtml,
} from "./business-email";
import { emailTypoSuggestion, isUsableEmailAddress } from "./email-typo";
import { formatUkDateTime } from "./uk-time";

export const UNFINISHED_PAYMENT_DELAY_MS = 10 * 60 * 1000;
/** Older checkouts are left alone (the cron only looks back this far). */
export const UNFINISHED_PAYMENT_LOOKBACK_MS = 24 * 60 * 60 * 1000;

export type UnfinishedCheckoutInput = {
  checkoutId: string;
  amount: number;
  createdAt: string;
  checkoutReference?: string;
  finalizedAt?: string;
  paymentReference?: string;
  unfinishedAlertSentAt?: string;
  booking: {
    customerName?: string;
    customerEmail?: string;
    mobileNumber?: string;
    tripLabel?: string;
    pickupLabel?: string;
    dropoffLabel?: string;
    tripDate?: string;
    tripTime?: string;
    returnJourney?: boolean;
    returnDate?: string;
    returnTime?: string;
    vehicle?: string;
  };
};

export type UnfinishedGroup<T extends UnfinishedCheckoutInput> = {
  /** The most recent attempt — used for the alert and the customer email. */
  latest: T;
  /** Every unpaid attempt by this customer in the window (all get marked as alerted). */
  attempts: T[];
};

function customerKey(c: UnfinishedCheckoutInput): string {
  const email = String(c.booking.customerEmail ?? "").trim().toLowerCase();
  if (email) return `e:${email}`;
  return `n:${String(c.booking.customerName ?? "").trim().toLowerCase()}|${c.booking.tripDate ?? ""}`;
}

function isOwnerTest(c: UnfinishedCheckoutInput): boolean {
  if (Math.abs(c.amount - 1) < 0.001) return true;
  return /\[?\s*TEST\s*£?\s*1\s*\]?/i.test(`${c.booking.tripLabel ?? ""} ${c.checkoutReference ?? ""}`);
}

function londonToday(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/**
 * Which customers to alert about now. `records` is the recent pending-checkout list
 * (paid and unpaid); a customer who paid for any checkout around the same time is skipped.
 */
export function selectUnfinishedCheckouts<T extends UnfinishedCheckoutInput>(records: T[], now = new Date()): UnfinishedGroup<T>[] {
  const nowMs = now.getTime();
  const today = londonToday(now);
  const paidKeys = new Set(
    records.filter((r) => r.finalizedAt || r.paymentReference).map((r) => customerKey(r)),
  );
  const groups = new Map<string, T[]>();
  for (const r of records) {
    const created = Date.parse(r.createdAt);
    if (!Number.isFinite(created)) continue;
    if (nowMs - created < UNFINISHED_PAYMENT_DELAY_MS || nowMs - created > UNFINISHED_PAYMENT_LOOKBACK_MS) continue;
    if (r.finalizedAt || r.paymentReference || isOwnerTest(r)) continue;
    if (r.booking.tripDate && r.booking.tripDate < today) continue;
    const key = customerKey(r);
    if (paidKeys.has(key)) continue;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const out: UnfinishedGroup<T>[] = [];
  for (const attempts of groups.values()) {
    // Already alerted for this customer: never again for the same attempts.
    if (attempts.some((a) => a.unfinishedAlertSentAt)) continue;
    const sorted = [...attempts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    out.push({ latest: sorted[0]!, attempts: sorted });
  }
  return out;
}

function money(amount: number): string {
  return `£${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
}

function when(date?: string, time?: string): string {
  const d = String(date ?? "").trim();
  const t = String(time ?? "").trim();
  if (!d) return "date not given";
  return (t ? formatUkDateTime(d, t) : "") || [d, t].filter(Boolean).join(" at ");
}

function firstName(name?: string): string {
  return String(name ?? "").trim().split(/\s+/)[0] || "there";
}

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function unfinishedReason(sumUpStatus: string | undefined): string {
  const s = String(sumUpStatus ?? "").toUpperCase();
  if (s === "FAILED" || s === "DECLINED") return "Card payment failed";
  if (s === "EXPIRED" || s === "CANCELLED" || s === "CANCELED") return "Payment page expired / cancelled";
  return "Left the payment page without paying";
}

export function buildOwnerUnfinishedPaymentEmail(input: {
  checkout: UnfinishedCheckoutInput;
  attempts: number;
  sumUpStatus?: string;
  customerEmailed: boolean;
  resumeUrl: string;
}): { subject: string; body: string } {
  const b = input.checkout.booking;
  const email = String(b.customerEmail ?? "").trim();
  const typo = email ? emailTypoSuggestion(email) : null;
  const subject = `Unfinished booking — ${b.customerName || "customer"}, ${money(input.checkout.amount)} — My Airport Taxi NI`;
  const lines = [
    "A customer reached the card payment page but didn't pay.",
    "",
    `Why: ${unfinishedReason(input.sumUpStatus)}${input.attempts > 1 ? ` (${input.attempts} attempts)` : ""}`,
    "",
    `Name: ${b.customerName || "—"}`,
    `Mobile: ${b.mobileNumber || "—"}`,
    `Email: ${email || "—"}${typo ? `  ⚠ looks wrong — probably ${typo}` : !email || !isUsableEmailAddress(email) ? "  ⚠ not a usable address" : ""}`,
    "",
    `Journey: ${b.pickupLabel || "—"} → ${b.dropoffLabel || "—"}`,
    `Pickup: ${when(b.tripDate, b.tripTime)}`,
    b.returnJourney ? `Return: ${when(b.returnDate, b.returnTime)}` : "One way",
    b.vehicle ? `Vehicle: ${b.vehicle}` : "",
    `Fare shown: ${money(input.checkout.amount)}`,
    "",
    input.customerEmailed
      ? "We've emailed the customer a link to finish booking:"
      : "We couldn't email the customer (no usable email) — a call or WhatsApp is the way to reach them. Booking link:",
    input.resumeUrl,
    "",
    "Nothing has been charged. Give them a call if you'd like to help them book.",
  ];
  return { subject, body: lines.filter((l, i, all) => l !== "" || all[i - 1] !== "").join("\n") };
}

export function buildCustomerFinishBookingEmail(input: {
  checkout: UnfinishedCheckoutInput;
  resumeUrl: string;
  /** Price the link holds, when known (omitted when the link opens a fresh quote). */
  priceLabel?: string;
}): { subject: string; text: string; html: string } {
  const b = input.checkout.booking;
  const first = firstName(b.customerName);
  const journey = `${b.pickupLabel || ""} → ${b.dropoffLabel || ""}`;
  const pickup = when(b.tripDate, b.tripTime);
  const subject = "Your booking isn't finished yet — My Airport Taxi NI";
  const priceLine = input.priceLabel ? `Your fixed price of ${input.priceLabel} is still available.` : "Your fixed price is ready when you are.";
  const text = [
    `Hi ${first},`,
    "",
    "It looks like your airport transfer booking wasn't completed, and you haven't been charged.",
    "",
    `${journey}`,
    `Pickup: ${pickup}`,
    "",
    priceLine,
    "Finish your booking here:",
    input.resumeUrl,
    "",
    `If the card payment didn't work or you'd rather book another way, just reply to this email or call or WhatsApp us on ${BUSINESS_PHONE_DISPLAY}.`,
    "",
    "My Airport Taxi NI",
    BUSINESS_WEBSITE,
  ].join("\n");
  const html = lightCustomerEmailHtml(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
${businessEmailClientMeta()}
<title>Finish your booking — My Airport Taxi NI</title></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1a2b3c;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
<tr><td style="background:${BRAND_NAVY};padding:28px 32px;text-align:center;">
${businessEmailLogoHtml()}
<div style="margin-top:16px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND_EMERALD};font-weight:bold;">Booking not finished</div>
<div style="margin-top:8px;font-size:22px;line-height:1.35;color:#ffffff;font-weight:bold;">Hi ${esc(first)}, your booking isn't finished yet</div>
</td></tr>
<tr><td style="padding:28px 32px;font-size:15px;line-height:1.7;color:#334155;">
<p>It looks like your airport transfer booking wasn't completed, and you haven't been charged.</p>
<p><strong>${esc(journey)}</strong><br/>Pickup: ${esc(pickup)}</p>
<p>${esc(priceLine)}</p>
<p style="margin:24px 0 8px;text-align:center;">
<a href="${esc(input.resumeUrl)}" style="display:inline-block;background:${BRAND_NAVY};color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;padding:14px 28px;border-radius:8px;">Finish my booking</a>
</p>
<p style="margin:16px 0 0;font-size:14px;color:#64748b;">If the card payment didn't work or you'd rather book another way, just reply to this email or call or WhatsApp us on ${esc(BUSINESS_PHONE_DISPLAY)}.</p>
</td></tr>
<tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 32px;font-size:13px;color:#64748b;">
<strong style="color:${BRAND_NAVY};">My Airport Taxi NI</strong><br />
<a href="${BUSINESS_WEBSITE}" style="color:${BRAND_NAVY};">${BUSINESS_WEBSITE.replace(/^https:\/\//, "")}</a> ·
<a href="mailto:${BUSINESS_MAILBOX}" style="color:${BRAND_NAVY};">${BUSINESS_MAILBOX}</a>
</td></tr>
</table></td></tr></table>
</body></html>`);
  return { subject, text, html };
}
