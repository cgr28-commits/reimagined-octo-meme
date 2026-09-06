import {
  CUSTOMER_SMART_AVAILABILITY_PREVIEW_HEADER,
  CUSTOMER_SMART_AVAILABILITY_PREVIEW_QUERY,
  CUSTOMER_SMART_AVAILABILITY_UNAVAILABLE_MESSAGE,
  isPagesPreviewOrigin,
  withCustomerSmartAvailabilityPreviewQuery,
} from "../../shared/customer-smart-availability";

export { CUSTOMER_SMART_AVAILABILITY_UNAVAILABLE_MESSAGE };

export function isCustomerSmartAvailabilityPreviewActive(
  search = typeof window === "undefined" ? "" : window.location.search,
  host = typeof window === "undefined" ? "" : window.location.hostname,
): boolean {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return (
    isPagesPreviewOrigin(host) &&
    params.get(CUSTOMER_SMART_AVAILABILITY_PREVIEW_QUERY) === "1"
  );
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
  return String(message || "").trim() === CUSTOMER_SMART_AVAILABILITY_UNAVAILABLE_MESSAGE;
}
