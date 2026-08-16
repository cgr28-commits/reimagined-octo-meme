/**
 * Persist confirmed autocomplete places so returning customers can continue
 * without tapping the same suggestion again.
 *
 * Only quote-ready places (placeId + address + lat/lng) are restored as confirmed.
 * Free-text alone is never treated as confirmed.
 */

import {
  isQuoteReadyPlace,
  type SelectedPlace,
} from "@/lib/selected-place";

export const PICKUP_ADDRESS_STORAGE_KEY = "my-airport-taxi-ni-pickup-address";
export const DROPOFF_ADDRESS_STORAGE_KEY = "my-airport-taxi-ni-dropoff-address";
export const PICKUP_PLACE_STORAGE_KEY = "my-airport-taxi-ni-pickup-place-v1";
export const DROPOFF_PLACE_STORAGE_KEY = "my-airport-taxi-ni-dropoff-place-v1";

function canUseLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function parseStoredPlace(raw: string | null): SelectedPlace | null {
  if (!raw?.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as SelectedPlace;
    if (!isQuoteReadyPlace(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveConfirmedPickupPlace(place: SelectedPlace): void {
  if (!canUseLocalStorage() || !isQuoteReadyPlace(place)) {
    return;
  }
  try {
    localStorage.setItem(PICKUP_PLACE_STORAGE_KEY, JSON.stringify(place));
    const label = (place.displayAddress || place.formattedAddress).trim();
    if (label) {
      localStorage.setItem(PICKUP_ADDRESS_STORAGE_KEY, label);
    }
  } catch {
    // ignore quota / private mode
  }
}

export function saveConfirmedDropoffPlace(place: SelectedPlace): void {
  if (!canUseLocalStorage() || !isQuoteReadyPlace(place)) {
    return;
  }
  try {
    localStorage.setItem(DROPOFF_PLACE_STORAGE_KEY, JSON.stringify(place));
    const label = (place.displayAddress || place.formattedAddress).trim();
    if (label) {
      localStorage.setItem(DROPOFF_ADDRESS_STORAGE_KEY, label);
    }
  } catch {
    // ignore
  }
}

export function clearConfirmedPickupPlace(): void {
  if (!canUseLocalStorage()) {
    return;
  }
  try {
    localStorage.removeItem(PICKUP_PLACE_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function clearConfirmedDropoffPlace(): void {
  if (!canUseLocalStorage()) {
    return;
  }
  try {
    localStorage.removeItem(DROPOFF_PLACE_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function clearPickupAddressStorage(): void {
  if (!canUseLocalStorage()) {
    return;
  }
  try {
    localStorage.removeItem(PICKUP_ADDRESS_STORAGE_KEY);
    localStorage.removeItem(PICKUP_PLACE_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function clearDropoffAddressStorage(): void {
  if (!canUseLocalStorage()) {
    return;
  }
  try {
    localStorage.removeItem(DROPOFF_ADDRESS_STORAGE_KEY);
    localStorage.removeItem(DROPOFF_PLACE_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Restore a previously confirmed autocomplete selection, or null if incomplete/stale. */
export function readConfirmedPickupPlace(): SelectedPlace | null {
  if (!canUseLocalStorage()) {
    return null;
  }
  return parseStoredPlace(localStorage.getItem(PICKUP_PLACE_STORAGE_KEY));
}

export function readConfirmedDropoffPlace(): SelectedPlace | null {
  if (!canUseLocalStorage()) {
    return null;
  }
  return parseStoredPlace(localStorage.getItem(DROPOFF_PLACE_STORAGE_KEY));
}

export function readStoredPickupAddressLabel(): string {
  if (!canUseLocalStorage()) {
    return "";
  }
  return localStorage.getItem(PICKUP_ADDRESS_STORAGE_KEY)?.trim() ?? "";
}

export function readStoredDropoffAddressLabel(): string {
  if (!canUseLocalStorage()) {
    return "";
  }
  return localStorage.getItem(DROPOFF_ADDRESS_STORAGE_KEY)?.trim() ?? "";
}

export function savePickupAddressLabel(label: string): void {
  if (!canUseLocalStorage()) {
    return;
  }
  const trimmed = label.trim();
  try {
    if (trimmed) {
      localStorage.setItem(PICKUP_ADDRESS_STORAGE_KEY, trimmed);
    } else {
      localStorage.removeItem(PICKUP_ADDRESS_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

export function saveDropoffAddressLabel(label: string): void {
  if (!canUseLocalStorage()) {
    return;
  }
  const trimmed = label.trim();
  try {
    if (trimmed) {
      localStorage.setItem(DROPOFF_ADDRESS_STORAGE_KEY, trimmed);
    } else {
      localStorage.removeItem(DROPOFF_ADDRESS_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}
