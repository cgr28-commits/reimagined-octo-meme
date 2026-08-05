import { SITE } from "@/lib/data";
import { withBasePath } from "@/lib/paths";

export const CONTACT_CARD_PATH = "/contact/";
export const CONTACT_VCARD_PATH = "/my-airport-taxi-ni.vcf";

/** Worker vCard — serve as text/vcard so phones open Add/Create Contact. */
export const CONTACT_VCARD_WORKER_URL =
  "https://reimagined-octo-meme.cgr28.workers.dev/contact.vcf";

/** Optional download for Files (keeps logo on some iPhones after Safari strip). */
export const CONTACT_VCARD_DOWNLOAD_URL = `${CONTACT_VCARD_WORKER_URL}?download=1`;

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

export function isAppleMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function isAndroidMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
}

/**
 * Open the branded contact so the phone can save it as a new contact.
 *
 * Mobile: navigate to the inline text/vcard URL — Safari/Chrome show the
 * system “Create New Contact” / import UI instead of a raw download.
 * Desktop: share sheet when available, otherwise download the .vcf.
 */
export async function saveContactToDevice(): Promise<
  "opened" | "shared" | "downloaded"
> {
  const mobile = isAppleMobile() || isAndroidMobile();

  if (mobile) {
    // Inline Content-Type: text/vcard (no ?download=1) → Add Contact UI.
    window.location.assign(CONTACT_VCARD_WORKER_URL);
    return "opened";
  }

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

  if (typeof navigator.share === "function" && navigator.canShare?.(shareData)) {
    await navigator.share(shareData);
    return "shared";
  }

  window.location.assign(CONTACT_VCARD_DOWNLOAD_URL);
  return "downloaded";
}

/** Fallback download that keeps the logo when opened from the Files app. */
export function downloadContactVCardForFiles(): void {
  window.location.assign(CONTACT_VCARD_DOWNLOAD_URL);
}

export function contactEmailLink(): string {
  const subject = encodeURIComponent(`${SITE.name} — save this contact`);
  const body = encodeURIComponent(
    `Open this link on your phone to save ${SITE.name} as a contact:\n\n${CONTACT_VCARD_WORKER_URL}\n`,
  );
  return `mailto:?subject=${subject}&body=${body}`;
}
