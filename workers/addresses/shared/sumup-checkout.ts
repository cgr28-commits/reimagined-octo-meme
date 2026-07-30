export type SumUpCheckoutRequest = {
  amount: number;
  description: string;
  checkoutReference: string;
  redirectUrl: string;
};

export type SumUpCheckoutResult = {
  checkoutId: string;
  paymentUrl: string;
};

type SumUpCheckoutResponse = {
  id?: string;
  hosted_checkout_url?: string;
  status?: string;
  error_message?: string;
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
  };
}

export function buildCheckoutReference(prefix = "matni"): string {
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return `${prefix}-${Date.now()}-${random}`;
}
