import {
  CUSTOMER_SMART_AVAILABILITY_PREVIEW_HEADER,
  CUSTOMER_SMART_AVAILABILITY_PREVIEW_QUERY,
  CUSTOMER_SMART_AVAILABILITY_UNAVAILABLE_MESSAGE,
  isCustomerSmartAvailabilityUnavailableMessage,
  isPagesPreviewOrigin,
  parsePublicCustomerAlternativeTimes,
  withCustomerSmartAvailabilityPreviewQuery,
  type CustomerBookingAvailabilityInput,
  type CustomerPublicAlternativeTime,
} from "../../shared/customer-smart-availability";
import { resolveWorkerBaseUrl } from "@/lib/worker-api";

export {
  CUSTOMER_CHOOSE_ANOTHER_TIME_LABEL,
  CUSTOMER_OTHER_TIMES_HEADING,
  CUSTOMER_SMART_AVAILABILITY_UNAVAILABLE_MESSAGE,
  CUSTOMER_WHATSAPP_SECONDARY_MESSAGE,
} from "../../shared/customer-smart-availability";

const PREVIEW_STORAGE_KEY = "matni.smartAvailabilityPreview";
const WORKER_BASE = resolveWorkerBaseUrl();

function readStoredPreviewFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(PREVIEW_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function persistPreviewFlag(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PREVIEW_STORAGE_KEY, "1");
  } catch {
    // Private mode / blocked storage must not break quoting.
  }
}

export function rememberCustomerSmartAvailabilityPreview(
  search = typeof window === "undefined" ? "" : window.location.search,
  host = typeof window === "undefined" ? "" : window.location.hostname,
): boolean {
  if (!isPagesPreviewOrigin(host)) return false;
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (params.get(CUSTOMER_SMART_AVAILABILITY_PREVIEW_QUERY) === "1") {
    persistPreviewFlag();
    return true;
  }
  return readStoredPreviewFlag();
}

export function isCustomerSmartAvailabilityPreviewActive(
  search = typeof window === "undefined" ? "" : window.location.search,
  host = typeof window === "undefined" ? "" : window.location.hostname,
): boolean {
  return rememberCustomerSmartAvailabilityPreview(search, host);
}

export function customerSmartAvailabilityPreviewHeaders(): Record<string, string> {
  if (!isCustomerSmartAvailabilityPreviewActive()) return {};
  return { [CUSTOMER_SMART_AVAILABILITY_PREVIEW_HEADER]: "1" };
}

export function withCustomerSmartAvailabilityPreviewUrl(url: string): string {
  if (!isCustomerSmartAvailabilityPreviewActive()) return url;
  return withCustomerSmartAvailabilityPreviewQuery(url);
}

export function isCustomerSmartAvailabilityBlockMessage(message?: string | null): boolean {
  return isCustomerSmartAvailabilityUnavailableMessage(message);
}

export type CustomerSmartAvailabilityCheckResult = {
  blocked: boolean;
  available: boolean;
  customerMessage: string | null;
  alternativeTimes: CustomerPublicAlternativeTime[];
};

function failOpenAvailability(): CustomerSmartAvailabilityCheckResult {
  return { blocked: false, available: true, customerMessage: null, alternativeTimes: [] };
}

/** Preflight only. Never surfaces owner reason codes. Fail-open on errors. */
export async function checkCustomerSmartAvailability(
  booking: CustomerBookingAvailabilityInput,
): Promise<CustomerSmartAvailabilityCheckResult> {
  try {
    const response = await fetch(
      withCustomerSmartAvailabilityPreviewUrl(`${WORKER_BASE}/quote/availability`),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...customerSmartAvailabilityPreviewHeaders(),
        },
        body: JSON.stringify(booking),
        cache: "no-store",
      },
    );
    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!payload || typeof payload !== "object") return failOpenAvailability();
    if (payload.blocked === true) {
      const alternativeTimes = parsePublicCustomerAlternativeTimes(payload.alternativeTimes);
      const customerMessage =
        typeof payload.customerMessage === "string" &&
        isCustomerSmartAvailabilityUnavailableMessage(payload.customerMessage)
          ? payload.customerMessage
          : CUSTOMER_SMART_AVAILABILITY_UNAVAILABLE_MESSAGE;
      return {
        blocked: true,
        available: false,
        customerMessage,
        alternativeTimes,
      };
    }
    return failOpenAvailability();
  } catch {
    return failOpenAvailability();
  }
}
