import {
  blockMeasurementInMemory,
  clearOptionalMeasurementStorage,
  consentPreferenceWriteFailed,
  CONSENT_FAIL_CLOSED_PARAM,
} from "./cookie-consent";
import { markConsentQuoteRecovery } from "./booking-draft-storage";

let stopping = false;
let contained = false;
/** Keep optional tags in this document, where withdrawal can stop their transport.
 * Hosted SumUp checkout navigates to a separate top-level document. This site
 * does not use embedded frames or workers for quotes/bookings.
 */
export function containMeasurementExecution(): void {
  if (typeof document === "undefined" || contained) return;
  contained = true;
  const policy = document.createElement("meta");
  policy.httpEquiv = "Content-Security-Policy";
  policy.content = "worker-src 'none'; frame-src 'none'; object-src 'none'";
  document.head.appendChild(policy);
}
/**
 * A loaded script cannot be unloaded by unmounting React's Script component.
 * Block new transport immediately, then discard the document without waiting
 * for server acknowledgement. Already-started requests cannot be recalled.
 */
export function stopMeasurementAndReload(): void {
  if (typeof window === "undefined" || stopping) return;
  stopping = true;
  window.dispatchEvent(new Event("matni-preserve-booking-for-consent-reload"));
  blockMeasurementInMemory();
  window.gtag = () => {};
  window.dataLayer = [];
  // Temporary, document-local CSP closes fetch/beacon, pixel, frame and script
  // transports, including independent callbacks, while navigation is starting.
  // It disappears on reload; normal essential booking/payment APIs then resume.
  const policy = document.createElement("meta");
  policy.httpEquiv = "Content-Security-Policy";
  policy.content = "connect-src 'none'; img-src 'self' data: blob:; script-src 'none'; frame-src 'none'; worker-src 'none'; media-src 'none'; object-src 'none'; form-action 'none'";
  document.head.appendChild(policy);
  // Existing frames have their own policies: discard them rather than assuming
  // the new parent policy controls a previously loaded third-party document.
  document.querySelectorAll("iframe").forEach((frame) => frame.remove());
  clearOptionalMeasurementStorage();
  const reload = () => {
    markConsentQuoteRecovery();
    if (consentPreferenceWriteFailed()) {
      // Storage may still contain an old grant if writes/removal were refused.
      const url = new URL(window.location.href);
      url.searchParams.set(CONSENT_FAIL_CLOSED_PARAM, "off");
      window.location.replace(url.toString());
    } else {
      window.location.reload();
    }
  };
  if (navigator.onLine === false) {
    // Keep the existing quote visible offline behind the transport block, then
    // replace the document before any newly permitted online work can run.
    window.addEventListener("online", reload, { once: true, capture: true });
  } else {
    reload();
  }
}
