/**
 * Card balance for "Pay a deposit" bookings (paymentMethod DEPOSIT_CARD_BALANCE).
 *
 * Timeline (from the live pickup date/time, so amendments move it):
 *   7 days before  → email a secure link to pay the balance by card
 *   5 days before  → reminder
 *   4 days before  → final reminder (+ owner heads-up)
 *   3 days before  → still unpaid: booking cancelled automatically, deposit kept
 *
 * The link opens /card-balance/pay on the Worker, which creates (or reuses) a SumUp
 * hosted checkout for the balance at that moment and redirects to it. Payment is
 * confirmed by the SumUp webhook, the browser return, or the hourly cron poll.
 *
 * Storage: one small KV queue key (one read when nothing is due), one index key per
 * balance checkout so the shared SumUp webhook can route it here.
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
} from "../shared/business-email";
import { formatPaidAmount } from "../shared/booking-notifications";
import {
  CARD_BALANCE_CANCEL_DAYS_BEFORE,
  cardBalanceSchedule,
  formatUkDateLong,
  formatUkInstant,
  isDepositCardBalancePaymentMethod,
  remainingCardBalanceGbp,
  type CardBalanceState,
} from "../shared/deposit-card-balance";
import { formatGbpAmountExact } from "../shared/gbp";
import type { PaidBookingAdditionalPayment, PaidBookingRecord } from "../shared/paid-booking-record";
import { grossAmountCollectedOf } from "../shared/paid-booking-record";
import { resolveOperationalStatus } from "../shared/refund-ops";
import {
  buildCheckoutReference,
  createSumUpHostedCheckout,
  getSumUpCheckout,
  getSuccessfulTransactionCode,
  getSuccessfulTransactionId,
  isSumUpCheckoutPaid,
  refundSumUpTransaction,
  type SumUpCheckoutDetails,
} from "../shared/sumup-checkout";
import { formatUkDateTime } from "../shared/uk-time";
import { getPaidBookingRecord, savePaidBookingRecord } from "./paid-booking-store";
import {
  trySendOwnerOperationalEmail,
  trySendResendOnlyCustomerEmail,
  type WorkerEmailEnv,
} from "./worker-email";

export const CARD_BALANCE_QUEUE_KEY = "card-balance:queue";
const CHECKOUT_INDEX_PREFIX = "card-balance-checkout:";
const WORKER_PUBLIC_ORIGIN = "https://reimagined-octo-meme.cgr28.workers.dev";
const OWNER_INBOX = "bookings@myairporttaxini.co.uk";
const MAX_QUEUE = 400;
const MAX_ACTIONS_PER_RUN = 10;

export type CardBalanceEnv = WorkerEmailEnv & {
  TRACKING_STORE?: KVNamespace;
  SUMUP_API_KEY?: string;
  SUMUP_MERCHANT_CODE?: string;
  SITE_ORIGIN?: string;
};

type QueueEntry = { ref: string; addedAt: string };

/** Cancels the booking with no refund. Injected so this module never imports the refund engine. */
export type CancelUnpaidBookingFn = (input: {
  paymentReference: string;
  customerFacingReason: string;
  ownerNotes: string;
}) => Promise<{ ok: boolean; error?: string }>;

function siteOrigin(env: CardBalanceEnv): string {
  return (env.SITE_ORIGIN?.trim() || "https://www.myairporttaxini.co.uk").replace(/\/+$/, "");
}

function randomToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function readQueue(store: KVNamespace): Promise<QueueEntry[]> {
  const value = await store.get<QueueEntry[]>(CARD_BALANCE_QUEUE_KEY, "json");
  return Array.isArray(value) ? value : [];
}

/** Add a newly confirmed deposit booking to the balance queue (idempotent). */
export async function enqueueCardBalanceBooking(store: KVNamespace, paymentReference: string): Promise<void> {
  const ref = paymentReference.trim();
  if (!ref) return;
  const queue = await readQueue(store);
  if (queue.some((e) => e.ref === ref)) return;
  queue.push({ ref, addedAt: new Date().toISOString() });
  await store.put(CARD_BALANCE_QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE)));
}

function isOpenState(state: CardBalanceState | undefined): boolean {
  return !state || state.status === "scheduled" || state.status === "link_sent";
}

function isBookingCancelled(record: PaidBookingRecord): boolean {
  return (
    resolveOperationalStatus(record) === "cancelled" ||
    record.status === "refunded" ||
    record.status === "cancelled"
  );
}

async function saveState(
  store: KVNamespace,
  record: PaidBookingRecord,
  patch: Partial<CardBalanceState>,
  extra: Partial<PaidBookingRecord> = {},
): Promise<PaidBookingRecord> {
  const base: CardBalanceState = record.cardBalance ?? {
    status: "scheduled",
    depositPercentUsed: 20,
    balanceAtBookingGbp: remainingCardBalanceGbp(record),
  };
  const updated: PaidBookingRecord = { ...record, ...extra, cardBalance: { ...base, ...patch } };
  await savePaidBookingRecord(store, updated);
  return updated;
}

/** Secure customer link: Worker endpoint that opens SumUp for the current balance. */
export function cardBalancePayUrl(record: PaidBookingRecord, payToken: string): string {
  const url = new URL("/card-balance/pay", WORKER_PUBLIC_ORIGIN);
  url.searchParams.set("ref", record.paymentReference);
  url.searchParams.set("t", payToken);
  return url.toString();
}

async function ensurePayToken(store: KVNamespace, record: PaidBookingRecord): Promise<{ record: PaidBookingRecord; token: string }> {
  const existing = record.cardBalance?.payToken;
  if (existing) return { record, token: existing };
  const token = randomToken();
  const updated = await saveState(store, record, { payToken: token });
  return { record: updated, token };
}

function payTokenOf(record: PaidBookingRecord): string {
  return String(record.cardBalance?.payToken ?? "");
}

// ── Emails ────────────────────────────────────────────────────────────────

type CustomerEmailKind = "link" | "reminder" | "final" | "paid";

function customerEmailShell(title: string, eyebrow: string, heading: string, bodyHtml: string): string {
  return lightCustomerEmailHtml(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
${businessEmailClientMeta()}
<title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1a2b3c;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
<tr><td style="background:${BRAND_NAVY};padding:28px 32px;text-align:center;">
${businessEmailLogoHtml()}
<div style="margin-top:16px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND_EMERALD};font-weight:bold;">${esc(eyebrow)}</div>
<div style="margin-top:8px;font-size:22px;line-height:1.35;color:#ffffff;font-weight:bold;">${esc(heading)}</div>
</td></tr>
<tr><td style="padding:28px 32px;font-size:15px;line-height:1.7;color:#334155;">
${bodyHtml}
<p style="margin:16px 0 0;font-size:14px;color:#64748b;">Any questions? Just reply to this email, or call us on ${esc(BUSINESS_LANDLINE_DISPLAY)}, or WhatsApp us on ${esc(BUSINESS_PHONE_DISPLAY)}.</p>
</td></tr>
<tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 32px;font-size:13px;color:#64748b;">
<strong style="color:${BRAND_NAVY};">My Airport Taxi NI</strong><br />
<a href="${BUSINESS_WEBSITE}" style="color:${BRAND_NAVY};">${BUSINESS_WEBSITE.replace(/^https:\/\//, "")}</a> ·
<a href="mailto:${BUSINESS_MAILBOX}" style="color:${BRAND_NAVY};">${BUSINESS_MAILBOX}</a>
</td></tr>
</table></td></tr></table>
</body></html>`);
}

export function buildCardBalanceCustomerEmail(input: {
  kind: CustomerEmailKind;
  record: PaidBookingRecord;
  balanceGbp: number;
  payUrl?: string;
}): { subject: string; text: string; html: string } {
  const r = input.record;
  const first = String(r.customerName ?? "").trim().split(/\s+/)[0] || "there";
  const ref = (r.customerReference || r.paymentReference).toUpperCase();
  const journey = `${r.pickupLabel} → ${r.dropoffLabel}`;
  const pickup = formatUkDateTime(r.tripDate, r.tripTime);
  const schedule = cardBalanceSchedule(r.tripDate, r.tripTime);
  const deadline = schedule ? formatUkInstant(schedule.cancelAt) : `${CARD_BALANCE_CANCEL_DAYS_BEFORE} days before pickup`;
  const balance = formatGbpAmountExact(input.balanceGbp);
  const total = formatGbpAmountExact(Number(r.amount) || 0);
  const tail = [
    "",
    `Any questions? Just reply to this email, or call us on ${BUSINESS_LANDLINE_DISPLAY}, or WhatsApp us on ${BUSINESS_PHONE_DISPLAY}.`,
    "",
    "My Airport Taxi NI",
    BUSINESS_WEBSITE,
  ];

  if (input.kind === "paid") {
    const subject = `Balance received — you're all paid (${ref})`;
    const text = [
      `Hi ${first},`,
      "",
      `Thanks — we've received your balance payment of ${balance}. Your booking is now fully paid (${total}) and there's nothing more to pay.`,
      "",
      `Booking reference: ${ref}`,
      journey,
      `Pickup: ${pickup}`,
      ...tail,
    ].join("\n");
    const html = customerEmailShell(
      subject,
      "Payment received",
      `Hi ${first}, you're all paid`,
      `<p>Thanks — we've received your balance payment of <strong>${esc(balance)}</strong>. Your booking is now fully paid (${esc(total)}) and there's nothing more to pay.</p>
<p><strong>Booking reference:</strong> ${esc(ref)}<br/><strong>${esc(journey)}</strong><br/>Pickup: ${esc(pickup)}</p>`,
    );
    return { subject, text, html };
  }

  const subject =
    input.kind === "final"
      ? `Final reminder: pay ${balance} by ${deadline} or your booking is cancelled (${ref})`
      : input.kind === "reminder"
        ? `Reminder: your balance of ${balance} is due (${ref})`
        : `Your balance of ${balance} is now due (${ref})`;
  const lead =
    input.kind === "final"
      ? `This is a final reminder that the remaining balance of ${balance} for your transfer hasn't been paid yet.`
      : input.kind === "reminder"
        ? `Just a reminder that the remaining balance of ${balance} for your transfer is still due.`
        : `Your journey is a week away, so the remaining balance of ${balance} for your transfer is now due.`;
  const warning = `Please pay by ${deadline}. If it isn't paid by then, the booking will be cancelled automatically and the deposit kept, as agreed when you booked.`;
  const text = [
    `Hi ${first},`,
    "",
    lead,
    "",
    `Booking reference: ${ref}`,
    journey,
    `Pickup: ${pickup}`,
    `Booking total: ${total}`,
    `Balance due: ${balance}`,
    "",
    "Pay securely by card here:",
    input.payUrl ?? "",
    "",
    warning,
    ...tail,
  ].join("\n");
  const html = customerEmailShell(
    subject,
    input.kind === "final" ? "Final reminder" : "Balance due",
    input.kind === "final" ? `Hi ${first}, please pay your balance` : `Hi ${first}, your balance is due`,
    `<p>${esc(lead)}</p>
<p><strong>Booking reference:</strong> ${esc(ref)}<br/><strong>${esc(journey)}</strong><br/>Pickup: ${esc(pickup)}<br/>Booking total: ${esc(total)}<br/><strong>Balance due: ${esc(balance)}</strong></p>
<p style="margin:24px 0 8px;text-align:center;">
<a href="${esc(input.payUrl ?? "")}" style="display:inline-block;background:${BRAND_NAVY};color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;padding:14px 28px;border-radius:8px;">Pay ${esc(balance)} by card</a>
</p>
<p style="margin:8px 0 0;font-size:13px;color:#64748b;text-align:center;">Secure payment powered by SumUp</p>
<p style="margin:16px 0 0;">${esc(warning)}</p>`,
  );
  return { subject, text, html };
}

async function sendCustomer(
  env: CardBalanceEnv,
  record: PaidBookingRecord,
  kind: CustomerEmailKind,
  balanceGbp: number,
  payUrl?: string,
  idempotencySuffix = "",
): Promise<boolean> {
  const email = buildCardBalanceCustomerEmail({ kind, record, balanceGbp, payUrl });
  const sent = await trySendResendOnlyCustomerEmail(env, {
    to: record.customerEmail,
    subject: email.subject,
    body: email.text,
    htmlBody: email.html,
    idempotencyKey: `card-balance:${kind}:${record.paymentReference}${idempotencySuffix}`,
  });
  return sent.sent;
}

async function sendOwner(env: CardBalanceEnv, subject: string, lines: string[]): Promise<void> {
  await trySendOwnerOperationalEmail(env, { to: OWNER_INBOX, subject, body: lines.join("\n") }).catch(() => undefined);
}

function ownerSummary(record: PaidBookingRecord, balanceGbp: number): string[] {
  return [
    `Customer: ${record.customerName} (${record.customerEmail}, ${record.mobileNumber || "no mobile"})`,
    `Booking: ${(record.customerReference || record.paymentReference).toUpperCase()} — payment ref ${record.paymentReference}`,
    `Journey: ${record.pickupLabel} → ${record.dropoffLabel}`,
    `Pickup: ${formatUkDateTime(record.tripDate, record.tripTime)}`,
    `Booking total: ${formatGbpAmountExact(Number(record.amount) || 0)}`,
    `Balance: ${formatGbpAmountExact(balanceGbp)}`,
  ];
}

// ── Paying the balance ────────────────────────────────────────────────────

/** Record a paid balance checkout on the booking. Idempotent per checkout. */
async function settleBalanceCheckout(
  env: CardBalanceEnv & { TRACKING_STORE: KVNamespace },
  record: PaidBookingRecord,
  checkout: SumUpCheckoutDetails,
  checkoutId: string,
): Promise<PaidBookingRecord> {
  if ((record.additionalPayments ?? []).some((p) => p.checkoutId === checkoutId)) return record;
  const amount = Math.round(Number(checkout.amount) * 100) / 100;
  const paidAt = new Date().toISOString();
  const transactionCode = getSuccessfulTransactionCode(checkout);
  const entry: PaidBookingAdditionalPayment = {
    amount,
    checkoutId,
    paymentReference: transactionCode || checkout.checkout_reference || checkoutId,
    amendmentId: "card-balance",
    paidAt,
    transactionId: getSuccessfulTransactionId(checkout) || undefined,
    transactionCode: transactionCode || undefined,
    kind: "card-balance",
  };
  const additionalPayments = [...(record.additionalPayments ?? []), entry];
  const withPayment: PaidBookingRecord = { ...record, additionalPayments };
  const stillDue = remainingCardBalanceGbp({ ...withPayment, cardBalance: { status: "scheduled", paidAmountGbp: 0 } });
  const updated = await saveState(
    env.TRACKING_STORE,
    withPayment,
    stillDue > 0.004
      ? { lastError: `Balance part-paid: £${stillDue.toFixed(2)} still due` }
      : {
          status: "paid",
          paidAt,
          paidAmountGbp: amount,
          transactionId: entry.transactionId,
          transactionCode: entry.transactionCode,
          lastError: undefined,
        },
    {
      additionalPayments,
      amountPaidLabel: formatPaidAmount(grossAmountCollectedOf(withPayment), record.currency || "GBP"),
    },
  );
  if (stillDue <= 0.004) {
    await sendCustomer(env, updated, "paid", amount);
    await sendOwner(env, `Card balance PAID — ${formatGbpAmountExact(amount)} — ${updated.customerName}`, [
      "The customer has paid the card balance. The booking is now fully paid.",
      "",
      ...ownerSummary(updated, amount),
    ]);
  }
  return updated;
}

/** Check the booking's current balance checkout with SumUp and record it if paid. */
async function pollBalanceCheckout(
  env: CardBalanceEnv & { TRACKING_STORE: KVNamespace },
  record: PaidBookingRecord,
): Promise<PaidBookingRecord> {
  const checkoutId = record.cardBalance?.checkoutId?.trim();
  const apiKey = env.SUMUP_API_KEY?.trim();
  if (!checkoutId || !apiKey) return record;
  const checkout = await getSumUpCheckout(apiKey, checkoutId);
  if (!isSumUpCheckoutPaid(checkout)) return record;
  return settleBalanceCheckout(env, record, checkout, checkoutId);
}

/** SumUp webhook hook. "not_balance" lets the shared webhook carry on. */
export async function confirmCardBalanceWebhook(
  env: CardBalanceEnv,
  checkoutId: string,
): Promise<"not_balance" | "done" | "retry"> {
  const id = checkoutId.trim();
  const store = env.TRACKING_STORE;
  if (!id || !store) return "not_balance";
  const ref = await store.get(`${CHECKOUT_INDEX_PREFIX}${id}`).catch(() => null);
  if (!ref) return "not_balance";
  try {
    const record = await getPaidBookingRecord(store, ref);
    if (!record) return "done";
    const apiKey = env.SUMUP_API_KEY?.trim();
    if (!apiKey) return "retry";
    const checkout = await getSumUpCheckout(apiKey, id);
    if (isSumUpCheckoutPaid(checkout)) {
      await settleBalanceCheckout({ ...env, TRACKING_STORE: store }, record, checkout, id);
    }
    return "done";
  } catch (error) {
    console.error("Card balance webhook failed", error instanceof Error ? error.message : error);
    return "retry";
  }
}

function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { Location: location, "Cache-Control": "no-store" } });
}

function resultPage(env: CardBalanceEnv, status: string, ref?: string): Response {
  const url = new URL("/balance-paid/", siteOrigin(env));
  url.searchParams.set("status", status);
  if (ref) url.searchParams.set("ref", ref);
  return redirect(url.toString());
}

async function loadForLink(
  env: CardBalanceEnv,
  request: Request,
): Promise<{ record: PaidBookingRecord; store: KVNamespace } | { error: string }> {
  const store = env.TRACKING_STORE;
  if (!store) return { error: "unavailable" };
  const url = new URL(request.url);
  const ref = String(url.searchParams.get("ref") ?? "").trim();
  const token = String(url.searchParams.get("t") ?? "").trim();
  if (!ref || !token) return { error: "invalid" };
  const record = await getPaidBookingRecord(store, ref);
  if (!record || !isDepositCardBalancePaymentMethod(record.paymentMethod)) return { error: "invalid" };
  const expected = payTokenOf(record);
  if (!expected || expected !== token) return { error: "invalid" };
  return { record, store };
}

/** GET /card-balance/pay?ref=&t= — open (or reuse) the SumUp checkout for the balance. */
export async function handleCardBalancePay(request: Request, env: CardBalanceEnv): Promise<Response> {
  const loaded = await loadForLink(env, request);
  if ("error" in loaded) return resultPage(env, loaded.error);
  let { record } = loaded;
  const store = loaded.store;
  const ref = (record.customerReference || record.paymentReference).toUpperCase();
  if (isBookingCancelled(record) || record.cardBalance?.status === "cancelled_unpaid") return resultPage(env, "cancelled", ref);

  const fullEnv = { ...env, TRACKING_STORE: store };
  try {
    record = await pollBalanceCheckout(fullEnv, record);
  } catch {
    // SumUp lookup failed — carry on and open a fresh checkout if needed.
  }
  const balance = remainingCardBalanceGbp(record);
  if (record.cardBalance?.status === "paid" || balance < 0.01) return resultPage(env, "paid", ref);

  const apiKey = env.SUMUP_API_KEY?.trim() ?? "";
  const merchantCode = env.SUMUP_MERCHANT_CODE?.trim() ?? "";
  if (!apiKey || !merchantCode) return resultPage(env, "unavailable", ref);

  const state = record.cardBalance;
  if (state?.checkoutId && state.paymentUrl && Math.abs((state.checkoutAmountGbp ?? 0) - balance) < 0.005) {
    try {
      const existing = await getSumUpCheckout(apiKey, state.checkoutId);
      const status = String(existing.status ?? "").toUpperCase();
      if (status === "PENDING") return redirect(state.paymentUrl);
    } catch {
      // fall through to a new checkout
    }
  }

  const returnLink = new URL("/card-balance/return", WORKER_PUBLIC_ORIGIN);
  returnLink.searchParams.set("ref", record.paymentReference);
  returnLink.searchParams.set("t", payTokenOf(record));
  const checkout = await createSumUpHostedCheckout(apiKey, merchantCode, {
    amount: balance,
    description: `Balance ${formatPaidAmount(balance)} — booking ${ref}`,
    checkoutReference: buildCheckoutReference(`bal-${record.paymentReference.slice(0, 10)}`),
    redirectUrl: returnLink.toString(),
    returnUrl: new URL("/payments/webhook", WORKER_PUBLIC_ORIGIN).toString(),
  });
  await store.put(`${CHECKOUT_INDEX_PREFIX}${checkout.checkoutId}`, record.paymentReference, {
    expirationTtl: 60 * 60 * 24 * 45,
  });
  await saveState(store, record, {
    checkoutId: checkout.checkoutId,
    checkoutReference: checkout.checkoutReference,
    paymentUrl: checkout.paymentUrl,
    checkoutAmountGbp: balance,
  });
  return redirect(checkout.paymentUrl);
}

/** GET /card-balance/return — SumUp sends the customer back here after paying. */
export async function handleCardBalanceReturn(request: Request, env: CardBalanceEnv): Promise<Response> {
  const loaded = await loadForLink(env, request);
  if ("error" in loaded) return resultPage(env, loaded.error);
  const ref = (loaded.record.customerReference || loaded.record.paymentReference).toUpperCase();
  try {
    const record = await pollBalanceCheckout({ ...env, TRACKING_STORE: loaded.store }, loaded.record);
    return resultPage(env, record.cardBalance?.status === "paid" ? "paid" : "pending", ref);
  } catch {
    return resultPage(env, "pending", ref);
  }
}

// ── Refund on cancellation ────────────────────────────────────────────────

/**
 * Before a full cancel + refund, refund a paid card balance against its own SumUp
 * transaction. The main refund engine then refunds the deposit as usual.
 */
export async function refundPaidCardBalanceBeforeCancel(
  env: CardBalanceEnv,
  record: PaidBookingRecord,
): Promise<{ ok: true; record: PaidBookingRecord; refundedGbp: number } | { ok: false; error: string }> {
  const store = env.TRACKING_STORE;
  const entries = (record.additionalPayments ?? []).filter((p) => p.kind === "card-balance" && !p.refundedSeparatelyAt);
  if (!store || entries.length === 0) return { ok: true, record, refundedGbp: 0 };
  const apiKey = env.SUMUP_API_KEY?.trim() ?? "";
  if (!apiKey) return { ok: false, error: "SumUp is not configured — cannot refund the card balance." };

  let refundedGbp = 0;
  const now = new Date().toISOString();
  const updatedEntries: PaidBookingAdditionalPayment[] = [];
  for (const p of record.additionalPayments ?? []) {
    if (p.kind !== "card-balance" || p.refundedSeparatelyAt) {
      updatedEntries.push(p);
      continue;
    }
    let transactionId = p.transactionId?.trim() ?? "";
    if (!transactionId) {
      const checkout = await getSumUpCheckout(apiKey, p.checkoutId).catch(() => null);
      transactionId = checkout ? getSuccessfulTransactionId(checkout) ?? "" : "";
    }
    if (!transactionId) {
      return {
        ok: false,
        error: `Could not find the SumUp transaction for the card balance (${formatGbpAmountExact(p.amount)}). Refund it in SumUp first, then cancel.`,
      };
    }
    try {
      await refundSumUpTransaction(apiKey, transactionId, p.amount, env.SUMUP_MERCHANT_CODE?.trim() || undefined);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "SumUp refund failed";
      return { ok: false, error: `Card balance refund failed: ${detail}` };
    }
    refundedGbp += p.amount;
    updatedEntries.push({ ...p, transactionId, refundedSeparatelyAt: now, refundedSeparatelyGbp: p.amount });
  }
  const updated = await saveState(
    store,
    record,
    { status: "refunded", refundedAt: now, refundedAmountGbp: Math.round(refundedGbp * 100) / 100 },
    { additionalPayments: updatedEntries },
  );
  await sendOwner(env, `Card balance refunded — ${formatGbpAmountExact(refundedGbp)} — ${record.customerName}`, [
    "The card balance was refunded to the customer as part of a full cancellation. The deposit is refunded separately.",
    "",
    ...ownerSummary(record, refundedGbp),
  ]);
  return { ok: true, record: updated, refundedGbp };
}

// ── Cron ──────────────────────────────────────────────────────────────────

export type CardBalanceCronResult = {
  checked: number;
  linksSent: number;
  reminders: number;
  paid: number;
  cancelled: number;
  errors: number;
};

/** Hourly: send links/reminders, pick up payments, cancel unpaid bookings. */
export async function processCardBalanceQueue(
  env: CardBalanceEnv,
  cancelUnpaid: CancelUnpaidBookingFn,
  now = new Date(),
): Promise<CardBalanceCronResult> {
  const result: CardBalanceCronResult = { checked: 0, linksSent: 0, reminders: 0, paid: 0, cancelled: 0, errors: 0 };
  const store = env.TRACKING_STORE;
  if (!store) return result;
  const queue = await readQueue(store);
  if (queue.length === 0) return result;
  const fullEnv = { ...env, TRACKING_STORE: store };
  const t = now.getTime();
  const keep: QueueEntry[] = [];
  let actions = 0;
  let changed = false;

  for (const entry of queue) {
    if (actions >= MAX_ACTIONS_PER_RUN) {
      keep.push(entry);
      continue;
    }
    try {
      let record = await getPaidBookingRecord(store, entry.ref);
      result.checked++;
      if (!record || !isDepositCardBalancePaymentMethod(record.paymentMethod) || !isOpenState(record.cardBalance)) {
        changed = true;
        continue;
      }
      if (isBookingCancelled(record)) {
        changed = true;
        continue;
      }
      const schedule = cardBalanceSchedule(record.tripDate, record.tripTime);
      if (!schedule) {
        keep.push(entry);
        continue;
      }
      if (t < schedule.dueAt.getTime()) {
        keep.push(entry);
        continue;
      }

      // Pick up a payment made since the last run before anything else.
      if (record.cardBalance?.checkoutId) {
        const before = record.cardBalance.status;
        record = await pollBalanceCheckout(fullEnv, record).catch(() => record!);
        if (record.cardBalance?.status === "paid" && before !== "paid") {
          result.paid++;
          changed = true;
          continue;
        }
      }
      const balance = remainingCardBalanceGbp(record);
      if (balance < 0.01) {
        await saveState(store, record, { status: "paid", paidAt: now.toISOString() });
        changed = true;
        continue;
      }

      // Never cancel before the customer has had the link for at least 48 hours
      // (e.g. if the pickup was moved closer after booking), and never after pickup.
      const linkSentAt = Date.parse(record.cardBalance?.linkSentAt ?? "");
      const cancelAt = Number.isFinite(linkSentAt)
        ? Math.max(schedule.cancelAt.getTime(), linkSentAt + 48 * 60 * 60 * 1000)
        : Infinity;
      if (t >= schedule.pickupAt.getTime()) {
        await sendOwner(fullEnv, `Balance unpaid at pickup time — ${record.customerName}`, [
          "This deposit booking reached its pickup time with the card balance unpaid. Please check it.",
          "",
          ...ownerSummary(record, balance),
        ]);
        await saveState(store, record, { lastError: "Balance unpaid at pickup time" });
        changed = true;
        continue;
      }
      if (t >= cancelAt) {
        actions++;
        const cancelled = await cancelUnpaid({
          paymentReference: record.paymentReference,
          customerFacingReason:
            `The remaining balance of ${formatGbpAmountExact(balance)} wasn't paid by the due date, so the booking has been cancelled ` +
            `and the deposit kept, as agreed when booking.`,
          ownerNotes: `Automatic: card balance ${formatGbpAmountExact(balance)} unpaid ${CARD_BALANCE_CANCEL_DAYS_BEFORE} days before pickup — cancelled, deposit kept.`,
        });
        if (!cancelled.ok) {
          result.errors++;
          await saveState(store, record, { lastError: `Auto-cancel failed: ${cancelled.error ?? "unknown"}` });
          await sendOwner(fullEnv, `ACTION NEEDED — balance unpaid, auto-cancel failed — ${record.customerName}`, [
            `The card balance wasn't paid and the booking could not be cancelled automatically: ${cancelled.error ?? "unknown error"}.`,
            "Please cancel it from the owner dashboard (no refund — deposit kept) or contact the customer.",
            "",
            ...ownerSummary(record, balance),
          ]);
          keep.push(entry);
          continue;
        }
        const fresh = (await getPaidBookingRecord(store, record.paymentReference)) ?? record;
        await saveState(store, fresh, { status: "cancelled_unpaid", cancelledAt: now.toISOString() });
        await sendOwner(fullEnv, `Booking AUTO-CANCELLED — balance not paid — ${record.customerName}`, [
          `The card balance of ${formatGbpAmountExact(balance)} wasn't paid ${CARD_BALANCE_CANCEL_DAYS_BEFORE} days before pickup, so the booking has been cancelled and the deposit kept. The customer has been emailed.`,
          "",
          ...ownerSummary(record, balance),
        ]);
        result.cancelled++;
        changed = true;
        continue;
      }

      const ensured = await ensurePayToken(store, record);
      record = ensured.record;
      const payUrl = cardBalancePayUrl(record, ensured.token);
      const state = record.cardBalance;

      if (!state?.linkSentAt) {
        actions++;
        if (await sendCustomer(fullEnv, record, "link", balance, payUrl)) {
          await saveState(store, record, { status: "link_sent", linkSentAt: now.toISOString() });
          result.linksSent++;
        } else result.errors++;
        changed = true;
      } else if (t >= schedule.finalWarningAt.getTime() && !state.finalWarningSentAt) {
        actions++;
        if (await sendCustomer(fullEnv, record, "final", balance, payUrl)) {
          await saveState(store, record, { finalWarningSentAt: now.toISOString() });
          result.reminders++;
          await sendOwner(fullEnv, `Heads-up: balance still unpaid — cancels ${formatUkInstant(schedule.cancelAt)} — ${record.customerName}`, [
            `The customer hasn't paid the card balance yet. They've had a final reminder. If it's still unpaid at ${formatUkInstant(schedule.cancelAt)} the booking is cancelled automatically and the deposit kept.`,
            "You may want to give them a call.",
            "",
            ...ownerSummary(record, balance),
          ]);
        } else result.errors++;
        changed = true;
      } else if (t >= schedule.reminderAt.getTime() && !state.reminderSentAt && !state.finalWarningSentAt) {
        actions++;
        if (await sendCustomer(fullEnv, record, "reminder", balance, payUrl)) {
          await saveState(store, record, { reminderSentAt: now.toISOString() });
          result.reminders++;
        } else result.errors++;
        changed = true;
      }
      keep.push(entry);
    } catch (error) {
      result.errors++;
      keep.push(entry);
      console.error("Card balance cron entry failed", error instanceof Error ? error.message : error);
    }
  }

  if (changed || keep.length !== queue.length) {
    await store.put(CARD_BALANCE_QUEUE_KEY, JSON.stringify(keep.slice(-MAX_QUEUE)));
  }
  return result;
}

/** Customer-facing due date line for confirmation emails etc. */
export function cardBalanceDueLine(record: Pick<PaidBookingRecord, "tripDate" | "tripTime">): string {
  const schedule = cardBalanceSchedule(record.tripDate, record.tripTime);
  return schedule ? formatUkDateLong(schedule.dueAt) : "7 days before your journey";
}
