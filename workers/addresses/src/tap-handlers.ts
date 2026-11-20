/**
 * Public /tap NFC landing: anonymous tip checkout + click metrics.
 * Tips reuse the journey-tip KV + webhook path; they never touch booking balances.
 */
import { corsHeaders } from "../shared/google-places";
import {
  applyConfirmedSumUpTip,
  generateTipToken,
  isOpaqueTipToken,
  isTerminalUnpaidTipStatus,
  parseTipAmountGbp,
  planTipCheckout,
  publicTipState,
  tipCheckoutReferenceForAttempt,
  tipPaymentInProgressMessage,
  TIP_LINK_INVALID_MESSAGE,
  type JourneyTipRecord,
} from "../shared/journey-tip";
import {
  buildTapTipReturnUrl,
  isTapEventName,
  TAP_TIP_SOURCE,
  TAP_TIP_TRACKING_SENTINEL,
} from "../shared/tap-page";
import {
  getSumUpCheckout,
  isDuplicateSumUpCheckoutError,
  isSumUpCheckoutPaid,
  listSumUpCheckoutsByReference,
  getSuccessfulTransactionCode,
  getSuccessfulTransactionId,
  type SumUpCheckoutDetails,
  type SumUpCheckoutRequest,
} from "../shared/sumup-checkout";
import { ownerAuthorized } from "./driver-auth";
import {
  cardPaymentsConfigured,
  createHostedCheckout,
  providerKeyFor,
} from "./payment-provider";
import { readTapMetrics, recordTapClickEvent, recordTapTipMetricsIfNeeded } from "./tap-metrics-store";

const TIP_PREFIX = "tip:";
const TIP_CHECKOUT_PREFIX = "tip-checkout:";
const TAP_RATE_PREFIX = "tap-tip-rate:";
const TIP_TTL_SECONDS = 60 * 60 * 24 * 45;
/** Soft cap: tip checkouts per client IP per hour. */
const TAP_TIP_MAX_PER_HOUR = 12;

export type TapHandlerEnv = {
  TRACKING_STORE?: KVNamespace;
  SUMUP_API_KEY?: string;
  SUMUP_MERCHANT_CODE?: string;
  PAYMENT_PROVIDER?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_TEST_EMAILS?: string;
  OWNER_ACCESS_KEY?: string;
  DRIVER_ACCESS_KEY?: string;
};

function json(body: unknown, status: number, origin: string | null): Response {
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

function clientIp(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP")?.trim() ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
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

async function indexTipCheckout(store: KVNamespace, checkoutId: string, tipToken: string): Promise<void> {
  await store.put(`${TIP_CHECKOUT_PREFIX}${checkoutId}`, tipToken, {
    expirationTtl: TIP_TTL_SECONDS,
  });
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

async function settleTapTip(
  env: TapHandlerEnv,
  record: JourneyTipRecord,
  checkoutId: string,
): Promise<{
  record: JourneyTipRecord;
  paymentNotCompleted: boolean;
  live: { paid: boolean; status?: string };
  paidNow: boolean;
}> {
  const apiKey = providerKeyFor(env, checkoutId);
  if (!apiKey || !env.TRACKING_STORE) {
    throw new Error("Tip payment confirmation is not configured");
  }
  const checkout = await getSumUpCheckout(apiKey, checkoutId);
  const proof = proofFromCheckout(checkout);
  const applied = applyConfirmedSumUpTip(record, proof, new Date().toISOString());
  let next = applied.record;
  if (applied.paidNow) {
    await writeTip(env.TRACKING_STORE, next);
    next = await recordTapTipMetricsIfNeeded(env.TRACKING_STORE, next);
  }
  return {
    record: next,
    paymentNotCompleted: applied.paymentNotCompleted,
    live: { paid: proof.paid, status: checkout.status },
    paidNow: applied.paidNow,
  };
}

async function takeTipRateSlot(store: KVNamespace, ip: string): Promise<boolean> {
  const hour = Math.floor(Date.now() / 3_600_000);
  const key = `${TAP_RATE_PREFIX}${hour}:${await sha256Hex(ip)}`;
  const current = Number((await store.get(key)) ?? "0");
  if (!Number.isFinite(current) || current >= TAP_TIP_MAX_PER_HOUR) return false;
  await store.put(key, String(current + 1), { expirationTtl: 60 * 60 * 2 });
  return true;
}

type Claimed =
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

async function claimCheckout(
  env: TapHandlerEnv,
  request: SumUpCheckoutRequest,
): Promise<Claimed> {
  try {
    const created = await createHostedCheckout(env, request, {
      customerEmail: null,
      siteOrigin: new URL(request.redirectUrl).origin,
    });
    return {
      kind: "payable",
      checkoutId: created.checkoutId,
      paymentUrl: created.paymentUrl,
      checkoutReference: request.checkoutReference,
      amountGbp: request.amount,
    };
  } catch (error) {
    if (!isDuplicateSumUpCheckoutError(error)) {
      console.error("Tap tip checkout creation failed");
      void error;
      return { kind: "failed" };
    }
  }

  const apiKey = env.SUMUP_API_KEY?.trim() ?? "";
  let listed: SumUpCheckoutDetails[] = [];
  try {
    listed = await listSumUpCheckoutsByReference(apiKey, request.checkoutReference);
  } catch (error) {
    console.error("Tap tip duplicate checkout lookup failed");
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
      amountGbp:
        typeof payable.amount === "number" && payable.amount > 0 ? payable.amount : request.amount,
    };
  }
  const paid = matches.find((item) => isSumUpCheckoutPaid(item));
  if (paid?.id) {
    return {
      kind: "paid",
      checkoutId: paid.id,
      checkoutReference: request.checkoutReference,
      amountGbp: typeof paid.amount === "number" && paid.amount > 0 ? paid.amount : request.amount,
      proof: proofFromCheckout(paid),
    };
  }
  const terminal = matches.find((item) => isTerminalUnpaidTipStatus(item.status));
  if (terminal?.id) {
    return {
      kind: "terminal",
      checkoutId: terminal.id,
      checkoutReference: request.checkoutReference,
      amountGbp:
        typeof terminal.amount === "number" && terminal.amount > 0 ? terminal.amount : request.amount,
    };
  }
  return { kind: "failed" };
}

async function tipStatus(env: TapHandlerEnv, origin: string | null, token: string): Promise<Response> {
  if (!isOpaqueTipToken(token)) return json({ ok: false, error: TIP_LINK_INVALID_MESSAGE }, 404, origin);
  if (!env.TRACKING_STORE) {
    return json({ error: "Tip payments are not available right now." }, 503, origin);
  }
  let record = await readTip(env.TRACKING_STORE, token);
  if (!record || record.source !== TAP_TIP_SOURCE) {
    return json({ ok: false, error: TIP_LINK_INVALID_MESSAGE }, 404, origin);
  }
  let paymentNotCompleted = false;
  if (record.status !== "paid" && record.pendingCheckoutId) {
    try {
      const settled = await settleTapTip(env, record, record.pendingCheckoutId);
      record = settled.record;
      paymentNotCompleted = settled.paymentNotCompleted;
    } catch (error) {
      console.error("Tap tip status confirmation failed");
      void error;
    }
  }
  return json(publicTipState(record, paymentNotCompleted), 200, origin);
}

async function tipCheckout(request: Request, env: TapHandlerEnv, origin: string | null): Promise<Response> {
  const body = await readJson(request);
  if (!body) return json({ error: "Invalid JSON" }, 400, origin);

  const amount = parseTipAmountGbp(body.amountGbp);
  if (!amount.ok) return json({ ok: false, error: amount.error }, 400, origin);

  if (!env.TRACKING_STORE) {
    return json({ error: "Tip payments are not available right now." }, 503, origin);
  }
  if (!cardPaymentsConfigured(env, null)) {
    return json(
      { error: "Card payment is not available right now. Please contact My Airport Taxi NI." },
      503,
      origin,
    );
  }

  const existingToken = String(body.token ?? "").trim().toLowerCase();
  let record: JourneyTipRecord | null = null;
  if (existingToken) {
    if (!isOpaqueTipToken(existingToken)) {
      return json({ ok: false, error: TIP_LINK_INVALID_MESSAGE }, 404, origin);
    }
    record = await readTip(env.TRACKING_STORE, existingToken);
    if (!record || record.source !== TAP_TIP_SOURCE) {
      return json({ ok: false, error: TIP_LINK_INVALID_MESSAGE }, 404, origin);
    }
  }

  if (!record) {
    if (!(await takeTipRateSlot(env.TRACKING_STORE, clientIp(request)))) {
      return json(
        { error: "Too many tip attempts from this connection. Please try again later." },
        429,
        origin,
      );
    }
    let tipToken = generateTipToken();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const clash = await readTip(env.TRACKING_STORE, tipToken);
      if (!clash) break;
      tipToken = generateTipToken();
    }
    record = {
      tipToken,
      trackingJobToken: TAP_TIP_TRACKING_SENTINEL,
      source: TAP_TIP_SOURCE,
      requestedAt: new Date().toISOString(),
      status: "requested",
    };
    await writeTip(env.TRACKING_STORE, record);
  }

  let live: { paid: boolean; status?: string } | null = null;
  if (record.status !== "paid" && record.pendingCheckoutId) {
    try {
      const settled = await settleTapTip(env, record, record.pendingCheckoutId);
      record = settled.record;
      live = settled.live;
    } catch (error) {
      console.error("Tap tip checkout confirmation failed");
      void error;
      return json(
        {
          error:
            "We couldn’t confirm whether a tip was already paid. Please wait a moment and try again.",
        },
        503,
        origin,
      );
    }
  }

  if (record.status === "paid") {
    return json({ ...publicTipState(record), tipToken: record.tipToken }, 200, origin);
  }

  const plan = planTipCheckout(record, amount.amountGbp, live);
  if (plan === "already_paid") {
    return json(
      { error: "We couldn’t confirm this tip payment. Please contact My Airport Taxi NI." },
      409,
      origin,
    );
  }
  if (plan === "reuse" && record.pendingPaymentUrl) {
    return json(
      { ok: true, state: "open", paymentUrl: record.pendingPaymentUrl, tipToken: record.tipToken },
      200,
      origin,
    );
  }
  if (plan !== "create") {
    return json(
      {
        ok: true,
        state: "open",
        tipToken: record.tipToken,
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

  const checkoutReference = tipCheckoutReferenceForAttempt(record);
  const description = "Driver tip – NFC / QR (anonymous)";
  const metadata: Record<string, string> = {
    payment_type: "driver_tip",
    source: TAP_TIP_SOURCE,
  };

  const opened = await claimCheckout(env, {
    amount: amount.amountGbp,
    description,
    metadata,
    checkoutReference,
    redirectUrl: buildTapTipReturnUrl(record.tipToken),
    returnUrl: new URL("/payments/webhook", request.url).toString(),
  });
  if (opened.kind === "failed") {
    return json({ error: "Could not start the tip payment. Please try again." }, 502, origin);
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
    let next = applied.paidNow ? applied.record : withPending;
    await writeTip(env.TRACKING_STORE, next);
    if (applied.paidNow) {
      next = await recordTapTipMetricsIfNeeded(env.TRACKING_STORE, next);
    }
    await indexTipCheckout(env.TRACKING_STORE, opened.checkoutId, record.tipToken);
    if (applied.paidNow) {
      return json({ ...publicTipState(next), tipToken: next.tipToken }, 200, origin);
    }
    return json(
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
    return json(
      { error: "That tip payment is no longer available. Please choose an amount again." },
      409,
      origin,
    );
  }

  if (Math.abs(opened.amountGbp - amount.amountGbp) > 0.001) {
    return json(
      {
        ok: true,
        state: "open",
        tipToken: record.tipToken,
        paymentInProgress: true,
        pendingAmountGbp: opened.amountGbp,
        message: tipPaymentInProgressMessage(opened.amountGbp),
      },
      200,
      origin,
    );
  }

  return json(
    { ok: true, state: "open", paymentUrl: opened.paymentUrl, tipToken: record.tipToken },
    200,
    origin,
  );
}

async function recordEvent(request: Request, env: TapHandlerEnv, origin: string | null): Promise<Response> {
  const body = await readJson(request);
  if (!body) return json({ error: "Invalid JSON" }, 400, origin);
  if (!isTapEventName(body.event)) {
    return json({ error: "Unknown event." }, 400, origin);
  }
  if (!env.TRACKING_STORE) {
    return json({ ok: true, recorded: false }, 200, origin);
  }
  await recordTapClickEvent(env.TRACKING_STORE, body.event);
  return json({ ok: true, recorded: true }, 200, origin);
}

async function ownerMetrics(request: Request, env: TapHandlerEnv, origin: string | null): Promise<Response> {
  if (!ownerAuthorized(request, env)) {
    return json({ error: "Unauthorized" }, 401, origin);
  }
  if (!env.TRACKING_STORE) {
    return json({ error: "Metrics store is not configured." }, 503, origin);
  }
  const metrics = await readTapMetrics(env.TRACKING_STORE);
  return json({ ok: true, metrics }, 200, origin);
}

export async function handleTapPublicRequest(
  request: Request,
  env: TapHandlerEnv,
  origin: string | null,
): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/^\/api/, "");

  if (path === "/tap/tip/status") {
    if (request.method !== "GET") return json({ error: "Method not allowed" }, 405, origin);
    const token = new URL(request.url).searchParams.get("t")?.trim().toLowerCase() ?? "";
    return tipStatus(env, origin, token);
  }

  if (path === "/tap/tip/checkout") {
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);
    return tipCheckout(request, env, origin);
  }

  if (path === "/tap/event") {
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);
    return recordEvent(request, env, origin);
  }

  if (path === "/owner/tap-metrics") {
    if (request.method !== "GET") return json({ error: "Method not allowed" }, 405, origin);
    return ownerMetrics(request, env, origin);
  }

  return json({ error: "Not found" }, 404, origin);
}
