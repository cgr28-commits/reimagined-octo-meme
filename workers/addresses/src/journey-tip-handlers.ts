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
  parseTipAmountGbp,
  planTipCheckout,
  publicTipState,
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
  isSumUpCheckoutPaid,
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
): Promise<{ record: JourneyTipRecord; paymentNotCompleted: boolean }> {
  const apiKey = env.SUMUP_API_KEY?.trim() ?? "";
  if (!apiKey || !env.TRACKING_STORE) {
    throw new Error("SumUp tip confirmation is not configured");
  }
  const checkout = await getSumUpCheckout(apiKey, checkoutId);
  const applied = applyConfirmedSumUpTip(
    record,
    proofFromCheckout(checkout),
    new Date().toISOString(),
  );
  if (applied.paidNow) {
    await writeTip(env.TRACKING_STORE, applied.record);
  }
  return { record: applied.record, paymentNotCompleted: applied.paymentNotCompleted };
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

  if (record.status !== "paid" && record.pendingCheckoutId) {
    try {
      const settled = await settleTipRecord(env, record, record.pendingCheckoutId);
      record = settled.record;
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

  const plan = planTipCheckout(record, amount.amountGbp);
  if (plan === "reuse" && record.pendingPaymentUrl) {
    return tipJson({ ok: true, state: "open", paymentUrl: record.pendingPaymentUrl }, 200, origin);
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

  const checkoutReference = `tip-${record.tipToken.slice(0, 8)}-${Date.now()}`;
  let checkout: { checkoutId: string; paymentUrl: string; checkoutReference: string };
  try {
    checkout = await createSumUpHostedCheckout(apiKey, merchantCode, {
      amount: amount.amountGbp,
      description: "Optional driver tip",
      checkoutReference,
      redirectUrl: buildTipPageUrl(record.tipToken),
      returnUrl: new URL("/payments/webhook", request.url).toString(),
    });
  } catch (error) {
    console.error("Tip SumUp checkout creation failed");
    void error;
    return tipJson({ error: "Could not start the tip payment. Please try again." }, 502, origin);
  }

  const next: JourneyTipRecord = {
    ...record,
    pendingAmountGbp: amount.amountGbp,
    pendingCheckoutId: checkout.checkoutId,
    pendingCheckoutReference: checkout.checkoutReference,
    pendingPaymentUrl: checkout.paymentUrl,
    pendingCheckoutCreatedAt: new Date().toISOString(),
  };
  await writeTip(env.TRACKING_STORE, next);
  await indexTipCheckout(env.TRACKING_STORE, checkout.checkoutId, record.tipToken);

  return tipJson({ ok: true, state: "open", paymentUrl: checkout.paymentUrl }, 200, origin);
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
    await settleTipRecord(env, record, id);
    return "done";
  } catch (error) {
    console.error("Tip webhook SumUp confirmation failed");
    void error;
    return "retry";
  }
}
