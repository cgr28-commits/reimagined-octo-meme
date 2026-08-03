import { SITE } from "@/lib/data";
import { withBasePath } from "@/lib/paths";

export const CONTACT_CARD_PATH = "/contact/";
export const CONTACT_VCARD_PATH = "/my-airport-taxi-ni.vcf";

/** Worker-served vCard with correct text/vcard MIME (GitHub Pages uses text/x-vcard). */
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

function isAppleMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/**
 * Save the branded contact (with logo) to the device address book.
 *
 * Important: Safari’s built-in “Create New Contact” preview strips photos.
 * On iPhone we only use the system share sheet so Contacts receives the full
 * .vcf (including the logo). Choose “Contacts” in that sheet.
 */
export async function saveContactToDevice(): Promise<"shared" | "downloaded"> {
  const response = await fetch(contactVCardUrl(), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not load contact card (${response.status})`);
  }

  const text = await response.text();
  if (!text.includes("BEGIN:VCARD") || !/PHOTO;ENCODING=b;TYPE=JP(E)?G:/i.test(text)) {
    throw new Error("Contact card file is missing the logo photo");
  }

  const file = new File([text], "My-Airport-Taxi-NI.vcf", {
    type: "text/vcard;charset=utf-8",
  });

  const shareData: ShareData = {
    files: [file],
    title: SITE.name,
    text: `${SITE.name} contact card`,
  };

  const canShareFiles =
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    (typeof navigator.canShare !== "function" || navigator.canShare(shareData));

  if (canShareFiles) {
    await navigator.share(shareData);
    return "shared";
  }

  // Do not open the .vcf in Safari on iPhone — that preview drops the logo.
  if (isAppleMobile()) {
    throw new Error(
      "On iPhone, tap Save again and choose Contacts in the share sheet so the logo is kept.",
    );
  }

  window.location.href = CONTACT_VCARD_WORKER_URL;
  return "downloaded";
}
