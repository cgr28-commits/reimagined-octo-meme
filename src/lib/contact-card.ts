import { SITE } from "@/lib/data";
import { withBasePath } from "@/lib/paths";

export const CONTACT_CARD_PATH = "/contact/";
export const CONTACT_VCARD_PATH = "/my-airport-taxi-ni.vcf";

/** Worker vCard — text/vcard for iPhone Create New Contact; ?download=1 for Files. */
export const CONTACT_VCARD_WORKER_URL =
  "https://reimagined-octo-meme.cgr28.workers.dev/contact.vcf";

/** Optional download for Files (keeps logo on some iPhones after Safari strip). */
export const CONTACT_VCARD_DOWNLOAD_URL = `${CONTACT_VCARD_WORKER_URL}?download=1`;

let cachedVCardText: string | null = null;
let prefetchPromise: Promise<string> | null = null;

export function contactCardUrl(): string {
  return `${SITE.url}${CONTACT_CARD_PATH}`;
}

/** Same-origin vCard (GitHub Pages serves text/x-vcard). */
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

async function loadContactVCardText(): Promise<string> {
  if (cachedVCardText) {
    return cachedVCardText;
  }
  if (!prefetchPromise) {
    prefetchPromise = (async () => {
      const response = await fetch(contactVCardUrl(), { cache: "force-cache" });
      if (!response.ok) {
        throw new Error(`Could not load contact card (${response.status})`);
      }
      const text = await response.text();
      if (!text.includes("BEGIN:VCARD") || !/PHOTO;ENCODING=b;TYPE=JP(E)?G:/i.test(text)) {
        throw new Error("Contact card file is missing the logo photo");
      }
      cachedVCardText = text;
      return text;
    })().catch((error) => {
      prefetchPromise = null;
      throw error;
    });
  }
  return prefetchPromise;
}

/** Warm the vCard cache so iPhone Save to contacts stays inside the tap gesture. */
export function prefetchContactVCard(): void {
  if (typeof window === "undefined") return;
  void loadContactVCardText().catch(() => {
    // Ignore prefetch failures — save path will retry.
  });
}

function buildVCardFile(text: string): File {
  return new File([text], "My-Airport-Taxi-NI.vcf", {
    type: "text/vcard;charset=utf-8",
  });
}

/**
 * Save contact with the best path per platform:
 * - iPhone: share the vCard file (Contacts / Create New Contact), else open worker vCard
 * - Android: native Add Contact intent (no download)
 * - Desktop: share sheet or download
 */
export async function saveContactToDevice(): Promise<
  "shared" | "opened" | "android-intent" | "downloaded" | "cancelled"
> {
  if (isAndroidMobile()) {
    window.location.assign(androidAddContactIntentUrl());
    return "android-intent";
  }

  const text = await loadContactVCardText();
  const file = buildVCardFile(text);
  const fileShare: ShareData = { files: [file] };

  // iPhone: Web Share with a .vcf is the most reliable “Add to Contacts” path.
  // A plain link often opens Safari’s file preview (Done / Share) instead.
  if (
    isAppleMobile() &&
    typeof navigator.share === "function" &&
    navigator.canShare?.(fileShare)
  ) {
    try {
      await navigator.share({
        files: [file],
        title: SITE.name,
      });
      return "shared";
    } catch (error) {
      if (
        (error instanceof DOMException && error.name === "AbortError") ||
        (error instanceof Error && /AbortError|canceled|cancelled/i.test(error.message))
      ) {
        return "cancelled";
      }
      // Fall through to open the vCard URL.
    }
  }

  if (isAppleMobile()) {
    // Worker serves text/vcard (better Create New Contact behaviour than Pages x-vcard).
    window.location.assign(CONTACT_VCARD_WORKER_URL);
    return "opened";
  }

  const shareData: ShareData = {
    files: [file],
    title: SITE.name,
    text: `${SITE.name} contact card`,
  };

  if (typeof navigator.share === "function" && navigator.canShare?.(shareData)) {
    try {
      await navigator.share(shareData);
      return "shared";
    } catch (error) {
      if (
        (error instanceof DOMException && error.name === "AbortError") ||
        (error instanceof Error && /AbortError|canceled|cancelled/i.test(error.message))
      ) {
        return "cancelled";
      }
    }
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
    `Open this link on your iPhone to save ${SITE.name} as a contact:\n\n${CONTACT_VCARD_WORKER_URL}\n`,
  );
  return `mailto:?subject=${subject}&body=${body}`;
}
