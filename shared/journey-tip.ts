/**
 * Post-journey tips. Separate from the journey fare, airport access charge,
 * return discount, and the original SumUp checkout.
 *
 * A tip becomes paid only when this module is given proof that SumUp has
 * confirmed the checkout. Opening or returning to the tip page is not proof.
 */

export const TIP_PUBLIC_ORIGIN = "https://www.myairporttaxini.co.uk";

export const TIP_PRESET_AMOUNTS_GBP = [3, 5, 10] as const;

export const TIP_CUSTOM_MIN_GBP = 1;
export const TIP_CUSTOM_MAX_GBP = 100;

export const TIP_LINK_INVALID_MESSAGE = "This link is not valid.";

export const TIPPED_IN_PERSON_MESSAGE =
  "Thank you for travelling with My Airport Taxi NI. We really appreciate your custom and your kind tip. We hope you had a comfortable journey.";

export const TIP_PAGE_THANKS =
  "We really appreciate your kindness and thank you for travelling with My Airport Taxi NI.";

const TIP_TOKEN_PATTERN = /^[a-f0-9]{32}$/;

const TERMINAL_UNPAID_STATUSES = new Set([
  "FAILED",
  "EXPIRED",
  "CANCELLED",
  "CANCELED",
  "DECLINED",
]);

export type TipDecision = "yes" | "no";

export type StoredTipDecision = {
  tipDecision?: TipDecision;
  tipToken?: string;
  tipWhatsappPreparedAt?: string;
};

export type JourneyTipStatus = "requested" | "paid";

/** Server-side tip record. The public URL carries only `tipToken`. */
export type JourneyTipRecord = {
  tipToken: string;
  trackingJobToken: string;
  paymentReference?: string;
  journeyLeg?: "outbound" | "return";
  requestedAt: string;
  status: JourneyTipStatus;
  amountGbp?: number;
  paidAt?: string;
  checkoutId?: string;
  checkoutReference?: string;
  transactionCode?: string;
  transactionId?: string;
  pendingAmountGbp?: number;
  pendingCheckoutId?: string;
  pendingCheckoutReference?: string;
  pendingPaymentUrl?: string;
  pendingCheckoutCreatedAt?: string;
};

export type TipCompletionPayload = {
  decision: TipDecision;
  whatsappMessage: string;
  /** True only the first time the thank-you text is prepared. */
  openWhatsApp: boolean;
};

export type SumUpTipProof = {
  /** Must come from isSumUpCheckoutPaid (or an equivalent SumUp read), never from a return URL. */
  paid: boolean;
  checkoutId: string;
  amount?: number;
  status?: string;
  transactionCode?: string;
  transactionId?: string;
  checkoutReference?: string;
};

export function generateTipToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function isOpaqueTipToken(value: string): boolean {
  return TIP_TOKEN_PATTERN.test(value);
}

export function buildTipPageUrl(token: string): string {
  return `${TIP_PUBLIC_ORIGIN}/tip/?t=${encodeURIComponent(token)}`;
}

export function optionalTipWhatsAppMessage(tipUrl: string): string {
  return `Thank you for travelling with My Airport Taxi NI. We hope you had a comfortable journey. If you’d like to leave an optional tip, you can do so securely here: ${tipUrl}`;
}

export function tipWhatsAppMessage(decision: StoredTipDecision): string | null {
  if (decision.tipDecision === "yes") {
    return TIPPED_IN_PERSON_MESSAGE;
  }
  if (decision.tipDecision === "no" && decision.tipToken && isOpaqueTipToken(decision.tipToken)) {
    return optionalTipWhatsAppMessage(buildTipPageUrl(decision.tipToken));
  }
  return null;
}

export function formatTipGbp(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  if (!Number.isFinite(rounded)) return "";
  if (Number.isInteger(rounded)) return `£${rounded}`;
  return `£${rounded.toFixed(2)}`;
}

export function leaveTipButtonLabel(amountGbp: number): string {
  return `Leave ${formatTipGbp(amountGbp)} tip`;
}

/**
 * Accept preset and custom GBP amounts. Reject zero, negative, malformed,
 * more than two decimal places, and amounts outside £1–£100.
 */
export function parseTipAmountGbp(
  input: unknown,
): { ok: true; amountGbp: number } | { ok: false; error: string } {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) {
      return { ok: false, error: "Enter a valid amount in pounds." };
    }
    return finalizeTipAmount(input, input);
  }

  if (typeof input !== "string") {
    return { ok: false, error: "Enter a valid amount in pounds." };
  }

  const trimmed = input.trim().replace(/^£/, "");
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return { ok: false, error: "Enter a valid amount in pounds." };
  }

  return finalizeTipAmount(Number(trimmed), Number(trimmed));
}

function finalizeTipAmount(
  amount: number,
  raw: number,
): { ok: true; amountGbp: number } | { ok: false; error: string } {
  if (!Number.isFinite(amount) || !Number.isFinite(raw)) {
    return { ok: false, error: "Enter a valid amount in pounds." };
  }
  const rounded = Math.round(amount * 100) / 100;
  if (Math.abs(rounded - raw) > 0.001) {
    return { ok: false, error: "Enter a valid amount in pounds." };
  }
  if (rounded <= 0) {
    return { ok: false, error: "Enter an amount greater than zero." };
  }
  if (rounded < TIP_CUSTOM_MIN_GBP) {
    return { ok: false, error: "The smallest tip is £1." };
  }
  if (rounded > TIP_CUSTOM_MAX_GBP) {
    return { ok: false, error: "Enter an amount up to £100." };
  }
  return { ok: true, amountGbp: rounded };
}

/**
 * First completion records the owner's Yes/No answer once.
 * A repeat keeps the original decision, token, and does not open WhatsApp again.
 */
export function decideTipOnCompletion(
  existing: StoredTipDecision,
  customerTipped: boolean,
  nowIso: string,
  newToken: string,
): {
  decision: StoredTipDecision;
  openWhatsApp: boolean;
  createdTipRequest: boolean;
} {
  if (existing.tipDecision === "yes" || existing.tipDecision === "no") {
    return {
      decision: {
        tipDecision: existing.tipDecision,
        ...(existing.tipToken ? { tipToken: existing.tipToken } : {}),
        ...(existing.tipWhatsappPreparedAt
          ? { tipWhatsappPreparedAt: existing.tipWhatsappPreparedAt }
          : {}),
      },
      openWhatsApp: false,
      createdTipRequest: false,
    };
  }

  if (!isOpaqueTipToken(newToken)) {
    throw new Error("Tip token must be an opaque 32-character hex value");
  }

  if (customerTipped) {
    return {
      decision: {
        tipDecision: "yes",
        tipWhatsappPreparedAt: nowIso,
      },
      openWhatsApp: true,
      createdTipRequest: false,
    };
  }

  return {
    decision: {
      tipDecision: "no",
      tipToken: newToken,
      tipWhatsappPreparedAt: nowIso,
    },
    openWhatsApp: true,
    createdTipRequest: true,
  };
}

export function planTipCheckout(
  record: Pick<JourneyTipRecord, "status" | "pendingCheckoutId" | "pendingPaymentUrl" | "pendingAmountGbp">,
  amountGbp: number,
): "already_paid" | "reuse" | "create" {
  if (record.status === "paid") return "already_paid";
  if (
    record.pendingCheckoutId &&
    record.pendingPaymentUrl &&
    typeof record.pendingAmountGbp === "number" &&
    Math.abs(record.pendingAmountGbp - amountGbp) < 0.001
  ) {
    return "reuse";
  }
  return "create";
}

/**
 * Apply a SumUp read to a tip record.
 * `proof.paid` must already be the result of a trusted SumUp status check.
 * A browser return, without `paid: true` from that check, leaves the tip unpaid.
 * A second successful checkout cannot replace an already-paid tip.
 */
export function applyConfirmedSumUpTip(
  record: JourneyTipRecord,
  proof: SumUpTipProof,
  nowIso: string,
): { record: JourneyTipRecord; paidNow: boolean; paymentNotCompleted: boolean } {
  if (record.status === "paid") {
    return { record, paidNow: false, paymentNotCompleted: false };
  }

  const checkoutId = proof.checkoutId.trim();
  if (!checkoutId) {
    return { record, paidNow: false, paymentNotCompleted: false };
  }

  if (!proof.paid) {
    const status = String(proof.status ?? "").toUpperCase();
    const relevant = !record.pendingCheckoutId || record.pendingCheckoutId === checkoutId;
    return {
      record,
      paidNow: false,
      paymentNotCompleted: relevant && TERMINAL_UNPAID_STATUSES.has(status),
    };
  }

  const fromSumUp =
    typeof proof.amount === "number" && Number.isFinite(proof.amount) ? proof.amount : undefined;
  const fallback =
    record.pendingCheckoutId === checkoutId && typeof record.pendingAmountGbp === "number"
      ? record.pendingAmountGbp
      : undefined;
  const amount = fromSumUp ?? fallback;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return { record, paidNow: false, paymentNotCompleted: false };
  }
  const amountGbp = Math.round(amount * 100) / 100;

  return {
    paidNow: true,
    paymentNotCompleted: false,
    record: {
      ...record,
      status: "paid",
      amountGbp,
      paidAt: nowIso,
      checkoutId,
      ...(proof.checkoutReference ? { checkoutReference: proof.checkoutReference } : {}),
      ...(proof.transactionCode ? { transactionCode: proof.transactionCode } : {}),
      ...(proof.transactionId ? { transactionId: proof.transactionId } : {}),
    },
  };
}

export function publicTipState(
  record: JourneyTipRecord,
  paymentNotCompleted = false,
):
  | { ok: true; state: "paid"; amountGbp: number }
  | { ok: true; state: "open"; paymentNotCompleted?: boolean } {
  if (record.status === "paid" && typeof record.amountGbp === "number" && record.amountGbp > 0) {
    return { ok: true, state: "paid", amountGbp: record.amountGbp };
  }
  return {
    ok: true,
    state: "open",
    ...(paymentNotCompleted ? { paymentNotCompleted: true } : {}),
  };
}

export function whatsAppHrefForMobile(mobile: string, message: string): string | null {
  const digits = mobile.replace(/\D/g, "");
  if (digits.length < 10) return null;
  const waNumber = digits.startsWith("44")
    ? digits
    : digits.startsWith("0")
      ? `44${digits.slice(1)}`
      : digits;
  return `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`;
}

export function parseCustomerTipped(value: unknown): boolean | undefined {
  if (value === true || value === false) return value;
  return undefined;
}
