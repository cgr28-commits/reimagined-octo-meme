/**
 * Optional post-journey tips.
 * Own SumUp checkout and KV record. Never finalizes or amends the journey booking.
 */

import { corsHeaders } from "../shared/google-places";
import {
  applyConfirmedSumUpTip,
  buildTipPageUrl,
  decideTipOnCompletion,
  generateTipToken,
  isOpaqueTipToken,
  isTerminalUnpaidTipStatus,
  parseTipAmountGbp,
  planTipCheckout,
  publicTipState,
  tipCheckoutReferenceForAttempt,
  tipPaymentInProgressMessage,
  TIP_LINK_INVALID_MESSAGE,
  tipWhatsAppMessage,
  type JourneyTipRecord,
  type TipCompletionPayload,
} from "../shared/journey-tip";
import {
  createSumUpHostedCheckout,
  getSuccessfulTransactionCode,
  getSuccessfulTransactionId,
  getSumUpCheckout,
  isDuplicateSumUpCheckoutError,
  isSumUpCheckoutPaid,
  listSumUpCheckoutsByReference,
  type SumUpCheckoutDetails,
  type SumUpCheckoutRequest,
} from "../shared/sumup-checkout";
import type { TrackingJobRecord } from "../shared/tracking";
import { getTrackingJob } from "./tracking-store";

const TIP_PREFIX = "tip:";
const TIP_CHECKOUT_PREFIX = "tip-checkout:";
/** Same retention window as tracking jobs. */
const TIP_TTL_SECONDS = 60 * 60 * 24 * 45;

export type JourneyTipEnv = {
  TRACKING_STORE?: KVNamespace;
  SUMUP_API_KEY?: string;
  SUMUP_MERCHANT_CODE?: string;
};

function tipJson(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
      ...corsHeaders(origin),
    },
  });
}

function invalidLink(origin: string | null): Response {
  return tipJson({ ok: false, error: TIP_LINK_INVALID_MESSAGE }, 404, origin);
}

async function readTip(store: KVNamespace, token: string): Promise<JourneyTipRecord | null> {
  if (!isOpaqueTipToken(token)) return null;
  const record = await store.get<JourneyTipRecord>(`${TIP_PREFIX}${token}`, "json");
  if (!record?.tipToken || record.tipToken !== token) return null;
  return record;
}

async function writeTip(store: KVNamespace, record: JourneyTipRecord): Promise<void> {
  await store.put(`${TIP_PREFIX}${record.tipToken}`, JSON.stringify(record), {
    expirationTtl: TIP_TTL_SECONDS,
  });
}

async function indexTipCheckout(
  store: KVNamespace,
  checkoutId: string,
  tipToken: string,
): Promise<void> {
  await store.put(`${TIP_CHECKOUT_PREFIX}${checkoutId}`, tipToken, {
    expirationTtl: TIP_TTL_SECONDS,
  });
}

async function tipTokenForCheckout(store: KVNamespace, checkoutId: string): Promise<string | null> {
  const token = (await store.get(`${TIP_CHECKOUT_PREFIX}${checkoutId}`))?.trim() ?? "";
  return isOpaqueTipToken(token) ? token : null;
}

function proofFromCheckout(checkout: {
  id: string;
  status?: string;
  amount?: number;
  checkout_reference?: string;
  transactions?: Array<{ status?: string; transaction_code?: string; id?: string }>;
}) {
  return {
    paid: isSumUpCheckoutPaid(checkout),
    checkoutId: checkout.id,
    amount: checkout.amount,
    status: checkout.status,
    transactionCode: getSuccessfulTransactionCode(checkout),
    transactionId: getSuccessfulTransactionId(checkout),
    checkoutReference: checkout.checkout_reference,
  };
}

async function settleTipRecord(
  env: JourneyTipEnv,
  record: JourneyTipRecord,
  checkoutId: string,
): Promise<{
  record: JourneyTipRecord;
  paymentNotCompleted: boolean;
  live: { paid: boolean; status?: string };
}> {
  const apiKey = env.SUMUP_API_KEY?.trim() ?? "";
  if (!apiKey || !env.TRACKING_STORE) {
    throw new Error("SumUp tip confirmation is not configured");
  }
  const checkout = await getSumUpCheckout(apiKey, checkoutId);
  const proof = proofFromCheckout(checkout);
  const applied = applyConfirmedSumUpTip(record, proof, new Date().toISOString());
  if (applied.paidNow) {
    await writeTip(env.TRACKING_STORE, applied.record);
  }
  return {
    record: applied.record,
    paymentNotCompleted: applied.paymentNotCompleted,
    live: { paid: proof.paid, status: checkout.status },
  };
}

function completionPayload(job: TrackingJobRecord, openWhatsApp: boolean): TipCompletionPayload | null {
  if (job.tipDecision !== "yes" && job.tipDecision !== "no") return null;
  const whatsappMessage = tipWhatsAppMessage(job);
  if (!whatsappMessage) return null;
  return {
    decision: job.tipDecision,
    whatsappMessage,
    openWhatsApp,
  };
}

export async function tipPayloadForCompletedJob(
  job: TrackingJobRecord,
): Promise<TipCompletionPayload | null> {
  return completionPayload(job, false);
}

export async function attachTipDecision(
  env: JourneyTipEnv,
  job: TrackingJobRecord,
  customerTipped: boolean,
  nowIso = new Date().toISOString(),
): Promise<
  | { ok: true; job: TrackingJobRecord; tip: TipCompletionPayload }
  | { ok: false; error: string }
> {
  if (!env.TRACKING_STORE) {
    return { ok: false, error: "Live tracking is not configured" };
  }

  const fresh = await getTrackingJob(env.TRACKING_STORE, job.token);
  const existing = fresh ?? job;
  let newToken = generateTipToken();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const clash = await readTip(env.TRACKING_STORE, newToken);
    if (!clash) break;
    newToken = generateTipToken();
  }

  const decided = decideTipOnCompletion(
    {
      tipDecision: existing.tipDecision,
      tipToken: existing.tipToken,
      tipWhatsappPreparedAt: existing.tipWhatsappPreparedAt,
    },
    customerTipped,
    nowIso,
    newToken,
  );

  if (decided.createdTipRequest && decided.decision.tipToken) {
    const record: JourneyTipRecord = {
      tipToken: decided.decision.tipToken,
      trackingJobToken: job.token,
      ...(job.paymentReference?.trim() ? { paymentReference: job.paymentReference.trim() } : {}),
      ...(job.journeyLeg ? { journeyLeg: job.journeyLeg } : {}),
      requestedAt: nowIso,
      status: "requested",
    };
    await writeTip(env.TRACKING_STORE, record);
  }

  const merged: TrackingJobRecord = {
    ...job,
    ...(existing.tipDecision ? { tipDecision: existing.tipDecision } : {}),
    ...(existing.tipToken ? { tipToken: existing.tipToken } : {}),
    ...(existing.tipWhatsappPreparedAt
      ? { tipWhatsappPreparedAt: existing.tipWhatsappPreparedAt }
      : {}),
    ...(!existing.tipDecision ? decided.decision : {}),
  };

  const tip = completionPayload(merged, decided.openWhatsApp);
  if (!tip) {
    return { ok: false, error: "Could not prepare the customer thank-you." };
  }

  return { ok: true, job: merged, tip };
}

export async function handlePublicTipRequest(
  request: Request,
  env: JourneyTipEnv,
  origin: string | null,
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api/, "");

  if (path === "/tip/status") {
    if (request.method !== "GET") {
      return tipJson({ error: "Method not allowed" }, 405, origin);
    }
    const token = url.searchParams.get("t")?.trim().toLowerCase() ?? "";
    return tipStatusResponse(env, origin, token);
  }

  if (path === "/tip/confirm") {
    if (request.method !== "POST") {
      return tipJson({ error: "Method not allowed" }, 405, origin);
    }
    const body = await readJson(request);
    if (!body) return tipJson({ error: "Invalid JSON" }, 400, origin);
    const token = String(body.token ?? "").trim().toLowerCase();
    return tipStatusResponse(env, origin, token);
  }

  if (path === "/tip/checkout") {
    if (request.method !== "POST") {
      return tipJson({ error: "Method not allowed" }, 405, origin);
    }
    return tipCheckoutResponse(request, env, origin);
  }

  return tipJson({ error: "Not found" }, 404, origin);
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function tipStatusResponse(
  env: JourneyTipEnv,
  origin: string | null,
  token: string,
): Promise<Response> {
  if (!isOpaqueTipToken(token)) return invalidLink(origin);
  if (!env.TRACKING_STORE) {
    return tipJson({ error: "Tip payments are not available right now." }, 503, origin);
  }

  let record = await readTip(env.TRACKING_STORE, token);
  if (!record) return invalidLink(origin);

  let paymentNotCompleted = false;
  if (record.status !== "paid" && record.pendingCheckoutId) {
    try {
      const settled = await settleTipRecord(env, record, record.pendingCheckoutId);
      record = settled.record;
      paymentNotCompleted = settled.paymentNotCompleted;
    } catch (error) {
      console.error("Tip status SumUp confirmation failed");
      void error;
    }
  }

  return tipJson(publicTipState(record, paymentNotCompleted), 200, origin);
}

async function tipCheckoutResponse(
  request: Request,
  env: JourneyTipEnv,
  origin: string | null,
): Promise<Response> {
  const body = await readJson(request);
  if (!body) return tipJson({ error: "Invalid JSON" }, 400, origin);

  const token = String(body.token ?? "").trim().toLowerCase();
  if (!isOpaqueTipToken(token)) return invalidLink(origin);

  const amount = parseTipAmountGbp(body.amountGbp);
  if (!amount.ok) {
    return tipJson({ ok: false, error: amount.error }, 400, origin);
  }

  if (!env.TRACKING_STORE) {
    return tipJson({ error: "Tip payments are not available right now." }, 503, origin);
  }

  let record = await readTip(env.TRACKING_STORE, token);
  if (!record) return invalidLink(origin);

  let live: { paid: boolean; status?: string } | null = null;
  if (record.status !== "paid" && record.pendingCheckoutId) {
    try {
      const settled = await settleTipRecord(env, record, record.pendingCheckoutId);
      record = settled.record;
      live = settled.live;
    } catch (error) {
      console.error("Tip checkout SumUp confirmation failed");
      void error;
      return tipJson(
        {
          error: "We couldn’t confirm whether a tip was already paid. Please wait a moment and try again.",
        },
        503,
        origin,
      );
    }
  }

  if (record.status === "paid") {
    return tipJson(publicTipState(record), 200, origin);
  }

  const plan = planTipCheckout(record, amount.amountGbp, live);
  if (plan === "already_paid") {
    return tipJson(
      { error: "We couldn’t confirm this tip payment. Please contact My Airport Taxi NI." },
      409,
      origin,
    );
  }
  if (plan === "reuse" && record.pendingPaymentUrl) {
    return tipJson({ ok: true, state: "open", paymentUrl: record.pendingPaymentUrl }, 200, origin);
  }
  if (plan !== "create") {
    return tipJson(
      {
        ok: true,
        state: "open",
        paymentInProgress: true,
        ...(typeof record.pendingAmountGbp === "number"
          ? { pendingAmountGbp: record.pendingAmountGbp }
          : {}),
        message: tipPaymentInProgressMessage(record.pendingAmountGbp),
      },
      200,
      origin,
    );
  }

  const apiKey = env.SUMUP_API_KEY?.trim() ?? "";
  const merchantCode = env.SUMUP_MERCHANT_CODE?.trim() ?? "";
  if (!apiKey || !merchantCode) {
    return tipJson(
      { error: "Card payment is not available right now. Please contact My Airport Taxi NI." },
      503,
      origin,
    );
  }

  const checkoutReference = tipCheckoutReferenceForAttempt(record);
  const opened = await claimTipSumUpCheckout(apiKey, merchantCode, {
    amount: amount.amountGbp,
    description: "Optional driver tip",
    checkoutReference,
    redirectUrl: buildTipPageUrl(record.tipToken),
    returnUrl: new URL("/payments/webhook", request.url).toString(),
  });
  if (opened.kind === "failed") {
    return tipJson({ error: "Could not start the tip payment. Please try again." }, 502, origin);
  }

  const nowIso = new Date().toISOString();
  if (opened.kind === "paid") {
    const withPending: JourneyTipRecord = {
      ...record,
      pendingAmountGbp: opened.amountGbp,
      pendingCheckoutId: opened.checkoutId,
      pendingCheckoutReference: opened.checkoutReference,
      pendingCheckoutCreatedAt: nowIso,
    };
    const applied = applyConfirmedSumUpTip(withPending, opened.proof, nowIso);
    await writeTip(env.TRACKING_STORE, applied.paidNow ? applied.record : withPending);
    await indexTipCheckout(env.TRACKING_STORE, opened.checkoutId, record.tipToken);
    if (applied.paidNow) {
      return tipJson(publicTipState(applied.record), 200, origin);
    }
    return tipJson(
      { error: "We couldn’t confirm this tip payment. Please contact My Airport Taxi NI." },
      409,
      origin,
    );
  }

  const next: JourneyTipRecord = {
    ...record,
    pendingAmountGbp: opened.amountGbp,
    pendingCheckoutId: opened.checkoutId,
    pendingCheckoutReference: opened.checkoutReference,
    pendingCheckoutCreatedAt: nowIso,
  };
  if (opened.kind === "payable") next.pendingPaymentUrl = opened.paymentUrl;
  else delete next.pendingPaymentUrl;
  await writeTip(env.TRACKING_STORE, next);
  await indexTipCheckout(env.TRACKING_STORE, opened.checkoutId, record.tipToken);

  if (opened.kind === "terminal") {
    return tipJson(
      { error: "That tip payment is no longer available. Please choose an amount again." },
      409,
      origin,
    );
  }

  if (Math.abs(opened.amountGbp - amount.amountGbp) > 0.001) {
    return tipJson(
      {
        ok: true,
        state: "open",
        paymentInProgress: true,
        pendingAmountGbp: opened.amountGbp,
        message: tipPaymentInProgressMessage(opened.amountGbp),
      },
      200,
      origin,
    );
  }

  return tipJson({ ok: true, state: "open", paymentUrl: opened.paymentUrl }, 200, origin);
}

type ClaimedTipCheckout =
  | { kind: "failed" }
  | {
      kind: "payable";
      checkoutId: string;
      paymentUrl: string;
      checkoutReference: string;
      amountGbp: number;
    }
  | {
      kind: "terminal";
      checkoutId: string;
      checkoutReference: string;
      amountGbp: number;
    }
  | {
      kind: "paid";
      checkoutId: string;
      checkoutReference: string;
      amountGbp: number;
      proof: ReturnType<typeof proofFromCheckout>;
    };

/**
 * Create the attempt's SumUp checkout, or reuse the one SumUp already has for
 * this checkout_reference (409 DUPLICATED_CHECKOUT). Never mints a second reference.
 */
async function claimTipSumUpCheckout(
  apiKey: string,
  merchantCode: string,
  request: SumUpCheckoutRequest,
): Promise<ClaimedTipCheckout> {
  try {
    const created = await createSumUpHostedCheckout(apiKey, merchantCode, request);
    return {
      kind: "payable",
      checkoutId: created.checkoutId,
      paymentUrl: created.paymentUrl,
      checkoutReference: request.checkoutReference,
      amountGbp: request.amount,
    };
  } catch (error) {
    if (!isDuplicateSumUpCheckoutError(error)) {
      console.error("Tip SumUp checkout creation failed");
      void error;
      return { kind: "failed" };
    }
  }

  let listed: SumUpCheckoutDetails[] = [];
  try {
    listed = await listSumUpCheckoutsByReference(apiKey, request.checkoutReference);
  } catch (error) {
    console.error("Tip SumUp duplicate checkout lookup failed");
    void error;
    return { kind: "failed" };
  }

  const matches = listed.filter((item) => {
    const ref = item.checkout_reference?.trim();
    return Boolean(item.id) && (!ref || ref === request.checkoutReference);
  });
  const payable = matches.find(
    (item) =>
      Boolean(item.hosted_checkout_url?.trim()) &&
      !isSumUpCheckoutPaid(item) &&
      !isTerminalUnpaidTipStatus(item.status),
  );
  if (payable?.id && payable.hosted_checkout_url) {
    return {
      kind: "payable",
      checkoutId: payable.id,
      paymentUrl: payable.hosted_checkout_url.trim(),
      checkoutReference: request.checkoutReference,
      amountGbp: listedTipAmount(payable, request.amount),
    };
  }

  const paid = matches.find((item) => isSumUpCheckoutPaid(item));
  if (paid?.id) {
    return {
      kind: "paid",
      checkoutId: paid.id,
      checkoutReference: request.checkoutReference,
      amountGbp: listedTipAmount(paid, request.amount),
      proof: proofFromCheckout(paid),
    };
  }

  const terminal = matches.find((item) => isTerminalUnpaidTipStatus(item.status));
  if (terminal?.id) {
    return {
      kind: "terminal",
      checkoutId: terminal.id,
      checkoutReference: request.checkoutReference,
      amountGbp: listedTipAmount(terminal, request.amount),
    };
  }

  return { kind: "failed" };
}

function listedTipAmount(checkout: SumUpCheckoutDetails, fallback: number): number {
  if (typeof checkout.amount === "number" && Number.isFinite(checkout.amount) && checkout.amount > 0) {
    return Math.round(checkout.amount * 100) / 100;
  }
  return fallback;
}

/**
 * SumUp webhook for a tip checkout.
 * Returns "not_tip" when this checkout is not a tip, so the booking webhook can continue.
 * Never calls booking finalization.
 */
export async function confirmJourneyTipWebhook(
  env: JourneyTipEnv,
  checkoutId: string,
): Promise<"not_tip" | "done" | "retry"> {
  const id = checkoutId.trim();
  if (!id || !env.TRACKING_STORE) return "not_tip";

  let token: string | null = null;
  try {
    token = await tipTokenForCheckout(env.TRACKING_STORE, id);
  } catch (error) {
    console.error("Tip webhook index lookup failed");
    void error;
    return "not_tip";
  }
  if (!token) return "not_tip";

  try {
    const record = await readTip(env.TRACKING_STORE, token);
    if (!record || record.status === "paid") return "done";
    // A superseded checkout stays indexed so this webhook does not fall through
    // into journey-payment finalization, but it must not mark the tip paid.
    if (!record.pendingCheckoutId || record.pendingCheckoutId !== id) return "done";
    await settleTipRecord(env, record, id);
    return "done";
  } catch (error) {
    console.error("Tip webhook SumUp confirmation failed");
    void error;
    return "retry";
  }
}
