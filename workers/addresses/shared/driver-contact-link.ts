/**
 * Live driver contact for the 2-hour journey reminder.
 *
 * The reminder email only carries an unguessable booking token. Every visit
 * reads the current assignment. A mobile already shown, or a WhatsApp chat
 * already opened, cannot be recalled — so a de-assigned driver's number is
 * never placed in the email and is not returned once they are no longer accepted.
 */

import {
  BUSINESS_NAME,
  businessWhatsAppMobileDisplay,
  businessWhatsAppMobileTel,
} from "./business-email";
import {
  DRIVER_CONTACT_UNLOCK_MESSAGE,
  driverContactDetailsUnlocked,
  isJourneyReminderCancelled,
  isOwnerDriverName,
  journeyReminderPickupAt,
  journeyReminderWhatsAppDraft,
  journeyReminderWhatsAppHref,
  resolveJourneyReminderContact,
  type JourneyReminderContact,
  type JourneyReminderInput,
} from "./journey-reminder";

export const DRIVER_CONTACT_TOKEN_BYTES = 32;
export const DRIVER_CONTACT_AFTER_PICKUP_MS = 12 * 60 * 60 * 1000;
export const DRIVER_CONTACT_RATE_LIMIT = 40;
export const DRIVER_CONTACT_RATE_WINDOW_MS = 10 * 60 * 1000;
export const DRIVER_CONTACT_CACHE_CONTROL = "private, no-store, max-age=0, must-revalidate";
export const DRIVER_CONTACT_UPDATED_HEADING = "Your driver details have been updated";

const PUBLIC_SITE = "https://www.myairporttaxini.co.uk";

export type DriverContactIntent = "message" | "call";
export type DriverContactChannel = "whatsapp" | "call";

export type DriverContactView =
  | "driver"
  | "company"
  | "updated"
  | "too_early"
  | "cancelled"
  | "expired"
  | "invalid"
  | "rate_limited";

export type DriverContactAuditEntry = {
  action?: string | null;
  driverName?: string | null;
};

export type DriverContactVisitInput = JourneyReminderInput & {
  requestToken?: string | null;
  storedToken?: string | null;
  tokenExpiresAt?: string | null;
  assignmentAudit?: DriverContactAuditEntry[] | null;
};

export type DriverContactTarget = {
  phoneDisplay: string;
  phoneTel: string;
  whatsAppHref: string;
  callHref: string;
};

export type DriverContactVisit = {
  ok: boolean;
  view: DriverContactView;
  heading: string;
  message: string;
  /** Present only when an accepted external driver may be disclosed right now. */
  driver?: {
    firstName: string;
    mobileDisplay: string;
    mobileTel: string;
    whatsAppHref: string;
    callHref: string;
  };
  company?: DriverContactTarget;
};

export type DriverContactPublicResponse = {
  ok: boolean;
  view: DriverContactView;
  heading: string;
  message: string;
  driverFirstName?: string;
  mobileDisplay?: string;
  phoneDisplay?: string;
  whatsAppLabel?: string;
  callLabel?: string;
};

export function generateDriverContactToken(bytes = DRIVER_CONTACT_TOKEN_BYTES): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Hex only. Booking references, payment ids, and job tokens are rejected. */
export function normalizeDriverContactToken(raw: string | null | undefined): string {
  const trimmed = String(raw ?? "").trim().toLowerCase();
  if (!/^[a-f0-9]{32,96}$/.test(trimmed)) return "";
  return trimmed;
}

export function driverContactTokenMatches(
  stored: string | null | undefined,
  request: string | null | undefined,
): boolean {
  const left = normalizeDriverContactToken(stored);
  const right = normalizeDriverContactToken(request);
  return Boolean(left) && left === right;
}

export function buildDriverContactPageUrl(
  siteOrigin: string,
  token: string,
  intent?: DriverContactIntent,
): string {
  let origin = PUBLIC_SITE;
  try {
    const parsed = new URL(siteOrigin);
    if (parsed.protocol === "https:") origin = parsed.origin;
  } catch {
    origin = PUBLIC_SITE;
  }
  const url = new URL(`${origin}/driver-contact/`);
  const normalized = normalizeDriverContactToken(token);
  if (normalized) url.searchParams.set("token", normalized);
  if (intent === "message" || intent === "call") url.searchParams.set("intent", intent);
  return url.toString();
}

export function driverContactExpiryIso(pickupAt: Date | null): string | undefined {
  if (!pickupAt || Number.isNaN(pickupAt.getTime())) return undefined;
  return new Date(pickupAt.getTime() + DRIVER_CONTACT_AFTER_PICKUP_MS).toISOString();
}

export function nextDriverContactRateHits(
  previous: number[],
  nowMs: number,
): { allow: boolean; hits: number[] } {
  const cutoff = nowMs - DRIVER_CONTACT_RATE_WINDOW_MS;
  const recent = previous
    .filter((hit) => Number.isFinite(hit) && hit > cutoff)
    .slice(-DRIVER_CONTACT_RATE_LIMIT);
  if (recent.length >= DRIVER_CONTACT_RATE_LIMIT) {
    return { allow: false, hits: recent };
  }
  return { allow: true, hits: [...recent, nowMs] };
}

function companyTarget(input: JourneyReminderInput): DriverContactTarget {
  const contact: JourneyReminderContact = { kind: "company" };
  const draft = journeyReminderWhatsAppDraft(input, contact);
  return {
    phoneDisplay: businessWhatsAppMobileDisplay(),
    phoneTel: businessWhatsAppMobileTel(),
    whatsAppHref: journeyReminderWhatsAppHref(draft, contact),
    callHref: `tel:${businessWhatsAppMobileTel()}`,
  };
}

function externalDriverLeft(input: DriverContactVisitInput): boolean {
  if (resolveJourneyReminderContact(input).kind === "driver") return false;
  return (input.assignmentAudit ?? []).some((entry) => {
    const action = String(entry.action ?? "").trim().toLowerCase();
    if (action === "deassigned") return true;
    if (action !== "accepted") return false;
    return !isOwnerDriverName(entry.driverName);
  });
}

function closed(
  view: "invalid" | "rate_limited" | "expired" | "cancelled",
  heading: string,
  message: string,
  company?: DriverContactTarget,
): DriverContactVisit {
  return { ok: view !== "invalid" && view !== "rate_limited", view, heading, message, company };
}

export function evaluateDriverContactVisit(
  input: DriverContactVisitInput,
  now: Date = new Date(),
): DriverContactVisit {
  if (!driverContactTokenMatches(input.storedToken, input.requestToken)) {
    return closed("invalid", "Link not valid", "This link is not valid.");
  }
  if (input.isRefundTest) {
    return closed("invalid", "Link not valid", "This link is not valid.");
  }

  const pickupAt = journeyReminderPickupAt(input);
  const nowMs = now.getTime();
  if (!pickupAt) {
    const expiresAt = Date.parse(String(input.tokenExpiresAt ?? ""));
    if (Number.isFinite(expiresAt) && nowMs >= expiresAt) {
      return closed(
        "expired",
        "This link has expired",
        `This link has expired. Please contact ${BUSINESS_NAME} on WhatsApp or ${businessWhatsAppMobileDisplay()}.`,
        companyTarget(input),
      );
    }
    return {
      ok: true,
      view: "company",
      heading: `Contact ${BUSINESS_NAME}`,
      message: `Please message or call ${BUSINESS_NAME} and we will help with this journey.`,
      company: companyTarget(input),
    };
  }

  const hideAt = pickupAt.getTime() + DRIVER_CONTACT_AFTER_PICKUP_MS;
  if (nowMs >= hideAt) {
    return closed(
      "expired",
      "This link has expired",
      `This link has expired. Please contact ${BUSINESS_NAME} on WhatsApp or ${businessWhatsAppMobileDisplay()}.`,
      companyTarget(input),
    );
  }

  if (isJourneyReminderCancelled(input)) {
    return closed(
      "cancelled",
      "This booking has been cancelled",
      `This booking has been cancelled. Please contact ${BUSINESS_NAME} on WhatsApp or ${businessWhatsAppMobileDisplay()} if you need help.`,
      companyTarget(input),
    );
  }

  const contact = resolveJourneyReminderContact(input);
  const tooEarly = !driverContactDetailsUnlocked(pickupAt, now);
  if (contact.kind === "driver" && !tooEarly) {
    const draft = journeyReminderWhatsAppDraft(input, contact);
    return {
      ok: true,
      view: "driver",
      heading: "Your driver",
      message: `Message or call ${contact.firstName} about this journey.`,
      driver: {
        firstName: contact.firstName,
        mobileDisplay: contact.mobileDisplay,
        mobileTel: contact.mobileTel,
        whatsAppHref: journeyReminderWhatsAppHref(draft, contact),
        callHref: `tel:${contact.mobileTel}`,
      },
    };
  }

  if (externalDriverLeft(input)) {
    return {
      ok: true,
      view: "updated",
      heading: DRIVER_CONTACT_UPDATED_HEADING,
      message: `${DRIVER_CONTACT_UPDATED_HEADING}. Please use our WhatsApp and business mobile below.`,
      company: companyTarget(input),
    };
  }

  const assignmentStatus = String(input.assignmentStatus ?? "").trim().toLowerCase();
  const waitingForAnExternalDriver = contact.kind === "driver" || assignmentStatus !== "accepted";
  if (tooEarly && waitingForAnExternalDriver) {
    return {
      ok: true,
      view: "too_early",
      heading: DRIVER_CONTACT_UNLOCK_MESSAGE,
      message: `${DRIVER_CONTACT_UNLOCK_MESSAGE} Until then, message or call ${BUSINESS_NAME} on WhatsApp or ${businessWhatsAppMobileDisplay()}. Reopen or refresh this page to check again. It does not update on its own.`,
      company: companyTarget(input),
    };
  }

  return {
    ok: true,
    view: "company",
    heading: `Contact ${BUSINESS_NAME}`,
    message: `Message or call ${BUSINESS_NAME} on WhatsApp or ${businessWhatsAppMobileDisplay()}.`,
    company: companyTarget(input),
  };
}

/** JSON safe to return to the browser. Direct wa.me and tel targets stay on the recheck redirect. */
export function publicDriverContactResponse(visit: DriverContactVisit): DriverContactPublicResponse {
  const base: DriverContactPublicResponse = {
    ok: visit.ok,
    view: visit.view,
    heading: visit.heading,
    message: visit.message,
  };
  if (visit.view === "driver" && visit.driver) {
    return {
      ...base,
      driverFirstName: visit.driver.firstName,
      mobileDisplay: visit.driver.mobileDisplay,
      whatsAppLabel: "Message Your Driver",
      callLabel: "Call Your Driver",
    };
  }
  if (visit.company && visit.view !== "invalid" && visit.view !== "rate_limited") {
    return {
      ...base,
      phoneDisplay: visit.company.phoneDisplay,
      whatsAppLabel: "Message Us on WhatsApp",
      callLabel: "Call Us",
    };
  }
  return base;
}

export function driverContactRedirectHref(
  visit: DriverContactVisit,
  channel: DriverContactChannel,
): string | null {
  if (visit.view === "driver" && visit.driver) {
    return channel === "whatsapp" ? visit.driver.whatsAppHref : visit.driver.callHref;
  }
  if (!visit.company || visit.view === "invalid" || visit.view === "rate_limited") return null;
  return channel === "whatsapp" ? visit.company.whatsAppHref : visit.company.callHref;
}

/** Allow only our company number or a normalised UK/Irish mobile on wa.me or tel. */
export function isSafeDriverContactRedirect(href: string): boolean {
  if (href.startsWith("tel:+")) {
    return /^tel:\+(?:447\d{9}|3538\d{8}|442896022952)$/.test(href);
  }
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.hostname !== "wa.me") return false;
  if (url.username || url.password) return false;
  return /^\/(?:447\d{9}|3538\d{8}|447549815538)$/.test(url.pathname);
}
