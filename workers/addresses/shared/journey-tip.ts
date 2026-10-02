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

export const TIP_TOKEN_STORAGE_KEY = "matni-tip-token";

/**
 * Runs from the root layout as a blocking beforeInteractive script, before
 * TrafficGuard, Google Ads, attribution, or fraud monitoring can read the URL.
 * On /tip/ only: store a valid token, then drop the whole query string.
 */
export const TIP_TOKEN_STRIP_SCRIPT = `(function(){try{var path=String(location.pathname||"").replace(/\\/+$/,"")||"/";if(path!=="/tip")return;var search=String(location.search||"");if(!search)return;var params=new URLSearchParams(search);var token=String(params.get("t")||"").trim().toLowerCase();if(/^[a-f0-9]{32}$/.test(token)){try{sessionStorage.setItem(${JSON.stringify(TIP_TOKEN_STORAGE_KEY)},token);}catch(e){}}history.replaceState(history.state,"",String(location.pathname||"")+String(location.hash||""));}catch(e){}})();`;

const TERMINAL_UNPAID_STATUSES = new Set([
  "FAILED",
  "EXPIRED",
  "CANCELLED",
  "CANCELED",
  "DECLINED",
]);

export function isTerminalUnpaidTipStatus(status: string | undefined): boolean {
  return TERMINAL_UNPAID_STATUSES.has(String(status ?? "").toUpperCase());
}

/** SumUp read for the single checkout currently stored on the tip. */
export type TipCheckoutLiveStatus = {
  paid: boolean;
  status?: string;
};

export type TipCheckoutPlan = "already_paid" | "reuse" | "in_progress" | "create";

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

/** Canonical optional-tip wording. WhatsApp and SMS both use this string. */
export function optionalTipMessage(tipUrl: string): string {
  return `Thank you for travelling with My Airport Taxi NI. We hope you had a comfortable journey. If you’d like to leave an optional tip, you can do so securely here: ${tipUrl}`;
}

export function optionalTipWhatsAppMessage(tipUrl: string): string {
  return optionalTipMessage(tipUrl);
}

export function tipWhatsAppMessage(decision: StoredTipDecision): string | null {
  if (decision.tipDecision === "yes") {
    return TIPPED_IN_PERSON_MESSAGE;
  }
  if (decision.tipDecision === "no" && decision.tipToken && isOpaqueTipToken(decision.tipToken)) {
    return optionalTipMessage(buildTipPageUrl(decision.tipToken));
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

/**
 * One SumUp checkout_reference per payment attempt.
 * Concurrent creates for the same attempt share it, so SumUp's duplicate
 * response can be reused. A terminal attempt advances to the next number.
 * The reference does not include the time, so two in-flight requests cannot
 * each mint a distinct payable checkout.
 */
export function tipCheckoutReferenceForAttempt(
  record: Pick<JourneyTipRecord, "tipToken" | "pendingCheckoutId" | "pendingCheckoutReference">,
): string {
  const token = record.tipToken.trim().toLowerCase();
  if (!record.pendingCheckoutId?.trim()) {
    return `tip-${token}-1`;
  }
  const current = record.pendingCheckoutReference?.trim() ?? "";
  const match = new RegExp(`^tip-${token}-(\\d+)$`).exec(current);
  const attempt = match ? Number(match[1]) : 0;
  const next = Number.isInteger(attempt) && attempt >= 1 ? attempt + 1 : 2;
  return `tip-${token}-${next}`;
}

export function tipPaymentInProgressMessage(amountGbp: number | undefined): string {
  if (typeof amountGbp === "number" && Number.isFinite(amountGbp)) {
    return `A ${formatTipGbp(amountGbp)} tip payment is already in progress. Finish that payment before choosing another amount.`;
  }
  return "A tip payment is already in progress. Finish that payment before choosing another amount.";
}

/**
 * One live SumUp checkout per tip. A different amount must not open a second
 * checkout while the current one is still non-terminal. A replacement is
 * allowed only after SumUp says the current checkout is terminally unpaid.
 * Missing SumUp status fails closed and does not create another checkout.
 */
export function planTipCheckout(
  record: Pick<
    JourneyTipRecord,
    "status" | "pendingCheckoutId" | "pendingPaymentUrl" | "pendingAmountGbp"
  >,
  requestedAmountGbp: number,
  live?: TipCheckoutLiveStatus | null,
): TipCheckoutPlan {
  if (record.status === "paid" || live?.paid) return "already_paid";
  if (!record.pendingCheckoutId) return "create";
  if (!live || !isTerminalUnpaidTipStatus(live.status)) {
    if (
      live &&
      record.pendingPaymentUrl &&
      typeof record.pendingAmountGbp === "number" &&
      Math.abs(record.pendingAmountGbp - requestedAmountGbp) < 0.001
    ) {
      return "reuse";
    }
    return "in_progress";
  }
  return "create";
}

function tipCheckoutMatchesExpected(record: JourneyTipRecord, proof: SumUpTipProof): boolean {
  const checkoutId = proof.checkoutId.trim();
  if (!record.pendingCheckoutId || checkoutId !== record.pendingCheckoutId) return false;
  const expectedRef = record.pendingCheckoutReference?.trim();
  const proofRef = proof.checkoutReference?.trim();
  if (expectedRef && proofRef && expectedRef !== proofRef) return false;
  if (
    typeof proof.amount === "number" &&
    Number.isFinite(proof.amount) &&
    typeof record.pendingAmountGbp === "number"
  ) {
    const amountGbp = Math.round(proof.amount * 100) / 100;
    if (Math.abs(amountGbp - record.pendingAmountGbp) > 0.001) return false;
  }
  return true;
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
  if (!checkoutId || !tipCheckoutMatchesExpected(record, proof)) {
    return { record, paidNow: false, paymentNotCompleted: false };
  }

  if (!proof.paid) {
    return {
      record,
      paidNow: false,
      paymentNotCompleted: isTerminalUnpaidTipStatus(proof.status),
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
