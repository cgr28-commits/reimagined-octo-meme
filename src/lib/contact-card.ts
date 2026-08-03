import { SITE } from "@/lib/data";
import { withBasePath } from "@/lib/paths";

export const CONTACT_CARD_PATH = "/contact/";
export const CONTACT_VCARD_PATH = "/my-airport-taxi-ni.vcf";

/** Served with correct text/vcard MIME from the worker. */
export const CONTACT_VCARD_WORKER_URL =
  "https://reimagined-octo-meme.cgr28.workers.dev/contact.vcf";

export function contactCardUrl(): string {
  return `${SITE.url}${CONTACT_CARD_PATH}`;
}

export function contactVCardUrl(): string {
  return withBasePath(CONTACT_VCARD_PATH);
}

export function whatsAppChatUrl(message = SITE.whatsappDefaultMessage): string {
  const text = encodeURIComponent(message);
  return `https://wa.me/${SITE.whatsapp}?text=${text}`;
}

/**
 * One-tap save to the phone address book.
 *
 * Note: iPhone Safari often imports phone/email/WhatsApp correctly but drops
 * the contact photo. Android usually keeps the logo. The branded /contact/
 * page and QR remain the logo-forward experience on iPhone.
 */
export function openContactVCard(): void {
  window.location.href = CONTACT_VCARD_WORKER_URL;
}
