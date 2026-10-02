/**
 * One customer message, two phone composers.
 * WhatsApp and SMS receive the same string. Nothing is sent from here.
 */

import { resolveGoogleReviewUrl } from "./business-links";
import { customerGreetingFirstName } from "./customer-first-name";
import { ownerWhatsAppDigits } from "./owner-job-actions";

export function buildCustomerWhatsAppHref(mobile: string, message: string): string | null {
  const digits = ownerWhatsAppDigits(mobile);
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/**
 * Opens the phone's Messages app with the recipient and body filled in.
 * `?&body=` is read by both iPhone (`&body=`) and Android (`?body=`).
 * The link does not send the message.
 */
export function buildCustomerSmsHref(mobile: string, message: string): string | null {
  const digits = ownerWhatsAppDigits(mobile);
  if (!digits) return null;
  return `sms:+${digits}?&body=${encodeURIComponent(message)}`;
}

export function customerChannelLinks(
  mobile: string,
  message: string,
): { message: string; whatsAppHref: string | null; smsHref: string | null } {
  return {
    message,
    whatsAppHref: buildCustomerWhatsAppHref(mobile, message),
    smsHref: buildCustomerSmsHref(mobile, message),
  };
}

/** Decode the customer text from a WhatsApp `text` or SMS `body` link. */
export function messageBodyFromCustomerChannelHref(href: string): string {
  const queryStart = href.indexOf("?");
  if (queryStart < 0) return "";
  const params = new URLSearchParams(href.slice(queryStart + 1).replace(/^&/, ""));
  return params.get("body") ?? params.get("text") ?? "";
}

export function buildGoogleReviewCustomerMessage(
  customerName: string | null | undefined,
  reviewUrl: string,
): string {
  const first = customerGreetingFirstName(customerName);
  const greeting = first ? `Hi ${first},` : "Hi,";
  return [
    greeting,
    "",
    "Thank you for travelling with My Airport Taxi NI.",
    "",
    "If you were happy with your journey, we’d really appreciate a Google review. It only takes a moment and really helps our business.",
    "",
    "Leave a review here:",
    reviewUrl,
    "",
    "Thank you again for choosing My Airport Taxi NI.",
  ].join("\n");
}

/**
 * Manual review text. Null when no official review URL is configured,
 * so the dashboard can keep the action disabled instead of inventing a link.
 */
export function googleReviewCustomerMessage(
  customerName: string | null | undefined,
  configuredUrl?: string,
): string | null {
  const reviewUrl = resolveGoogleReviewUrl(configuredUrl);
  if (!reviewUrl) return null;
  return buildGoogleReviewCustomerMessage(customerName, reviewUrl);
}
