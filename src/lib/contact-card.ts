import { SITE } from "@/lib/data";
import { withBasePath } from "@/lib/paths";

export const CONTACT_CARD_PATH = "/contact/";
export const CONTACT_VCARD_PATH = "/my-airport-taxi-ni.vcf";

export function contactCardUrl(): string {
  return `${SITE.url}${CONTACT_CARD_PATH}`;
}

export function whatsAppChatUrl(message = SITE.whatsappDefaultMessage): string {
  const text = encodeURIComponent(message);
  return `https://wa.me/${SITE.whatsapp}?text=${text}`;
}

/** Text-only vCard fallback. Prefer the static file with embedded logo photo. */
export function buildContactVCard(): string {
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    "FN:My Airport Taxi NI",
    "N:Taxi NI;My Airport;;;",
    "ORG:My Airport Taxi NI",
    "TITLE:Airport Transfers",
    `TEL;TYPE=VOICE,WORK:${SITE.landline}`,
    `TEL;TYPE=CELL,WHATSAPP:+${SITE.whatsapp}`,
    `EMAIL;TYPE=INTERNET,WORK:${SITE.email}`,
    `URL:${SITE.url}`,
    `PHOTO;VALUE=URI:${SITE.url}/contact-photo.jpg`,
    `X-SOCIALPROFILE;TYPE=whatsapp:https://wa.me/${SITE.whatsapp}`,
    `NOTE:WhatsApp @${SITE.whatsappUsername} · Premium airport transfers across Northern Ireland`,
    "END:VCARD",
  ];

  return `${lines.join("\r\n")}\r\n`;
}

/** Downloads the static vCard with the brand logo embedded as the contact photo. */
export function downloadContactVCard(): void {
  const anchor = document.createElement("a");
  anchor.href = withBasePath(CONTACT_VCARD_PATH);
  anchor.download = "my-airport-taxi-ni.vcf";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
