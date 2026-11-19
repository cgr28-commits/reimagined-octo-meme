import type { SelectedPlace } from "@/lib/selected-place";

export type EventQuotePrefill = {
  pickup?: SelectedPlace | null;
  dropoff?: SelectedPlace | null;
  tripDate?: string;
  suggestReturnDate?: boolean;
  eventTitle?: string;
  listedId?: string;
  onAddressKept?: () => void;
};

export function prefillEventQuote(detail: EventQuotePrefill) {
  window.dispatchEvent(new CustomEvent("quote-prefill-place", { detail }));
}

// Only the most recent choice may fill an address after its asynchronous lookup.
let venueLookup = 0;
export function beginEventVenueLookup(): () => boolean {
  const current = ++venueLookup;
  return () => current === venueLookup;
}
