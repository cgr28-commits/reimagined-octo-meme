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
  /** Best-effort total already refunded on this transaction (GBP). */
  amountRefunded: number;
  refundEvents: Array<{ amount: number; type?: string; timestamp?: string }>;
  rawStatus?: string;
};

type SumUpTransactionHistoryItem = {
  transaction_id?: string;
  transaction_code?: string;
  amount?: number;
  currency?: string;
  status?: string;
};

type SumUpTransactionPayload = {
  id?: string;
  transaction_id?: string;
  transaction_code?: string;
  amount?: number;
  currency?: string;
  status?: string;
  refunds?: Array<{ amount?: number; type?: string; timestamp?: string; date?: string }>;
  events?: Array<{
    type?: string;
    amount?: number;
    timestamp?: string;
    event_type?: string;
  }>;
  amount_refunded?: number;
  tip_amount?: number;
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

/** Parse refund totals from a SumUp transaction payload (events / refunds / amount_refunded). */
export function parseSumUpRefundedTotal(payload: SumUpTransactionPayload | null | undefined): {
  amountRefunded: number;
  refundEvents: Array<{ amount: number; type?: string; timestamp?: string }>;
} {
  const refundEvents: Array<{ amount: number; type?: string; timestamp?: string }> = [];

  for (const refund of payload?.refunds ?? []) {
    const amount = Number(refund.amount);
    if (Number.isFinite(amount) && amount > 0) {
      refundEvents.push({
        amount: roundMoney(amount),
        type: refund.type,
        timestamp: refund.timestamp ?? refund.date,
      });
    }
  }

  for (const event of payload?.events ?? []) {
    const type = String(event.type ?? event.event_type ?? "").toUpperCase();
    if (!type.includes("REFUND")) continue;
    const amount = Number(event.amount);
    if (Number.isFinite(amount) && amount > 0) {
      refundEvents.push({
        amount: roundMoney(Math.abs(amount)),
        type,
        timestamp: event.timestamp,
      });
    }
  }

  let amountRefunded = refundEvents.reduce((sum, event) => sum + event.amount, 0);
  if (typeof payload?.amount_refunded === "number" && payload.amount_refunded > 0) {
    amountRefunded = Math.max(amountRefunded, payload.amount_refunded);
  }

  // Fully refunded status with no event breakdown — treat original amount as refunded.
  const status = String(payload?.status ?? "").toUpperCase();
  if (
    amountRefunded <= 0 &&
    (status === "REFUNDED" || status === "FULLY_REFUNDED") &&
    typeof payload?.amount === "number" &&
    payload.amount > 0
  ) {
    amountRefunded = payload.amount;
  }

  return {
    amountRefunded: roundMoney(amountRefunded),
    refundEvents,
  };
}

/**
 * Fetch SumUp transaction details including refund history when available.
 * Used to reconcile before retrying a refund after an uncertain failure window.
 */
export async function getSumUpTransactionDetails(
  apiKey: string,
  transactionId: string,
  merchantCode?: string,
): Promise<SumUpTransactionDetails | null> {
  const trimmed = transactionId.trim();
  if (!trimmed) return null;

  const attempts: string[] = [
    `https://api.sumup.com/v0.1/me/transactions?id=${encodeURIComponent(trimmed)}`,
    `https://api.sumup.com/v0.1/me/transactions/${encodeURIComponent(trimmed)}`,
  ];
  if (merchantCode?.trim()) {
    attempts.unshift(
      `https://api.sumup.com/v2.1/merchants/${encodeURIComponent(merchantCode.trim())}/transactions/${encodeURIComponent(trimmed)}`,
    );
  }

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
      };
    } catch {
      // try next endpoint
    }
  }

  return null;
}
