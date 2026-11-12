/**
 * Owner alerts for bookings that need approval, plus the signed one-tap links
 * used from WhatsApp, push notifications and the owner email.
 *
 * Link security:
 * - The token names ONE booking reference and expires at that booking's
 *   approval deadline. It is HMAC-SHA256 signed with a Worker secret
 *   (OWNER_APPROVAL_LINK_SECRET, falling back to OWNER_ACCESS_KEY), so it
 *   can't be forged or pointed at another booking.
 * - Opening the link never acts by itself: the page shows the booking and
 *   asks the owner to confirm, then POSTs the token in the request body
 *   (never logged, never in a Worker URL). Link previews can't approve.
 * - The decision itself still goes through the per-booking lock, so a link
 *   used twice, or after expiry, does nothing.
 */
import type { ShortNoticeBookingRecord } from "../shared/short-notice-booking";
import { formatLondonClockTime, formatUkDateTime } from "../shared/uk-time";
import { notifyOwnerPush } from "./owner-push";
import { sendOwnerApprovalWhatsApp, type WhatsAppTemplateEnv } from "./whatsapp-templates";

export type OwnerApprovalLinkEnv = {
  OWNER_APPROVAL_LINK_SECRET?: string;
  OWNER_ACCESS_KEY?: string;
};

export type OwnerApprovalAlertEnv = OwnerApprovalLinkEnv &
  WhatsAppTemplateEnv & {
    /** Owner's own mobile for approval alerts (Worker secret, never in the repo). */
    OWNER_APPROVAL_WHATSAPP?: string;
    TRACKING_STORE?: KVNamespace;
  };

const SITE = "https://www.myairporttaxini.co.uk";

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToString(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  return atob(padded);
}

function linkSecret(env: OwnerApprovalLinkEnv): string {
  const explicit = env.OWNER_APPROVAL_LINK_SECRET?.trim();
  if (explicit) return explicit;
  const owner = env.OWNER_ACCESS_KEY?.trim();
  return owner ? `owner-approval-link:v1:${owner}` : "";
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return b64url(new Uint8Array(sig));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** `<payload>.<signature>` where payload = base64url("v1|reference|expiresMs"). */
export async function signOwnerApprovalToken(
  env: OwnerApprovalLinkEnv,
  reference: string,
  expiresAt: string,
): Promise<string | null> {
  const secret = linkSecret(env);
  const expMs = new Date(expiresAt).getTime();
  if (!secret || !reference || !Number.isFinite(expMs)) return null;
  const payload = b64url(new TextEncoder().encode(`v1|${reference}|${expMs}`));
  return `${payload}.${await hmac(secret, payload)}`;
}

export async function verifyOwnerApprovalToken(
  env: OwnerApprovalLinkEnv,
  token: string,
  now = new Date(),
): Promise<{ ok: true; reference: string; expiresAt: string } | { ok: false; error: string }> {
  const secret = linkSecret(env);
  if (!secret) return { ok: false, error: "Approval links are not configured." };
  const [payload, sig] = String(token ?? "").trim().split(".");
  if (!payload || !sig) return { ok: false, error: "This link is not valid." };
  if (!safeEqual(sig, await hmac(secret, payload))) return { ok: false, error: "This link is not valid." };
  let parts: string[];
  try {
    parts = b64urlToString(payload).split("|");
  } catch {
    return { ok: false, error: "This link is not valid." };
  }
  const [version, reference, expRaw] = parts;
  const expMs = Number(expRaw);
  if (version !== "v1" || !reference || !Number.isFinite(expMs)) {
    return { ok: false, error: "This link is not valid." };
  }
  if (now.getTime() >= expMs) {
    return { ok: false, error: "This request has expired and can no longer be accepted." };
  }
  return { ok: true, reference, expiresAt: new Date(expMs).toISOString() };
}

export function ownerDecisionUrl(token: string, action?: "approve" | "decline"): string {
  return `${SITE}/owner/decision/?${action ? `do=${action}&` : ""}t=${encodeURIComponent(token)}`;
}

function pickupLabel(record: ShortNoticeBookingRecord): string {
  return (
    formatUkDateTime(record.booking.tripDate, record.booking.tripTime, { withZoneLabel: false }) ||
    `${record.booking.tripDate} ${record.booking.tripTime}`
  );
}

/**
 * Push + WhatsApp alert for a request that is now waiting on the owner.
 * Never throws: alert failures must not change the booking's pending state.
 */
export async function alertOwnerApprovalRequest(
  env: OwnerApprovalAlertEnv,
  record: ShortNoticeBookingRecord,
): Promise<{ push: boolean; whatsapp: string; link: string | null }> {
  const outcome = { push: false, whatsapp: "skipped", link: null as string | null };
  const deadline = record.shortNoticeExpiresAt;
  const token = deadline ? await signOwnerApprovalToken(env, record.reference, deadline).catch(() => null) : null;
  outcome.link = token ? ownerDecisionUrl(token) : null;
  const respondBy = deadline ? formatLondonClockTime(deadline) : "";
  const b = record.booking;

  try {
    const push = await notifyOwnerPush(env as never, {
      category: "requests",
      title: respondBy ? `Booking needs approval — respond by ${respondBy}` : "Booking needs your approval",
      body: `${b.customerName || "Customer"} · ${pickupLabel(record)} · ${record.amountLabel}`.slice(0, 160),
      url: outcome.link ? outcome.link.replace(SITE, "") : "/owner/?ui=mobile#home",
    });
    outcome.push = push.sent > 0;
  } catch {
    outcome.push = false;
  }

  if (token) {
    const wa = await sendOwnerApprovalWhatsApp(env, {
      to: env.OWNER_APPROVAL_WHATSAPP,
      linkToken: token,
      bodyParams: [
        record.reference,
        b.customerName || "-",
        pickupLabel(record),
        b.pickupLabel || "-",
        b.dropoffLabel || "-",
        String(b.flightNumber ?? "").trim() || "Not given",
        String(b.passengers ?? "-"),
        record.amountLabel,
        respondBy || "-",
      ],
    });
    outcome.whatsapp = wa.sent ? "sent" : wa.reason;
  }
  console.log(
    JSON.stringify({
      event: "owner_approval_alert",
      reference: record.reference,
      push: outcome.push,
      whatsapp: outcome.whatsapp,
    }),
  );
  return outcome;
}
