import { SITE } from "@/lib/data";
import { hasMarketingCookieConsent } from "@/lib/cookie-consent";
import { trackContactClick } from "@/lib/google-ads-client";
import { withBasePath } from "@/lib/paths";

/** Public URL printed on QR codes, NFC cards and shared in messages (no trailing slash, as published). */
export const DIGITAL_CARD_URL = `${SITE.url}/card`;
export const DIGITAL_CARD_PATH = "/card/";

/** Static vCard for the digital card (business name, landline, website, card URL, logo). */
export const DIGITAL_CARD_VCARD_PATH = "/my-airport-taxi-ni-card.vcf";
export const DIGITAL_CARD_VCARD_FILENAME = "My-Airport-Taxi-NI.vcf";
const VCARD_VERSION = "v=20261114card";

export const DIGITAL_CARD_QR_PNG = "/card-qr.png";
export const DIGITAL_CARD_QR_SVG = "/card-qr.svg";

export function digitalCardVCardHref(): string {
  return `${withBasePath(DIGITAL_CARD_VCARD_PATH)}?${VCARD_VERSION}`;
}

/** Prepared WhatsApp message (owner wording, 14 Nov 2026). Never sent without the customer tapping Send. */
export const DIGITAL_CARD_SHARE_MESSAGE = [
  `✈️ ${SITE.name}`,
  "",
  "Belfast International, Belfast City & Dublin Airport Transfers.",
  "",
  "Get an instant quote, book securely online or save our contact details.",
  "",
  `📞 ${SITE.officeLandlineDisplay}`,
  "",
  `🌐 ${DIGITAL_CARD_URL}`,
].join("\n");

/** wa.me share link with no recipient: WhatsApp opens its chat picker (phone app or WhatsApp Web). */
export function whatsAppShareUrl(message: string = DIGITAL_CARD_SHARE_MESSAGE): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export type DigitalCardEvent =
  | "digital_card_view"
  | "digital_card_quote_click"
  | "digital_card_call_click"
  | "digital_card_whatsapp_click"
  | "digital_card_contact_download"
  | "digital_card_share"
  | "digital_card_qr_open"
  | "digital_card_home_screen_help";

/**
 * Diagnostic event through the site's existing Google tag. Sends nothing unless the visitor
 * accepted cookies in the existing banner, and never includes customer details.
 */
export function trackDigitalCardEvent(
  event: DigitalCardEvent,
  params: Record<string, string> = {},
): boolean {
  if (typeof window === "undefined" || !hasMarketingCookieConsent()) return false;
  const payload = { page_path: DIGITAL_CARD_PATH, ...params };
  try {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event, ...payload });
    if (typeof window.gtag === "function") window.gtag("event", event, payload);
  } catch {
    // Tracking must never break the card.
  }
  // Calls and WhatsApp taps also feed the site's existing contact-click conversions.
  if (event === "digital_card_call_click") trackContactClick("phone", DIGITAL_CARD_PATH);
  if (event === "digital_card_whatsapp_click") trackContactClick("whatsapp", DIGITAL_CARD_PATH);
  return true;
}

export type DeviceKind = "iphone" | "android" | "other";

export function detectDeviceKind(): DeviceKind {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) {
    return "iphone";
  }
  if (/Android/i.test(ua)) return "android";
  return "other";
}

/** True when the card is already open from the home screen (no need to show the guide). */
export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia?.("(display-mode: standalone)").matches === true;
}
