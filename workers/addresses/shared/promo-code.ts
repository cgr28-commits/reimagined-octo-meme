/**
 * Email promotional codes (welcome discount) — pure rules shared by the website and the Worker.
 *
 * Owner brief (16 Nov 2026): replaces the automatic 5% return-booking discount.
 * - A customer enters their email and is sent a unique code (default 10%).
 * - The code takes the percentage off the VEHICLE fare only: the journey fare for one-way, or the
 *   combined outward + return journey fare for returns, including any time-of-day / Christmas
 *   pricing already inside that fare. Airport access, pickup / drop-off, barrier, parking and
 *   Meet & Greet charges are never discounted.
 * - Minimum eligible vehicle fare (default £100), 30-day validity, one redemption per customer,
 *   bound to the requesting email, never combined with another offer.
 * - Everything is recalculated on the server; this module only holds the shared arithmetic and
 *   wording so the price a customer sees is exactly the price the server charges.
 */

export const PROMO_CODE_PREFIX = "MATNI";
/** No 0/O, 1/I/L, so a code read out over the phone is unambiguous. */
export const PROMO_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const PROMO_CODE_RANDOM_LENGTH = 8;

/** Travel dates (inclusive, UK dates YYYY-MM-DD) on which promo codes cannot be used. */
export type PromoBlackoutRange = { from: string; to: string; label?: string };

export const PROMO_MAX_BLACKOUT_RANGES = 60;

/**
 * A time-limited offer (e.g. Black Friday) that replaces the everyday percentage while it runs.
 * Codes issued in the window get the campaign percentage and keep it for their normal validity.
 */
export type PromoCampaign = {
  enabled: boolean;
  /** Customer-facing name, e.g. "Black Friday". */
  name: string;
  discountRate: number;
  /** ISO instants (UTC). Live from startsAt (inclusive) until endsAt (exclusive). */
  startsAt: string;
  endsAt: string;
};

export type PromoSettings = {
  /** Master switch: off = no new codes, the code field is hidden and existing codes are refused. */
  enabled: boolean;
  /** 0.10 = 10%. */
  discountRate: number;
  minimumVehicleFareGbp: number;
  validityDays: number;
  /** Desktop pop-up (20 s / exit intent). The mobile banner and quote banner follow `enabled`. */
  popupEnabled: boolean;
  popupDelaySeconds: number;
  /** Journey dates excluded from promo codes (owner dashboard). Applies to every leg. */
  blackoutDates: PromoBlackoutRange[];
  /** Scheduled higher-value offer (owner dashboard); null = none. */
  campaign: PromoCampaign | null;
  updatedAt?: string;
};

export const DEFAULT_PROMO_SETTINGS: PromoSettings = {
  enabled: true,
  discountRate: 0.1,
  minimumVehicleFareGbp: 100,
  validityDays: 30,
  popupEnabled: true,
  popupDelaySeconds: 20,
  // Owner, 16 Nov 2026: no promo codes for journeys 14 December – 5 January, or on the
  // Garth Brooks nights at Boucher Road (Fri 21 – Sun 23 May 2027).
  blackoutDates: [
    { from: "2026-12-14", to: "2027-01-05", label: "Christmas & New Year" },
    // Owner, 16 Nov 2026: also Easter (NI school holidays), the Twelfth fortnight and the
    // Harry Styles Croke Park nights (18 & 20 Aug 2027).
    { from: "2027-03-24", to: "2027-04-05", label: "Easter" },
    { from: "2027-05-21", to: "2027-05-23", label: "Garth Brooks" },
    { from: "2027-07-09", to: "2027-07-18", label: "Twelfth fortnight" },
    { from: "2027-08-17", to: "2027-08-21", label: "Harry Styles in Dublin" },
  ],
  // Owner, 16 Nov 2026: 15% for Black Friday (Fri 27 Nov – Mon 30 Nov 2026, UK time = UTC in November).
  campaign: {
    enabled: true,
    name: "Black Friday",
    discountRate: 0.15,
    startsAt: "2026-11-27T00:00:00.000Z",
    endsAt: "2026-12-01T00:00:00.000Z",
  },
};

export const PROMO_LIMITS = {
  minRate: 0.01,
  maxRate: 0.3,
  minMinimumFareGbp: 0,
  maxMinimumFareGbp: 1000,
  minValidityDays: 1,
  maxValidityDays: 90,
  minPopupDelaySeconds: 5,
  maxPopupDelaySeconds: 120,
} as const;

/** The exact marketing consent wording (stored with every consent record). */
export const PROMO_MARKETING_CONSENT_WORDING =
  "Yes, I'd like to receive occasional offers and updates from My Airport Taxi NI by email. I can unsubscribe at any time.";
export const PROMO_MARKETING_CONSENT_VERSION = "November 2026";

export const PROMO_POPUP_HEADLINE = "GET 10% OFF YOUR AIRPORT TRANSFER";

/** Same reply whatever happened to the address (never reveals whether it is already registered). */
export const PROMO_REQUEST_ACCEPTED_MESSAGE =
  "Thank you! If this email address is eligible, your discount code is on its way. Please check your inbox (and junk folder) in the next few minutes.";
export const PROMO_REQUEST_SEND_FAILED_MESSAGE =
  "Sorry, we couldn't send your code just now. Please try again in a few minutes.";
export const PROMO_REQUEST_RATE_LIMITED_MESSAGE =
  "Too many requests. Please wait a while before trying again.";
export const PROMO_INVALID_EMAIL_MESSAGE = "Please enter a valid email address.";

export type PromoRejectReason =
  | "disabled"
  | "not_found"
  | "expired"
  | "redeemed"
  | "deactivated"
  | "email_mismatch"
  | "already_used_by_customer"
  | "minimum_fare"
  | "not_combinable"
  | "not_eligible_booking"
  | "in_use"
  | "unavailable"
  | "blackout_date";

/** Customer wording for each refusal. Never says whether another email holds the code. */
export function promoRejectMessage(
  reason: PromoRejectReason,
  context: { minimumVehicleFareGbp?: number } = {},
): string {
  const minimum = formatWholePounds(context.minimumVehicleFareGbp ?? DEFAULT_PROMO_SETTINGS.minimumVehicleFareGbp);
  switch (reason) {
    case "disabled":
      return "Promo codes aren't available at the moment.";
    case "expired":
      return "This promo code has expired.";
    case "redeemed":
    case "already_used_by_customer":
      return "This promo code has already been used. Each customer can use one welcome discount.";
    case "email_mismatch":
      return "This code is linked to a different email address. Please use the email address the code was sent to.";
    case "minimum_fare":
      return `Promo codes apply to vehicle fares of ${minimum} or more (airport charges excluded).`;
    case "not_combinable":
      return "Promo codes can't be combined with another offer or special price on the same booking.";
    case "not_eligible_booking":
      return "Promo codes can only be used on standard online bookings.";
    case "in_use":
      return "This promo code is being used on another booking right now. Please finish or close that payment first.";
    case "blackout_date":
      return "Promo codes can't be used for journeys on this date. Please choose another date or continue without the code.";
    case "unavailable":
      return "We couldn't check your promo code just now. Please try again, or continue without it.";
    case "deactivated":
    case "not_found":
    default:
      return "This promo code isn't valid. Please check it and try again.";
  }
}

function formatWholePounds(amount: number): string {
  const rounded = Math.round(Number(amount) * 100) / 100;
  return Number.isInteger(rounded) ? `£${rounded}` : `£${rounded.toFixed(2)}`;
}

export function formatPromoPercent(rate: number): string {
  const pct = Math.round(Number(rate) * 1000) / 10;
  return Number.isFinite(pct) ? `${pct}%` : "10%";
}

export function promoSavingLabel(code: string, rate: number): string {
  return `${formatPromoPercent(rate)} promo code (${code})`;
}

/** Upper-case, strip spaces; accepts "matni 7kq4 x9pr", "MATNI-7KQ4X9PR", etc. */
export function normalizePromoCode(input: unknown): string {
  const raw = String(input ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!raw.startsWith(PROMO_CODE_PREFIX)) return "";
  const body = raw.slice(PROMO_CODE_PREFIX.length);
  if (body.length !== PROMO_CODE_RANDOM_LENGTH) return "";
  for (const ch of body) if (!PROMO_CODE_ALPHABET.includes(ch)) return "";
  return `${PROMO_CODE_PREFIX}-${body.slice(0, 4)}-${body.slice(4)}`;
}

/** New random code using the platform CSPRNG (Workers + browsers + Node). */
export function generatePromoCode(random: (bytes: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b)): string {
  const alphabet = PROMO_CODE_ALPHABET;
  // Rejection sampling keeps every character equally likely.
  const limit = 256 - (256 % alphabet.length);
  let body = "";
  while (body.length < PROMO_CODE_RANDOM_LENGTH) {
    const bytes = random(new Uint8Array(16));
    for (const byte of bytes) {
      if (byte < limit) body += alphabet[byte % alphabet.length];
      if (body.length === PROMO_CODE_RANDOM_LENGTH) break;
    }
  }
  return `${PROMO_CODE_PREFIX}-${body.slice(0, 4)}-${body.slice(4)}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizePromoEmail(input: unknown): string {
  const email = String(input ?? "").trim().toLowerCase();
  return email.length <= 254 && EMAIL_RE.test(email) ? email : "";
}

/**
 * One customer = one mailbox, whatever spelling is used: "+tags" are dropped everywhere and
 * Gmail ignores dots, so j.smith+taxi@gmail.com and jsmith@googlemail.com are the same customer.
 * Used only for the one-code-per-customer rule; codes are still sent to the address as entered.
 */
export function canonicalPromoEmail(input: unknown): string {
  const email = normalizePromoEmail(input);
  if (!email) return "";
  const at = email.lastIndexOf("@");
  let local = email.slice(0, at);
  let domain = email.slice(at + 1);
  local = local.split("+")[0];
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return `${local}@${domain}`;
}

/** Whether the code's email and the booking email are the same customer. */
export function promoEmailsMatch(codeEmail: string, bookingEmail: string): boolean {
  const a = canonicalPromoEmail(codeEmail);
  const b = canonicalPromoEmail(bookingEmail);
  return Boolean(a) && a === b;
}

export function normalizePromoSettings(input: unknown, fallback: PromoSettings = DEFAULT_PROMO_SETTINGS): PromoSettings {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const num = (value: unknown, min: number, max: number, dflt: number) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= min && n <= max ? n : dflt;
  };
  const rate = num(raw.discountRate, PROMO_LIMITS.minRate, PROMO_LIMITS.maxRate, fallback.discountRate);
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : fallback.enabled,
    discountRate: Math.round(rate * 1000) / 1000,
    minimumVehicleFareGbp:
      Math.round(num(raw.minimumVehicleFareGbp, PROMO_LIMITS.minMinimumFareGbp, PROMO_LIMITS.maxMinimumFareGbp, fallback.minimumVehicleFareGbp) * 100) / 100,
    validityDays: Math.round(num(raw.validityDays, PROMO_LIMITS.minValidityDays, PROMO_LIMITS.maxValidityDays, fallback.validityDays)),
    popupEnabled: typeof raw.popupEnabled === "boolean" ? raw.popupEnabled : fallback.popupEnabled,
    popupDelaySeconds: Math.round(
      num(raw.popupDelaySeconds, PROMO_LIMITS.minPopupDelaySeconds, PROMO_LIMITS.maxPopupDelaySeconds, fallback.popupDelaySeconds),
    ),
    blackoutDates: Array.isArray(raw.blackoutDates)
      ? normalizeBlackoutRanges(raw.blackoutDates)
      : [...(fallback.blackoutDates ?? [])],
    campaign: "campaign" in raw ? normalizeCampaign(raw.campaign) : fallback.campaign ? { ...fallback.campaign } : null,
    ...(typeof raw.updatedAt === "string" ? { updatedAt: raw.updatedAt } : {}),
  };
}

/** Owner edits: reject out-of-range values instead of silently clamping them. */
export function validatePromoSettingsInput(input: Record<string, unknown>): { ok: true; settings: Partial<PromoSettings> } | { ok: false; error: string } {
  const out: Partial<PromoSettings> = {};
  if ("enabled" in input) {
    if (typeof input.enabled !== "boolean") return { ok: false, error: "Promotion on/off must be true or false." };
    out.enabled = input.enabled;
  }
  if ("popupEnabled" in input) {
    if (typeof input.popupEnabled !== "boolean") return { ok: false, error: "Pop-up on/off must be true or false." };
    out.popupEnabled = input.popupEnabled;
  }
  if ("discountPercent" in input) {
    const pct = Number(input.discountPercent);
    if (!Number.isFinite(pct) || pct < PROMO_LIMITS.minRate * 100 || pct > PROMO_LIMITS.maxRate * 100) {
      return { ok: false, error: `Discount must be between ${PROMO_LIMITS.minRate * 100}% and ${PROMO_LIMITS.maxRate * 100}%.` };
    }
    out.discountRate = Math.round(pct * 10) / 1000;
  }
  if ("minimumVehicleFareGbp" in input) {
    const min = Number(input.minimumVehicleFareGbp);
    if (!Number.isFinite(min) || min < PROMO_LIMITS.minMinimumFareGbp || min > PROMO_LIMITS.maxMinimumFareGbp) {
      return { ok: false, error: `Minimum fare must be between £${PROMO_LIMITS.minMinimumFareGbp} and £${PROMO_LIMITS.maxMinimumFareGbp}.` };
    }
    out.minimumVehicleFareGbp = Math.round(min * 100) / 100;
  }
  if ("validityDays" in input) {
    const days = Number(input.validityDays);
    if (!Number.isInteger(days) || days < PROMO_LIMITS.minValidityDays || days > PROMO_LIMITS.maxValidityDays) {
      return { ok: false, error: `Validity must be a whole number of days between ${PROMO_LIMITS.minValidityDays} and ${PROMO_LIMITS.maxValidityDays}.` };
    }
    out.validityDays = days;
  }
  if ("blackoutDates" in input) {
    const list = input.blackoutDates;
    if (!Array.isArray(list)) return { ok: false, error: "Excluded dates must be a list." };
    if (list.length > PROMO_MAX_BLACKOUT_RANGES) {
      return { ok: false, error: `Up to ${PROMO_MAX_BLACKOUT_RANGES} excluded date ranges.` };
    }
    for (const item of list) {
      const range = item as Record<string, unknown>;
      const from = String(range?.from ?? "");
      const to = String(range?.to ?? "") || from;
      if (!isIsoDate(from) || !isIsoDate(to)) return { ok: false, error: "Each excluded date needs a valid date (and end date)." };
      if (to < from) return { ok: false, error: `The end date ${to} is before the start date ${from}.` };
    }
    out.blackoutDates = normalizeBlackoutRanges(list);
  }
  if ("campaign" in input) {
    if (input.campaign === null) {
      out.campaign = null;
    } else {
      const c = (input.campaign ?? {}) as Record<string, unknown>;
      const pct = Number(c.discountPercent ?? (Number(c.discountRate) * 100));
      if (!Number.isFinite(pct) || pct < PROMO_LIMITS.minRate * 100 || pct > PROMO_LIMITS.maxRate * 100) {
        return { ok: false, error: `Offer discount must be between ${PROMO_LIMITS.minRate * 100}% and ${PROMO_LIMITS.maxRate * 100}%.` };
      }
      const startsAt = Date.parse(String(c.startsAt ?? ""));
      const endsAt = Date.parse(String(c.endsAt ?? ""));
      if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) return { ok: false, error: "The offer needs a start and an end time." };
      if (endsAt <= startsAt) return { ok: false, error: "The offer must end after it starts." };
      if (endsAt - startsAt > 31 * 86_400_000) return { ok: false, error: "An offer can run for up to 31 days." };
      const name = String(c.name ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
      if (!name) return { ok: false, error: "Give the offer a name, e.g. Black Friday." };
      out.campaign = {
        enabled: c.enabled !== false,
        name,
        discountRate: Math.round(pct * 10) / 1000,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
      };
    }
  }
  if ("popupDelaySeconds" in input) {
    const s = Number(input.popupDelaySeconds);
    if (!Number.isInteger(s) || s < PROMO_LIMITS.minPopupDelaySeconds || s > PROMO_LIMITS.maxPopupDelaySeconds) {
      return { ok: false, error: `Pop-up delay must be between ${PROMO_LIMITS.minPopupDelaySeconds} and ${PROMO_LIMITS.maxPopupDelaySeconds} seconds.` };
    }
    out.popupDelaySeconds = s;
  }
  return { ok: true, settings: out };
}

/** What a code entitles the customer to (terms are fixed when the code is issued). */
export type PromoTerms = {
  code: string;
  discountRate: number;
  minimumVehicleFareGbp: number;
};

export function roundPence(amount: number): number {
  return Math.round((Number(amount) || 0) * 100) / 100;
}

/** True when the vehicle fare qualifies (compared in pence so £99.995 never sneaks through). */
export function promoMeetsMinimum(vehicleFareGbp: number, minimumVehicleFareGbp: number): boolean {
  return Math.round(roundPence(vehicleFareGbp) * 100) >= Math.round(roundPence(minimumVehicleFareGbp) * 100);
}

/** Expiry: issue time + N whole days. */
export function promoExpiresAt(issuedAt: Date, validityDays: number): Date {
  return new Date(issuedAt.getTime() + Math.max(1, Math.round(validityDays)) * 86_400_000);
}

/** "Wednesday 16 December 2026" (UK time) for emails. */
export function formatPromoExpiryDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // Assembled from parts so every runtime prints the same "Wednesday 16 December 2026".
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).formatToParts(d);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("weekday")} ${part("day")} ${part("month")} ${part("year")}`;
}

/** Public, non-personal configuration for the website (pop-up wording + the code field). */
export type PublicPromoConfig = {
  enabled: boolean;
  discountRate: number;
  discountPercentLabel: string;
  minimumVehicleFareGbp: number;
  validityDays: number;
  popupEnabled: boolean;
  popupDelaySeconds: number;
  /** Excluded journey dates (shown to customers when they apply a code). */
  blackoutDates: PromoBlackoutRange[];
  /** Set only while a scheduled offer (e.g. Black Friday) is running. */
  campaign?: { id: string; name: string; endsAt: string };
};

export function publicPromoConfig(settings: PromoSettings, now: Date = new Date()): PublicPromoConfig {
  const live = activePromoCampaign(settings, now);
  const rate = live ? live.discountRate : settings.discountRate;
  return {
    enabled: settings.enabled,
    discountRate: rate,
    discountPercentLabel: formatPromoPercent(rate),
    ...(live ? { campaign: { id: promoCampaignId(live), name: live.name, endsAt: live.endsAt } } : {}),
    minimumVehicleFareGbp: settings.minimumVehicleFareGbp,
    validityDays: settings.validityDays,
    popupEnabled: settings.enabled && settings.popupEnabled,
    popupDelaySeconds: settings.popupDelaySeconds,
    blackoutDates: settings.blackoutDates ?? [],
  };
}

export type PromoCodeStatus = "active" | "reserved" | "redeemed" | "deactivated" | "expired";

/** Owner dashboard row (no hashes). */
export type PromoCodeRow = {
  code: string;
  email: string;
  status: PromoCodeStatus;
  /** Status as the owner should read it today (an "active" code past expiry shows as expired). */
  displayStatus: PromoCodeStatus;
  discountRate: number;
  minimumVehicleFareGbp: number;
  issuedAt: string;
  expiresAt: string;
  redeemedAt?: string;
  bookingReference?: string;
  discountGbp?: number;
  vehicleFareGbp?: number;
  bookingTotalGbp?: number;
  marketingOptIn: boolean;
  deactivatedAt?: string;
  deactivatedReason?: string;
  conflict?: boolean;
};

export function promoDisplayStatus(row: { status: PromoCodeStatus; expiresAt: string; reservedUntil?: string | null }, now = new Date()): PromoCodeStatus {
  if (row.status === "redeemed" || row.status === "deactivated" || row.status === "expired") return row.status;
  const expired = Date.parse(row.expiresAt) <= now.getTime();
  if (row.status === "reserved") {
    const live = row.reservedUntil && Date.parse(row.reservedUntil) > now.getTime();
    if (live) return "reserved";
    return expired ? "expired" : "active";
  }
  return expired ? "expired" : "active";
}

function csvCell(value: unknown): string {
  const v = String(value ?? "");
  // Leading = + - @ would run as a formula in Excel: neutralise it.
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function promoCodesCsv(rows: PromoCodeRow[]): string {
  const header = [
    "Code",
    "Email",
    "Status",
    "Discount",
    "Issued",
    "Expires",
    "Redeemed",
    "Booking",
    "Vehicle fare",
    "Saving",
    "Booking total",
    "Marketing consent",
  ];
  const lines = rows.map((r) =>
    [
      r.code,
      r.email,
      r.displayStatus,
      formatPromoPercent(r.discountRate),
      r.issuedAt,
      r.expiresAt,
      r.redeemedAt,
      r.bookingReference,
      r.vehicleFareGbp,
      r.discountGbp,
      r.bookingTotalGbp,
      r.marketingOptIn ? "Yes" : "No",
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.join(","), ...lines].join("\r\n") + "\r\n";
}

export { csvCell as promoCsvCell };


function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Valid, de-duplicated, sorted ranges (single days have from === to). */
export function normalizeBlackoutRanges(input: unknown[]): PromoBlackoutRange[] {
  const out: PromoBlackoutRange[] = [];
  for (const item of input.slice(0, PROMO_MAX_BLACKOUT_RANGES)) {
    const range = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const from = String(range.from ?? "").trim();
    const to = String(range.to ?? "").trim() || from;
    if (!isIsoDate(from) || !isIsoDate(to) || to < from) continue;
    const label = String(range.label ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
    out.push(label ? { from, to, label } : { from, to });
  }
  out.sort((a, b) => (a.from === b.from ? a.to.localeCompare(b.to) : a.from.localeCompare(b.from)));
  return out.filter((r, i) => i === 0 || r.from !== out[i - 1].from || r.to !== out[i - 1].to);
}

/** The first excluded range covering any of these journey dates (YYYY-MM-DD), or null. */
export function promoBlackoutFor(
  journeyDates: Array<string | null | undefined>,
  ranges: PromoBlackoutRange[] | null | undefined,
): (PromoBlackoutRange & { date: string }) | null {
  if (!ranges?.length) return null;
  for (const raw of journeyDates) {
    const date = String(raw ?? "").trim().slice(0, 10);
    if (!isIsoDate(date)) continue;
    const hit = ranges.find((r) => r.from <= date && date <= r.to);
    if (hit) return { ...hit, date };
  }
  return null;
}

function shortUkDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return `${d.getUTCDate()} ${d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })} ${d.getUTCFullYear()}`;
}

/** "24–26 Dec 2026 (Christmas)" style wording for customers and the dashboard. */
export function formatBlackoutRange(range: PromoBlackoutRange): string {
  const span = range.from === range.to ? shortUkDate(range.from) : `${shortUkDate(range.from)} – ${shortUkDate(range.to)}`;
  return range.label ? `${span} (${range.label})` : span;
}

/** Customer message when a journey date is excluded. */
export function promoBlackoutMessage(hit: PromoBlackoutRange & { date: string }): string {
  return `Promo codes can't be used for journeys on ${shortUkDate(hit.date)}${hit.label ? ` (${hit.label})` : ""}. Excluded dates: ${formatBlackoutRange(hit)}. Please choose another date or continue without the code.`;
}


function normalizeCampaign(input: unknown): PromoCampaign | null {
  if (!input || typeof input !== "object") return null;
  const c = input as Record<string, unknown>;
  const rate = Number(c.discountRate);
  const startsAt = Date.parse(String(c.startsAt ?? ""));
  const endsAt = Date.parse(String(c.endsAt ?? ""));
  const name = String(c.name ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
  if (!name || !Number.isFinite(rate) || rate < PROMO_LIMITS.minRate || rate > PROMO_LIMITS.maxRate) return null;
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt) return null;
  return {
    enabled: c.enabled !== false,
    name,
    discountRate: Math.round(rate * 1000) / 1000,
    startsAt: new Date(startsAt).toISOString(),
    endsAt: new Date(endsAt).toISOString(),
  };
}

/** The scheduled offer running right now, if any (and the promotion itself is on). */
export function activePromoCampaign(settings: PromoSettings, now: Date = new Date()): PromoCampaign | null {
  const c = settings.campaign;
  if (!settings.enabled || !c || !c.enabled) return null;
  const t = now.getTime();
  return Date.parse(c.startsAt) <= t && t < Date.parse(c.endsAt) ? c : null;
}

/** Stable id for browser memory ("closed the Black Friday pop-up"). */
export function promoCampaignId(c: PromoCampaign): string {
  return `${c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${c.startsAt.slice(0, 10)}`;
}

/** Percentage for a code issued at `now`: the running offer's, otherwise the everyday one. */
export function promoIssueRate(settings: PromoSettings, now: Date = new Date()): number {
  return activePromoCampaign(settings, now)?.discountRate ?? settings.discountRate;
}
