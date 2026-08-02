export type SumUpCheckoutRequest = {
  amount: number;
  description: string;
  checkoutReference: string;
  redirectUrl: string;
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

type SumUpTransactionsListResponse = {
  items?: SumUpTransactionSummary[];
  error_message?: string;
};

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
    `https://api.sumup.com/v2.1/merchants/${encodeURIComponent(merchantCode)}/transactions`,
  );
  url.searchParams.set("transaction_code", trimmed);

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  const payload = (await response.json().catch(() => null)) as
    | SumUpTransactionsListResponse
    | null;

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && payload.error_message
        ? String(payload.error_message)
        : `Could not look up SumUp transaction (${response.status})`;
    throw new Error(message);
  }

  const match =
    payload?.items?.find(
      (item) =>
        item.transaction_code?.trim() === trimmed ||
        item.id?.trim() === trimmed,
    ) ?? payload?.items?.[0];

  return match?.id ? match : null;
}

export async function refundSumUpTransaction(
  apiKey: string,
  transactionId: string,
  amount?: number,
): Promise<SumUpRefundResult> {
  const response = await fetch(
    `https://api.sumup.com/v0.1/me/refund/${encodeURIComponent(transactionId)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(amount !== undefined ? { amount } : {}),
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
