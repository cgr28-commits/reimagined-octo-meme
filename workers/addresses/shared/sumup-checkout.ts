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
  /** SumUp status at create time (normally PENDING). */
  status?: string;
  amount?: number;
  currency?: string;
};

type SumUpCheckoutResponse = {
  id?: string;
  hosted_checkout_url?: string;
  status?: string;
  checkout_reference?: string;
  amount?: number;
  currency?: string;
  error_message?: string;
  message?: string;
  error_code?: string;
  type?: string;
  title?: string;
  detail?: string;
  hosted_checkout?: { enabled?: boolean };
};

export type SumUpCheckoutDetails = {
  id: string;
  status?: string;
  amount?: number;
  currency?: string;
  checkout_reference?: string;
  description?: string;
  hosted_checkout_url?: string;
  hosted_checkout?: { enabled?: boolean };
  transactions?: Array<{
    status?: string;
    transaction_code?: string;
    id?: string;
    amount?: number;
    currency?: string;
  }>;
};

/** Safe summary for logs / owner diagnostics — never includes secrets or card data. */
export function summarizeSumUpCheckoutForLog(
  checkout: Partial<SumUpCheckoutDetails> & {
    hosted_checkout_url?: string;
    error_message?: string;
  },
): Record<string, unknown> {
  return {
    id: checkout.id ?? null,
    status: checkout.status ?? null,
    amount: checkout.amount ?? null,
    currency: checkout.currency ?? null,
    checkout_reference: checkout.checkout_reference ?? null,
    hasHostedCheckoutUrl: Boolean(checkout.hosted_checkout_url?.trim()),
    hostedCheckoutEnabled: checkout.hosted_checkout?.enabled ?? null,
    transactionCount: Array.isArray(checkout.transactions) ? checkout.transactions.length : 0,
    transactionStatuses: Array.isArray(checkout.transactions)
      ? checkout.transactions.map((t) => t.status ?? "UNKNOWN")
      : [],
  };
}

export class SumUpCheckoutCreateError extends Error {
  readonly httpStatus: number;
  readonly sumUpErrorCode?: string;
  readonly safeDetails: Record<string, unknown>;

  constructor(
    message: string,
    options: {
      httpStatus: number;
      sumUpErrorCode?: string;
      safeDetails?: Record<string, unknown>;
    },
  ) {
    super(message);
    this.name = "SumUpCheckoutCreateError";
    this.httpStatus = options.httpStatus;
    this.sumUpErrorCode = options.sumUpErrorCode;
    this.safeDetails = options.safeDetails ?? {};
  }
}

export async function createSumUpHostedCheckout(
  apiKey: string,
  merchantCode: string,
  request: SumUpCheckoutRequest,
): Promise<SumUpCheckoutResult> {
  const amount = Math.round(Number(request.amount) * 100) / 100;
  const body = {
    amount,
    currency: "GBP",
    merchant_code: merchantCode,
    checkout_reference: request.checkoutReference,
    description: request.description.slice(0, 140),
    redirect_url: request.redirectUrl,
    ...(request.returnUrl ? { return_url: request.returnUrl } : {}),
    hosted_checkout: {
      enabled: true,
    },
  };

  const response = await fetch("https://api.sumup.com/v0.1/checkouts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => null)) as SumUpCheckoutResponse | null;

  const safeCreateLog = {
    httpStatus: response.status,
    amount,
    currency: "GBP",
    checkout_reference: request.checkoutReference,
    hasRedirectUrl: Boolean(request.redirectUrl?.trim()),
    hasReturnUrl: Boolean(request.returnUrl?.trim()),
    hostedCheckoutEnabledRequested: true,
    responseId: payload?.id ?? null,
    responseStatus: payload?.status ?? null,
    responseAmount: payload?.amount ?? null,
    responseCurrency: payload?.currency ?? null,
    hasHostedCheckoutUrl: Boolean(payload?.hosted_checkout_url?.trim()),
    hostedCheckoutEnabled: payload?.hosted_checkout?.enabled ?? null,
    error_message: payload?.error_message ?? payload?.message ?? payload?.detail ?? null,
    error_code: payload?.error_code ?? payload?.type ?? null,
  };
  console.log("SumUp checkout create", safeCreateLog);

  if (!response.ok || !payload?.hosted_checkout_url?.trim() || !payload.id) {
    const message =
      payload?.error_message ||
      payload?.message ||
      payload?.detail ||
      payload?.title ||
      (!payload?.hosted_checkout_url?.trim() && response.ok
        ? "SumUp did not return a hosted checkout URL"
        : "SumUp checkout creation failed");
    throw new SumUpCheckoutCreateError(String(message), {
      httpStatus: response.status,
      sumUpErrorCode: payload?.error_code ?? payload?.type,
      safeDetails: safeCreateLog,
    });
  }

  return {
    checkoutId: payload.id,
    paymentUrl: payload.hosted_checkout_url.trim(),
    checkoutReference: request.checkoutReference,
    status: payload.status,
    amount: payload.amount ?? amount,
    currency: payload.currency ?? "GBP",
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

  console.log("SumUp checkout status", summarizeSumUpCheckoutForLog(payload));
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

type SumUpTransactionHistoryItem = {
  transaction_id?: string;
  transaction_code?: string;
  amount?: number;
  currency?: string;
  status?: string;
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
