/**
 * One short confirmation tick for a completed quote choice.
 *
 * iPhone Safari, and every other iOS browser, does not implement
 * navigator.vibrate. WebKit's position is to not ship the Vibration API.
 * There is no web haptic API on iPhone. This module does not imitate one
 * with a hidden switch, a shake, or any visual movement.
 *
 * Android Chrome, Edge, Samsung Internet, and Android WebView can vibrate
 * after the customer has tapped the page. Firefox for Android exposes
 * navigator.vibrate but does not produce a vibration. Desktop browsers
 * either lack the API or have no vibration motor, so a fine pointer is skipped.
 */

/** Lightest duration that still registers as a tick on Android motors. */
export const SELECTION_HAPTIC_MS = 15;

export function canUseSelectionHaptic(env: {
  vibrate: unknown;
  coarsePointer: boolean;
}): boolean {
  return typeof env.vibrate === "function" && env.coarsePointer;
}

export function tickSelectionHaptic(): void {
  if (typeof window === "undefined" || typeof navigator === "undefined") return;
  const coarse = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  if (!canUseSelectionHaptic({ vibrate: navigator.vibrate, coarsePointer: coarse })) return;
  try {
    navigator.vibrate(SELECTION_HAPTIC_MS);
  } catch {
    // The device refused. The quote continues without feedback.
  }
}
