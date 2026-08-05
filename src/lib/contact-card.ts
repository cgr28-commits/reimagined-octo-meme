import { SITE } from "@/lib/data";
import { withBasePath } from "@/lib/paths";

export const CONTACT_CARD_PATH = "/contact/";
export const CONTACT_VCARD_PATH = "/my-airport-taxi-ni.vcf";

/** Worker vCard — used for optional Files download that keeps the logo. */
export const CONTACT_VCARD_WORKER_URL =
  "https://reimagined-octo-meme.cgr28.workers.dev/contact.vcf";

/** Optional download for Files (keeps logo on some iPhones after Safari strip). */
export const CONTACT_VCARD_DOWNLOAD_URL = `${CONTACT_VCARD_WORKER_URL}?download=1`;

export function contactCardUrl(): string {
  return `${SITE.url}${CONTACT_CARD_PATH}`;
}

/** Same-origin vCard — iPhone Safari opens Create New Contact with logo. */
export function contactVCardUrl(): string {
  return withBasePath(CONTACT_VCARD_PATH);
}

/** Absolute same-origin vCard URL (for email / share text). */
export function contactVCardAbsoluteUrl(): string {
  return `${SITE.url}${CONTACT_VCARD_PATH}`;
}

function whatsAppE164(): string {
  const raw = SITE.whatsapp.trim();
  return raw.startsWith("+") ? raw : `+${raw}`;
}

/**
 * Android Intent that opens the native “Add contact” screen (no .vcf download).
 * Logo photo is not supported by this intent — offer the vCard as a second step.
 */
export function androidAddContactIntentUrl(): string {
  const name = encodeURIComponent(SITE.name);
  const phone = encodeURIComponent(SITE.landline);
  const mobile = encodeURIComponent(whatsAppE164());
  const email = encodeURIComponent(SITE.email);
  const company = encodeURIComponent(SITE.name);
  return (
    `intent:#Intent;` +
    `action=android.intent.action.INSERT;` +
    `type=vnd.android.cursor.dir/contact;` +
    `S.name=${name};` +
    `S.phone=${phone};` +
    `S.secondary_phone=${mobile};` +
    `S.email=${email};` +
    `S.company=${company};` +
    `end`
  );
}

/** Best primary href for Save to contacts on the current device. */
export function saveToContactsHref(): string {
  if (typeof navigator !== "undefined" && isAndroidMobile()) {
    return androidAddContactIntentUrl();
  }
  return contactVCardUrl();
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
 * Save contact with the best path per platform:
 * - iPhone: open same-origin vCard → Create New Contact (with logo)
 * - Android: open native Add Contact intent (no download)
 * - Desktop: share sheet or download
 */
export async function saveContactToDevice(): Promise<
  "opened" | "android-intent" | "shared" | "downloaded"
> {
  if (isAndroidMobile()) {
    window.location.assign(androidAddContactIntentUrl());
    return "android-intent";
  }

  if (isAppleMobile()) {
    window.location.assign(contactVCardUrl());
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
    `Open this link on your phone to save ${SITE.name} as a contact:\n\n${contactVCardAbsoluteUrl()}\n`,
  );
  return `mailto:?subject=${subject}&body=${body}`;
}
