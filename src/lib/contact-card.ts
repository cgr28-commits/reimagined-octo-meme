import { SITE } from "@/lib/data";

export const CONTACT_CARD_PATH = "/contact/";

export function contactCardUrl(): string {
  return `${SITE.url}${CONTACT_CARD_PATH}`;
}

export function whatsAppChatUrl(message = SITE.whatsappDefaultMessage): string {
  const text = encodeURIComponent(message);
  return `https://wa.me/${SITE.whatsapp}?text=${text}`;
}

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
    `X-SOCIALPROFILE;TYPE=whatsapp:https://wa.me/${SITE.whatsapp}`,
    `NOTE:WhatsApp @${SITE.whatsappUsername} · Premium airport transfers across Northern Ireland`,
    "END:VCARD",
  ];

  return `${lines.join("\r\n")}\r\n`;
}

export function downloadContactVCard(): void {
  const blob = new Blob([buildContactVCard()], {
    type: "text/vcard;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "my-airport-taxi-ni.vcf";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
