/**
 * Website side of the email promo codes (Worker routes in workers/addresses/src/promo-handlers.ts).
 */
import { resolveWorkerBaseUrl } from "@/lib/worker-api";
import type { PublicPromoConfig } from "../../shared/promo-code";

const WORKER_BASE = resolveWorkerBaseUrl();

export type { PublicPromoConfig };

const DISABLED: PublicPromoConfig = {
  enabled: false,
  discountRate: 0.1,
  discountPercentLabel: "10%",
  minimumVehicleFareGbp: 100,
  validityDays: 30,
  popupEnabled: false,
  popupDelaySeconds: 20,
};

let configPromise: Promise<PublicPromoConfig> | null = null;

/** One request per page load; any failure simply hides the promotion. */
export function fetchPromoConfig(): Promise<PublicPromoConfig> {
  if (typeof window === "undefined") return Promise.resolve(DISABLED);
  if (!configPromise) {
    configPromise = fetch(`${WORKER_BASE}/promo/config`, { headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((payload) => {
        const config = payload?.config as Partial<PublicPromoConfig> | undefined;
        if (!config || config.enabled !== true) return DISABLED;
        return { ...DISABLED, ...config, enabled: true } as PublicPromoConfig;
      })
      .catch(() => DISABLED);
  }
  return configPromise;
}

export type PromoRequestResult = { ok: true; message: string } | { ok: false; error: string };

export async function requestPromoCode(input: {
  email: string;
  marketingOptIn: boolean;
  source: "popup" | "mobile-banner" | "quote-banner" | "exit-intent";
  /** Honeypot — must stay empty. */
  website?: string;
}): Promise<PromoRequestResult> {
  try {
    const response = await fetch(`${WORKER_BASE}/promo/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(input),
    });
    const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string; error?: string } | null;
    if (response.ok && payload?.ok) return { ok: true, message: String(payload.message ?? "") };
    return { ok: false, error: String(payload?.error || "Sorry, something went wrong. Please try again.") };
  } catch {
    return { ok: false, error: "We couldn't reach our server. Please check your connection and try again." };
  }
}

export type PromoValidation =
  | {
      ok: true;
      code: string;
      discountRate: number;
      minimumVehicleFareGbp: number;
      expiresAt: string;
      meetsMinimum: boolean;
      warning?: string;
    }
  | { ok: false; reason: string; error: string };

export async function validatePromoCode(input: { code: string; email: string; vehicleFareGbp?: number }): Promise<PromoValidation> {
  try {
    const response = await fetch(`${WORKER_BASE}/promo/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(input),
    });
    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (payload?.ok === true) {
      return {
        ok: true,
        code: String(payload.code),
        discountRate: Number(payload.discountRate),
        minimumVehicleFareGbp: Number(payload.minimumVehicleFareGbp),
        expiresAt: String(payload.expiresAt ?? ""),
        meetsMinimum: payload.meetsMinimum !== false,
        ...(typeof payload.warning === "string" ? { warning: payload.warning } : {}),
      };
    }
    return {
      ok: false,
      reason: String(payload?.reason ?? "error"),
      error: String(payload?.error ?? "We couldn't check your promo code just now. Please try again."),
    };
  } catch {
    return { ok: false, reason: "network", error: "We couldn't check your promo code just now. Please try again." };
  }
}

/* --------------------------------------------------------------- browser memory */

const PROMO_FROM_LINK_KEY = "matni-promo-code";
export const PROMO_POPUP_STATE_KEY = "matni-promo-popup-v1";
export const PROMO_POPUP_DISMISS_DAYS = 30;

/** Code carried in from the email link (?promo=...), kept for this browser session only. */
export function rememberPromoCodeFromUrl(): string {
  if (typeof window === "undefined") return "";
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("promo")?.trim() ?? "";
    if (fromUrl) {
      window.sessionStorage.setItem(PROMO_FROM_LINK_KEY, fromUrl.slice(0, 32));
      return fromUrl.slice(0, 32);
    }
    return window.sessionStorage.getItem(PROMO_FROM_LINK_KEY) ?? "";
  } catch {
    return "";
  }
}

type PopupState = { dismissedAt?: number; signedUpAt?: number };

function readPopupState(): PopupState {
  try {
    const raw = window.localStorage.getItem(PROMO_POPUP_STATE_KEY);
    return raw ? (JSON.parse(raw) as PopupState) : {};
  } catch {
    return {};
  }
}

function writePopupState(next: PopupState): void {
  try {
    window.localStorage.setItem(PROMO_POPUP_STATE_KEY, JSON.stringify(next));
  } catch {
    // Private browsing: the pop-up may show again next visit, nothing else breaks.
  }
}

/** Never after a sign-up on this browser; not for 30 days after it was closed. */
export function promoPopupAllowed(now = Date.now()): boolean {
  if (typeof window === "undefined") return false;
  const state = readPopupState();
  if (state.signedUpAt) return false;
  if (state.dismissedAt && now - state.dismissedAt < PROMO_POPUP_DISMISS_DAYS * 86_400_000) return false;
  return true;
}

export function markPromoPopupDismissed(now = Date.now()): void {
  writePopupState({ ...readPopupState(), dismissedAt: now });
}

export function markPromoSignedUp(now = Date.now()): void {
  writePopupState({ ...readPopupState(), signedUpAt: now });
  try {
    window.dispatchEvent(new CustomEvent(PROMO_SIGNED_UP_EVENT));
  } catch {
    // ignore
  }
}

export const PROMO_SIGNED_UP_EVENT = "matni-promo-signed-up";
/** Fired by the quote-results banner to open the sign-up form on request. */
export const PROMO_OPEN_EVENT = "matni-promo-open";

/** The booking tool marks the page while a customer is part-way through booking or paying. */
export function bookingInProgress(): boolean {
  if (typeof document === "undefined") return false;
  const root = document.documentElement;
  if (root.dataset.bookingInProgress === "1") return true;
  const active = document.activeElement;
  return Boolean(active && active.closest("form, [data-quote-card], #quote, [role='dialog']"));
}
