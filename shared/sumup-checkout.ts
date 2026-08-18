export type SumUpCheckoutRequest = {
  amount: number;
  description: string;
  checkoutReference: string;
  /** Browser return URL after hosted checkout / 3DS. */
  redirectUrl: string;
  /** Server webhook URL SumUp POSTs when checkout status changes. */
  returnUrl?: string;
};

export type SumUpCheckoutResult = {
  checkoutId: string;
  paymentUrl: string;
  checkoutReference: string;
};

type SumUpCheckoutResponse = {
  id?: string;
  hosted_checkout_url?: string;
  status?: string;
  checkout_reference?: string;
  error_message?: string;
};

export type SumUpCheckoutDetails = {
  id: string;
  status?: string;
  amount?: number;
  currency?: string;
  checkout_reference?: string;
  description?: string;
  transactions?: Array<{
    status?: string;
    transaction_code?: string;
    id?: string;
  }>;
};

export async function createSumUpHostedCheckout(
  apiKey: string,
  merchantCode: string,
  request: SumUpCheckoutRequest,
): Promise<SumUpCheckoutResult> {
  const response = await fetch("https://api.sumup.com/v0.1/checkouts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: request.amount,
      currency: "GBP",
      merchant_code: merchantCode,
      checkout_reference: request.checkoutReference,
      description: request.description.slice(0, 140),
      redirect_url: request.redirectUrl,
      ...(request.returnUrl ? { return_url: request.returnUrl } : {}),
      hosted_checkout: {
        enabled: true,
      },
    }),
  });

  const payload = (await response.json().catch(() => null)) as SumUpCheckoutResponse | null;

  if (!response.ok || !payload?.hosted_checkout_url || !payload.id) {
    const message =
      payload && typeof payload === "object" && "error_message" in payload
        ? String(payload.error_message)
        : "SumUp checkout creation failed";
    throw new Error(message);
  }

  return {
    checkoutId: payload.id,
    paymentUrl: payload.hosted_checkout_url,
    checkoutReference: request.checkoutReference,
  };
}

export async function getSumUpCheckout(
  apiKey: string,
  checkoutId: string,
): Promise<SumUpCheckoutDetails> {
  const response = await fetch(
    `https://api.sumup.com/v0.1/checkouts/${encodeURIComponent(checkoutId)}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    },
  );

  const payload = (await response.json().catch(() => null)) as SumUpCheckoutDetails | null;

  if (!response.ok || !payload?.id) {
    throw new Error("Could not retrieve SumUp checkout");
  }

  return payload;
}

export function isSumUpCheckoutPaid(checkout: SumUpCheckoutDetails): boolean {
  if (checkout.status === "PAID") {
    return true;
  }

  return checkout.transactions?.some((transaction) => transaction.status === "SUCCESSFUL") ?? false;
}

export function getSuccessfulTransactionCode(checkout: SumUpCheckoutDetails): string | undefined {
  return checkout.transactions?.find((transaction) => transaction.status === "SUCCESSFUL")
    ?.transaction_code;
}

export function getSuccessfulTransactionId(checkout: SumUpCheckoutDetails): string | undefined {
  return checkout.transactions?.find((transaction) => transaction.status === "SUCCESSFUL")?.id;
}

export type SumUpRefundResult = {
  refundedAmount?: number;
  currency?: string;
};

export type SumUpTransactionSummary = {
  id: string;
  transaction_code?: string;
  amount?: number;
  currency?: string;
  status?: string;
};

export type SumUpTransactionDetails = SumUpTransactionSummary & {
  /** Authoritative total already refunded on this transaction (GBP). */
  amountRefunded: number;
  /** Counted REFUND events only (deduplicated); excludes FAILED/PENDING/CHARGE_BACK/PAYOUT_DEDUCTION. */
  refundEvents: Array<{
    id?: string;
    amount: number;
    type?: string;
    status?: string;
    timestamp?: string;
  }>;
  rawStatus?: string;
  /** How the total was derived. */
  refundTotalSource?: "refunded_amount" | "transaction_events" | "status_full_amount" | "none";
};

type SumUpTransactionHistoryItem = {
  transaction_id?: string;
  transaction_code?: string;
  amount?: number;
  currency?: string;
  status?: string;
  refunded_amount?: number;
};

/** Documented SumUp transaction / transaction-event fields used for reconciliation. */
export type SumUpTransactionEvent = {
  id?: number | string;
  event_type?: string;
  status?: string;
  amount?: number;
  timestamp?: string;
  date?: string;
};

export type SumUpTransactionPayload = {
  id?: string;
  transaction_id?: string;
  transaction_code?: string;
  amount?: number;
  currency?: string;
  status?: string;
  /** Documented total refunded amount on retrieve-transaction / history records. */
  refunded_amount?: number;
  /** Documented detailed event list (preferred over legacy `events`). */
  transaction_events?: SumUpTransactionEvent[];
  /**
   * Legacy/alternate compact event list some responses may include.
   * Only used when `transaction_events` is absent — never summed together with it.
   */
  events?: SumUpTransactionEvent[];
};

type SumUpTransactionsHistoryResponse = {
  items?: SumUpTransactionHistoryItem[];
  error_message?: string;
  message?: string;
};

function mapHistoryItem(item: SumUpTransactionHistoryItem): SumUpTransactionSummary | null {
  const id = item.transaction_id?.trim();
  if (!id) {
    return null;
  }

  return {
    id,
    transaction_code: item.transaction_code,
    amount: item.amount,
    currency: item.currency,
    status: item.status,
  };
}

export async function findSumUpTransactionByCode(
  apiKey: string,
  merchantCode: string,
  transactionCode: string,
): Promise<SumUpTransactionSummary | null> {
  const trimmed = transactionCode.trim();
  if (!trimmed) {
    return null;
  }

  const url = new URL(
    `https://api.sumup.com/v2.1/merchants/${encodeURIComponent(merchantCode)}/transactions/history`,
  );
  url.searchParams.set("transaction_code", trimmed);

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  const payload = (await response.json().catch(() => null)) as
    | SumUpTransactionsHistoryResponse
    | null;

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && (payload.error_message || payload.message)
        ? String(payload.error_message ?? payload.message)
        : `Could not look up SumUp transaction (${response.status})`;
    throw new Error(message);
  }

  const match =
    payload?.items
      ?.map(mapHistoryItem)
      .find(
        (item): item is SumUpTransactionSummary =>
          Boolean(item) &&
          (item!.transaction_code?.trim() === trimmed || item!.id.trim() === trimmed),
      ) ??
    payload?.items?.map(mapHistoryItem).find((item): item is SumUpTransactionSummary => Boolean(item));

  return match ?? null;
}

export async function listSumUpCheckoutsByReference(
  apiKey: string,
  checkoutReference: string,
): Promise<SumUpCheckoutDetails[]> {
  const trimmed = checkoutReference.trim();
  if (!trimmed) {
    return [];
  }

  const url = new URL("https://api.sumup.com/v0.1/checkouts");
  url.searchParams.set("checkout_reference", trimmed);

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  const payload = (await response.json().catch(() => null)) as SumUpCheckoutDetails[] | null;
  if (!response.ok || !Array.isArray(payload)) {
    return [];
  }

  return payload.filter((checkout) => Boolean(checkout?.id));
}

function transactionFromCheckout(checkout: SumUpCheckoutDetails): SumUpTransactionSummary | null {
  const transactionId = getSuccessfulTransactionId(checkout);
  if (!transactionId) {
    return null;
  }

  return {
    id: transactionId,
    transaction_code: getSuccessfulTransactionCode(checkout),
    amount: checkout.amount,
    currency: checkout.currency,
    status: "SUCCESSFUL",
  };
}

export async function resolveSumUpTransactionForRefund(
  apiKey: string,
  merchantCode: string,
  paymentReference: string,
  checkoutId?: string,
): Promise<SumUpTransactionSummary | null> {
  const trimmed = paymentReference.trim();
  if (!trimmed) {
    return null;
  }

  if (checkoutId?.trim()) {
    try {
      const checkout = await getSumUpCheckout(apiKey, checkoutId.trim());
      const fromCheckout = transactionFromCheckout(checkout);
      if (fromCheckout) {
        return fromCheckout;
      }
    } catch {
      // Fall through to other lookup strategies.
    }
  }

  if (merchantCode.trim()) {
    try {
      const byCode = await findSumUpTransactionByCode(apiKey, merchantCode.trim(), trimmed);
      if (byCode) {
        return byCode;
      }
    } catch {
      // Fall through to checkout reference lookup.
    }
  }

  const checkouts = await listSumUpCheckoutsByReference(apiKey, trimmed);
  for (const checkout of checkouts) {
    const fromCheckout = transactionFromCheckout(checkout);
    if (fromCheckout) {
      return fromCheckout;
    }
  }

  return null;
}

export async function refundSumUpTransaction(
  apiKey: string,
  transactionId: string,
  amount?: number,
  merchantCode?: string,
): Promise<SumUpRefundResult> {
  const body = JSON.stringify(amount !== undefined ? { amount } : {});

  if (merchantCode?.trim()) {
    const modernResponse = await fetch(
      `https://api.sumup.com/v1.0/merchants/${encodeURIComponent(merchantCode.trim())}/payments/${encodeURIComponent(transactionId)}/refunds`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body,
      },
    );

    if (modernResponse.ok) {
      const modernPayload = (await modernResponse.json().catch(() => null)) as
        | { amount?: number; currency?: string }
        | null;
      return {
        refundedAmount: modernPayload?.amount ?? amount,
        currency: modernPayload?.currency,
      };
    }
  }

  const response = await fetch(
    `https://api.sumup.com/v0.1/me/refund/${encodeURIComponent(transactionId)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body,
    },
  );

  const payload = (await response.json().catch(() => null)) as
    | { amount?: number; currency?: string; error_message?: string }
    | null;

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && payload.error_message
        ? String(payload.error_message)
        : `SumUp refund failed (${response.status})`;
    throw new Error(message);
  }

  return {
    refundedAmount: payload?.amount,
    currency: payload?.currency,
  };
}

export function buildCheckoutReference(prefix = "matni"): string {
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return `${prefix}-${Date.now()}-${random}`;
}

function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

const COMPLETED_REFUND_EVENT_STATUSES = new Set(["REFUNDED", "SUCCESSFUL"]);

function isCountableRefundEvent(event: SumUpTransactionEvent): boolean {
  const eventType = String(event.event_type ?? "").toUpperCase();
  if (eventType !== "REFUND") return false;
  const status = String(event.status ?? "").toUpperCase();
  // PENDING / FAILED / SCHEDULED are not completed customer refunds.
  // Missing status: treat as countable only when SumUp returns REFUND without status
  // on older payloads — prefer documented REFUNDED/SUCCESSFUL when present.
  if (!status) return true;
  if (status === "FAILED" || status === "PENDING" || status === "SCHEDULED") return false;
  return COMPLETED_REFUND_EVENT_STATUSES.has(status);
}

/**
 * Parse already-refunded total from a documented SumUp transaction payload.
 *
 * Prefer one authoritative source (never sum duplicate representations):
 * 1. `refunded_amount` when present
 * 2. else completed `transaction_events` with `event_type: REFUND`, deduped by event id
 * 3. else (only if events absent) the alternate `events` list the same way
 * 4. else transaction `status: REFUNDED` with full `amount` when no event breakdown exists
 *
 * Never counts CHARGE_BACK or PAYOUT_DEDUCTION as customer refunds.
 */
export function parseSumUpRefundedTotal(payload: SumUpTransactionPayload | null | undefined): {
  amountRefunded: number;
  refundEvents: Array<{
    id?: string;
    amount: number;
    type?: string;
    status?: string;
    timestamp?: string;
  }>;
  source: "refunded_amount" | "transaction_events" | "status_full_amount" | "none";
} {
  if (!payload) {
    return { amountRefunded: 0, refundEvents: [], source: "none" };
  }

  const collectFrom = (events: SumUpTransactionEvent[] | undefined) => {
    const refundEvents: Array<{
      id?: string;
      amount: number;
      type?: string;
      status?: string;
      timestamp?: string;
    }> = [];
    const seenIds = new Set<string>();

    for (const event of events ?? []) {
      if (!isCountableRefundEvent(event)) continue;
      const amount = Number(event.amount);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const id = event.id != null ? String(event.id) : undefined;
      if (id) {
        if (seenIds.has(id)) continue;
        seenIds.add(id);
      }
      refundEvents.push({
        id,
        amount: roundMoney(Math.abs(amount)),
        type: String(event.event_type ?? "REFUND"),
        status: event.status,
        timestamp: event.timestamp ?? event.date,
      });
    }

    const amountRefunded = roundMoney(
      refundEvents.reduce((sum, event) => sum + event.amount, 0),
    );
    return { amountRefunded, refundEvents };
  };

  // 1. Documented total field — authoritative when the endpoint returns it.
  if (typeof payload.refunded_amount === "number" && Number.isFinite(payload.refunded_amount)) {
    const fromEvents = collectFrom(
      payload.transaction_events ??
        (payload.transaction_events === undefined ? payload.events : undefined),
    );
    return {
      amountRefunded: roundMoney(Math.max(0, payload.refunded_amount)),
      refundEvents: fromEvents.refundEvents,
      source: "refunded_amount",
    };
  }

  // 2. Detailed transaction_events (preferred). Do not also add `events`.
  if (Array.isArray(payload.transaction_events)) {
    const fromEvents = collectFrom(payload.transaction_events);
    return { ...fromEvents, source: "transaction_events" };
  }

  // 3. Fallback: alternate events list only when transaction_events is absent.
  if (!Array.isArray(payload.transaction_events) && Array.isArray(payload.events)) {
    const fromEvents = collectFrom(payload.events);
    return { ...fromEvents, source: "transaction_events" };
  }

  // 4. Fully refunded status with no refunded_amount / event breakdown.
  const status = String(payload.status ?? "").toUpperCase();
  if (status === "REFUNDED" && typeof payload.amount === "number" && payload.amount > 0) {
    return {
      amountRefunded: roundMoney(payload.amount),
      refundEvents: [],
      source: "status_full_amount",
    };
  }

  return { amountRefunded: 0, refundEvents: [], source: "none" };
}

/**
 * Fetch SumUp transaction details including refund history.
 * Primary: documented GET /v2.1/merchants/{merchant_code}/transactions?id=...
 */
export async function getSumUpTransactionDetails(
  apiKey: string,
  transactionId: string,
  merchantCode?: string,
): Promise<SumUpTransactionDetails | null> {
  const trimmed = transactionId.trim();
  if (!trimmed) return null;

  const attempts: string[] = [];
  if (merchantCode?.trim()) {
    const base = `https://api.sumup.com/v2.1/merchants/${encodeURIComponent(merchantCode.trim())}/transactions`;
    // Documented retrieve-transaction uses query params (not path id).
    attempts.push(`${base}?id=${encodeURIComponent(trimmed)}`);
    attempts.push(`${base}?transaction_code=${encodeURIComponent(trimmed)}`);
  }
  // Older me/transactions lookup as last resort.
  attempts.push(`https://api.sumup.com/v0.1/me/transactions?id=${encodeURIComponent(trimmed)}`);

  for (const url of attempts) {
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!response.ok) continue;
      const payload = (await response.json().catch(() => null)) as SumUpTransactionPayload | null;
      if (!payload) continue;

      const id = String(payload.id ?? payload.transaction_id ?? "").trim() || trimmed;
      const parsed = parseSumUpRefundedTotal(payload);
      return {
        id,
        transaction_code: payload.transaction_code,
        amount: payload.amount,
        currency: payload.currency,
        status: payload.status,
        rawStatus: payload.status,
        amountRefunded: parsed.amountRefunded,
        refundEvents: parsed.refundEvents,
        refundTotalSource: parsed.source,
      };
    } catch {
      // try next endpoint
    }
  }

  return null;
}
