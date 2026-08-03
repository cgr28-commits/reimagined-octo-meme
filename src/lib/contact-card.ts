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

/**
 * Save the branded contact (with logo) to the device address book.
 *
 * On iPhone, Safari's built-in "Create New Contact" preview often strips photos.
 * Sharing the .vcf file via the system share sheet preserves the logo — user
 * should choose Contacts / Save to Contacts.
 */
export async function saveContactToDevice(): Promise<"shared" | "downloaded"> {
  const response = await fetch(contactVCardUrl(), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not load contact card (${response.status})`);
  }

  const text = await response.text();
  if (!text.includes("BEGIN:VCARD") || !text.includes("PHOTO")) {
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

  if (typeof navigator !== "undefined" && navigator.canShare?.(shareData)) {
    await navigator.share(shareData);
    return "shared";
  }

  // Fallback: open the worker URL so MIME is text/vcard (better than GH Pages).
  window.location.href = CONTACT_VCARD_WORKER_URL;
  return "downloaded";
}
