import { SITE } from "@/lib/data";
import { withBasePath } from "@/lib/paths";

export const CONTACT_CARD_PATH = "/contact/";
export const CONTACT_VCARD_PATH = "/my-airport-taxi-ni.vcf";

/**
 * Worker vCard — Content-Type: text/vcard (no disposition).
 * iPhone Safari opens this as Create New Contact / Add to Existing Contact.
 */
export const CONTACT_VCARD_WORKER_URL =
  "https://reimagined-octo-meme.cgr28.workers.dev/contact.vcf";

/** Optional download for Files (keeps logo when Safari strips PHOTO). */
export const CONTACT_VCARD_DOWNLOAD_URL = `${CONTACT_VCARD_WORKER_URL}?download=1`;

/** Cache-bust so phones pick up the regenerated branded PHOTO. */
const VCARD_CACHE_BUST = "v=20260806";

export function contactCardUrl(): string {
  return `${SITE.url}${CONTACT_CARD_PATH}`;
}

/** Same-origin vCard (GitHub Pages serves text/x-vcard). */
export function contactVCardUrl(): string {
  return `${withBasePath(CONTACT_VCARD_PATH)}?${VCARD_CACHE_BUST}`;
}

/** Absolute same-origin vCard URL (for email / share text). */
export function contactVCardAbsoluteUrl(): string {
  return `${SITE.url}${CONTACT_VCARD_PATH}?${VCARD_CACHE_BUST}`;
}

/** Safari-friendly worker URL (text/vcard). */
export function contactVCardWorkerUrl(): string {
  return `${CONTACT_VCARD_WORKER_URL}?${VCARD_CACHE_BUST}`;
}

/**
 * Chrome for iPhone (CriOS). Cross-origin worker links often download a file
 * instead of opening Create New Contact — use same-origin text/x-vcard instead.
 */
export function isChromeIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /CriOS/i.test(navigator.userAgent);
}

/**
 * Best URL for the Save to contacts control.
 * - Chrome iPhone: same-origin text/x-vcard (Create New Contact)
 * - Safari iPhone: worker text/vcard (Create New Contact)
 * - Android: native Add contact intent
 * - Other: same-origin vCard
 */
export function saveToContactsHref(): string {
  if (typeof navigator === "undefined") {
    return contactVCardWorkerUrl();
  }
  if (isAndroidMobile()) {
    return androidAddContactIntentUrl();
  }
  if (isAppleMobile()) {
    if (isChromeIos()) {
      return contactVCardUrl();
    }
    return contactVCardWorkerUrl();
  }
  return contactVCardUrl();
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
 * Programmatic save (desktop / fallbacks).
 * iPhone/Android should prefer a real `<a href={saveToContactsHref()}>` tap.
 */
export async function saveContactToDevice(): Promise<
  "opened" | "android-intent" | "shared" | "downloaded"
> {
  if (isAndroidMobile()) {
    window.location.assign(androidAddContactIntentUrl());
    return "android-intent";
  }

  if (isAppleMobile()) {
    // Direct open — do NOT use Web Share (that only shows AirDrop/Messages/Files).
    window.location.assign(saveToContactsHref());
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
  window.location.assign(`${CONTACT_VCARD_DOWNLOAD_URL}&${VCARD_CACHE_BUST}`);
}

export function contactEmailLink(): string {
  const subject = encodeURIComponent(`${SITE.name} — save this contact`);
  const body = encodeURIComponent(
    `Open this link on your iPhone (Safari) to save ${SITE.name} as a contact:\n\n${contactVCardWorkerUrl()}\n\nThen tap Create New Contact.\n\nIf the logo is missing, delete the old contact first, then use “Download contact file with logo” on the contact page and open the file from Downloads/Files.`,
  );
  return `mailto:?subject=${subject}&body=${body}`;
}
