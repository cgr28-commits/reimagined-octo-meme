/**
 * Permanent NFC / QR passenger landing page at /tap.
 * Tips created here are anonymous (source=tap) and never use a booking card.
 */

import { BUSINESS_WEBSITE, businessWhatsAppChatUrl } from "./business-email";
import { DEFAULT_GOOGLE_REVIEW_URL } from "./google-business-profile";
import { CONTACT_VCARD_PUBLIC_PATH } from "./business-links";

export const TAP_PUBLIC_PATH = "/tap";
export const TAP_PUBLIC_URL = `${BUSINESS_WEBSITE}${TAP_PUBLIC_PATH}`;

export const TAP_HEADING = "THANK YOU FOR TRAVELLING WITH US";
/** Two centred lines on standard iPhone widths; joined for meta/descriptions. */
export const TAP_SUBHEADING_LINES = [
  "We hope you enjoyed your journey.",
  "We’d love to see you again.",
] as const;
export const TAP_SUBHEADING = TAP_SUBHEADING_LINES.join(" ");

/** Headrest tip presets (journey-email tips keep £3 / £5 / £10). */
export const TAP_TIP_PRESET_AMOUNTS_GBP = [2, 5, 10, 20] as const;

export const TAP_TIP_SOURCE = "tap" as const;
export const TAP_TIP_TRACKING_SENTINEL = "tap";

export const TAP_TIP_TOKEN_STORAGE_KEY = "matni-tap-tip-token";
export const TAP_TIP_QUERY_PARAM = "tip";

export const TAP_BOOK_HREF = "/#quote";
export const TAP_CONTACT_VCARD_HREF = CONTACT_VCARD_PUBLIC_PATH;
export const TAP_GOOGLE_REVIEW_URL = DEFAULT_GOOGLE_REVIEW_URL;

export const TAP_WHATSAPP_PREFILL =
  "Hello My Airport Taxi NI, I’d like to enquire about a taxi booking.";

export function tapWhatsAppHref(message = TAP_WHATSAPP_PREFILL): string {
  return businessWhatsAppChatUrl(message);
}

export function buildTapTipReturnUrl(tipToken: string): string {
  return `${TAP_PUBLIC_URL}/?${TAP_TIP_QUERY_PARAM}=${encodeURIComponent(tipToken)}`;
}

/**
 * Runs before analytics on /tap only: store a valid tip token from ?tip=, then
 * drop the query string so the permanent NFC URL stays clean in history/referrers.
 */
export const TAP_TIP_TOKEN_STRIP_SCRIPT = `(function(){try{var path=String(location.pathname||"").replace(/\\/+$/,"")||"/";if(path!=="/tap")return;var search=String(location.search||"");if(!search)return;var params=new URLSearchParams(search);var token=String(params.get("tip")||"").trim().toLowerCase();if(/^[a-f0-9]{32}$/.test(token)){try{sessionStorage.setItem(${JSON.stringify(TAP_TIP_TOKEN_STORAGE_KEY)},token);}catch(e){}}history.replaceState(history.state,"",String(location.pathname||"")+String(location.hash||""));}catch(e){}})();`;

/** Anonymous click / visit events (no PII). Completed tips are counted server-side. */
export const TAP_EVENT_NAMES = [
  "visit",
  "review_click",
  "tip_open",
  "contact_click",
  "book_click",
  "whatsapp_click",
] as const;

export type TapEventName = (typeof TAP_EVENT_NAMES)[number];

export function isTapEventName(value: unknown): value is TapEventName {
  return typeof value === "string" && (TAP_EVENT_NAMES as readonly string[]).includes(value);
}

export type TapMetricsSnapshot = {
  visits: number;
  reviewClicks: number;
  tipOpens: number;
  tipPaymentsCompleted: number;
  tipTotalGbp: number;
  tipAverageGbp: number;
  contactClicks: number;
  bookClicks: number;
  whatsappClicks: number;
  updatedAt: string | null;
};

export function emptyTapMetrics(nowIso: string | null = null): TapMetricsSnapshot {
  return {
    visits: 0,
    reviewClicks: 0,
    tipOpens: 0,
    tipPaymentsCompleted: 0,
    tipTotalGbp: 0,
    tipAverageGbp: 0,
    contactClicks: 0,
    bookClicks: 0,
    whatsappClicks: 0,
    updatedAt: nowIso,
  };
}

export function averageTipGbp(totalGbp: number, completed: number): number {
  if (!completed || !Number.isFinite(totalGbp) || totalGbp <= 0) return 0;
  return Math.round((totalGbp / completed) * 100) / 100;
}

export function applyTapEvent(
  current: TapMetricsSnapshot,
  event: TapEventName,
  nowIso: string,
): TapMetricsSnapshot {
  const next = { ...current, updatedAt: nowIso };
  switch (event) {
    case "visit":
      next.visits += 1;
      break;
    case "review_click":
      next.reviewClicks += 1;
      break;
    case "tip_open":
      next.tipOpens += 1;
      break;
    case "contact_click":
      next.contactClicks += 1;
      break;
    case "book_click":
      next.bookClicks += 1;
      break;
    case "whatsapp_click":
      next.whatsappClicks += 1;
      break;
  }
  return next;
}

export function applyTapTipPaid(
  current: TapMetricsSnapshot,
  amountGbp: number,
  nowIso: string,
): TapMetricsSnapshot {
  const amount = Math.round(amountGbp * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) return current;
  const tipPaymentsCompleted = current.tipPaymentsCompleted + 1;
  const tipTotalGbp = Math.round((current.tipTotalGbp + amount) * 100) / 100;
  return {
    ...current,
    tipPaymentsCompleted,
    tipTotalGbp,
    tipAverageGbp: averageTipGbp(tipTotalGbp, tipPaymentsCompleted),
    updatedAt: nowIso,
  };
}
