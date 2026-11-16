/**
 * Email promo codes — D1 storage (binding DRIVER_DB, migration 0005_promo_codes.sql).
 *
 * Every state change is a single conditional UPDATE, so D1's per-statement atomicity gives:
 * one live code per customer, one redemption per code, and no double spend under concurrency.
 */
import {
  DEFAULT_PROMO_SETTINGS,
  PROMO_MARKETING_CONSENT_VERSION,
  PROMO_MARKETING_CONSENT_WORDING,
  canonicalPromoEmail,
  generatePromoCode,
  normalizePromoEmail,
  normalizePromoSettings,
  promoDisplayStatus,
  promoExpiresAt,
  promoMeetsMinimum,
  type PromoCodeRow,
  type PromoCodeStatus,
  type PromoRejectReason,
  type PromoSettings,
  type PromoTerms,
} from "../shared/promo-code";

export interface PromoPrepared {
  bind(...values: unknown[]): PromoPrepared;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
export interface PromoDb {
  prepare(sql: string): PromoPrepared;
}

export type PromoEnv = { DRIVER_DB?: unknown; PROMO_HASH_SECRET?: string };

export function promoDb(env: PromoEnv): PromoDb | null {
  const db = env.DRIVER_DB as PromoDb | undefined;
  return db && typeof db.prepare === "function" ? db : null;
}

/** Rows changed by a run() — real D1 reports meta.changes, node:sqlite reports changes. */
function changes(result: unknown): number {
  const r = result as { meta?: { changes?: number }; changes?: number } | null;
  return Number(r?.meta?.changes ?? r?.changes ?? 0);
}

const enc = new TextEncoder();
export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function promoEmailHash(email: string, secret = ""): Promise<string> {
  const canonical = canonicalPromoEmail(email);
  return canonical ? sha256Hex(`promo-email:${secret}:${canonical}`) : "";
}

export async function promoIpHash(ip: string, secret = ""): Promise<string> {
  const clean = ip.trim();
  return clean ? sha256Hex(`promo-ip:${secret}:${clean}`) : "";
}

const pence = (gbp: number) => Math.round((Number(gbp) || 0) * 100);
const gbp = (p: unknown) => (p == null ? undefined : Math.round(Number(p)) / 100);

/* ------------------------------------------------------------------ settings */

export async function getPromoSettings(db: PromoDb): Promise<PromoSettings> {
  const row = await db.prepare("SELECT json, updated_at FROM promo_settings WHERE id = 1").first<{ json: string; updated_at: string }>();
  if (!row) return { ...DEFAULT_PROMO_SETTINGS };
  try {
    return normalizePromoSettings({ ...JSON.parse(row.json), updatedAt: row.updated_at });
  } catch {
    return { ...DEFAULT_PROMO_SETTINGS };
  }
}

export async function savePromoSettings(
  db: PromoDb,
  patch: Partial<PromoSettings>,
  now: Date,
  actor = "owner",
): Promise<PromoSettings> {
  const current = await getPromoSettings(db);
  const { updatedAt: _ignored, ...rest } = { ...current, ...patch };
  const next = normalizePromoSettings(rest);
  const iso = now.toISOString();
  await db
    .prepare(
      "INSERT INTO promo_settings (id, json, updated_at, updated_by) VALUES (1, ?, ?, ?) " +
        "ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    )
    .bind(JSON.stringify(next), iso, actor)
    .run();
  return { ...next, updatedAt: iso };
}

/* ------------------------------------------------------------------ requests */

export type PromoRequestOutcome =
  | "issued"
  | "resent"
  | "resend_throttled"
  | "already_used"
  | "blocked"
  | "rate_limited"
  | "send_failed"
  | "disabled"
  | "validate";

export async function logPromoRequest(
  db: PromoDb,
  entry: { at: Date; emailHash: string; ipHash: string; outcome: PromoRequestOutcome; code?: string; source?: string },
): Promise<void> {
  await db
    .prepare("INSERT INTO promo_requests (at, email_hash, ip_hash, outcome, code, source) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(entry.at.toISOString(), entry.emailHash, entry.ipHash, entry.outcome, entry.code ?? null, (entry.source ?? "").slice(0, 40))
    .run();
}

export const PROMO_RATE_LIMITS = {
  perIpPerHour: 6,
  perEmailPerDay: 4,
  allPerHour: 300,
  /** Minimum gap before the same code is emailed again. */
  resendGapMs: 2 * 60_000,
  maxSendsPerCode: 6,
} as const;

/** True when this request must be refused (counts requests already logged). */
export async function promoRequestRateLimited(
  db: PromoDb,
  input: { now: Date; emailHash: string; ipHash: string },
): Promise<boolean> {
  const hourAgo = new Date(input.now.getTime() - 3_600_000).toISOString();
  const dayAgo = new Date(input.now.getTime() - 86_400_000).toISOString();
  const row = await db
    .prepare(
      "SELECT " +
        "(SELECT COUNT(*) FROM promo_requests WHERE ip_hash = ? AND ip_hash <> '' AND at > ?) AS ip_hour, " +
        "(SELECT COUNT(*) FROM promo_requests WHERE email_hash = ? AND at > ?) AS email_day, " +
        "(SELECT COUNT(*) FROM promo_requests WHERE at > ?) AS all_hour",
    )
    .bind(input.ipHash, hourAgo, input.emailHash, dayAgo, hourAgo)
    .first<{ ip_hour: number; email_day: number; all_hour: number }>();
  if (!row) return false;
  return (
    Number(row.ip_hour) >= PROMO_RATE_LIMITS.perIpPerHour ||
    Number(row.email_day) >= PROMO_RATE_LIMITS.perEmailPerDay ||
    Number(row.all_hour) >= PROMO_RATE_LIMITS.allPerHour
  );
}

/* ------------------------------------------------------------------ issuing */

type CodeRecord = {
  code: string;
  email: string;
  email_hash: string;
  discount_rate: number;
  minimum_fare_pence: number;
  issued_at: string;
  expires_at: string;
  status: PromoCodeStatus;
  reserved_key: string | null;
  reserved_until: string | null;
  redeemed_at: string | null;
  redeemed_key: string | null;
  booking_reference: string | null;
  discount_pence: number | null;
  vehicle_fare_pence: number | null;
  booking_total_pence: number | null;
  deactivated_at: string | null;
  deactivated_reason: string | null;
  conflict_at: string | null;
  marketing_opt_in: number;
  email_sent_at: string | null;
  email_send_count: number;
};

/** Live codes past their expiry (and any lapsed reservation on them) become "expired". */
export async function expireStalePromoCodes(db: PromoDb, now: Date, emailHash?: string): Promise<number> {
  const iso = now.toISOString();
  const where =
    "expires_at <= ? AND (status = 'active' OR (status = 'reserved' AND (reserved_until IS NULL OR reserved_until <= ?)))";
  const stmt = emailHash
    ? db.prepare(`UPDATE promo_codes SET status = 'expired', reserved_key = NULL, reserved_until = NULL WHERE email_hash = ? AND ${where}`).bind(emailHash, iso, iso)
    : db.prepare(`UPDATE promo_codes SET status = 'expired', reserved_key = NULL, reserved_until = NULL WHERE ${where}`).bind(iso, iso);
  return changes(await stmt.run());
}

export type IssueResult =
  | { kind: "issued" | "resend"; code: string; issuedAt: string; expiresAt: string; discountRate: number; minimumVehicleFareGbp: number }
  | { kind: "resend_throttled"; code: string }
  | { kind: "already_used" }
  | { kind: "blocked" };

/**
 * Give this customer their code: a new one, or the same live one again.
 * - A customer who has ever redeemed a code gets no new code (one redemption per customer).
 * - A code the owner deactivated blocks new codes for that customer (abuse control).
 * - An unused code that expired may be replaced by a fresh code.
 */
export async function issueOrResendPromoCode(
  db: PromoDb,
  input: {
    email: string;
    emailHash: string;
    settings: PromoSettings;
    now: Date;
    source: string;
    marketingOptIn: boolean;
    generate?: () => string;
  },
): Promise<IssueResult> {
  const email = normalizePromoEmail(input.email);
  await expireStalePromoCodes(db, input.now, input.emailHash);
  const history = await db
    .prepare("SELECT * FROM promo_codes WHERE email_hash = ? ORDER BY issued_at DESC")
    .bind(input.emailHash)
    .all<CodeRecord>();
  const rows = history.results ?? [];
  if (rows.some((r) => r.status === "redeemed")) return { kind: "already_used" };
  if (rows.some((r) => r.status === "deactivated")) return { kind: "blocked" };
  const live = rows.find((r) => r.status === "active" || r.status === "reserved");
  if (live) return resendDecision(live, input.now, input.marketingOptIn, db);

  const generate = input.generate ?? (() => generatePromoCode());
  const issuedAt = input.now.toISOString();
  const expiresAt = promoExpiresAt(input.now, input.settings.validityDays).toISOString();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generate();
    try {
      await db
        .prepare(
          "INSERT INTO promo_codes (code, email, email_hash, discount_rate, minimum_fare_pence, issued_at, expires_at, status, marketing_opt_in, source) " +
            "VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)",
        )
        .bind(
          code,
          email,
          input.emailHash,
          input.settings.discountRate,
          pence(input.settings.minimumVehicleFareGbp),
          issuedAt,
          expiresAt,
          input.marketingOptIn ? 1 : 0,
          input.source.slice(0, 40),
        )
        .run();
      return {
        kind: "issued",
        code,
        issuedAt,
        expiresAt,
        discountRate: input.settings.discountRate,
        minimumVehicleFareGbp: input.settings.minimumVehicleFareGbp,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/UNIQUE/i.test(message)) {
        // Same customer in a parallel request won the race: send that code instead.
        const winner = await db
          .prepare("SELECT * FROM promo_codes WHERE email_hash = ? AND status IN ('active','reserved') LIMIT 1")
          .bind(input.emailHash)
          .first<CodeRecord>();
        if (winner) return resendDecision(winner, input.now, input.marketingOptIn, db);
        continue; // code collision (vanishingly rare): try another code
      }
      throw error;
    }
  }
  throw new Error("Could not allocate a unique promo code");
}

async function resendDecision(live: CodeRecord, now: Date, marketingOptIn: boolean, db: PromoDb): Promise<IssueResult> {
  if (marketingOptIn && !live.marketing_opt_in) {
    await db.prepare("UPDATE promo_codes SET marketing_opt_in = 1 WHERE code = ?").bind(live.code).run();
  }
  const last = live.email_sent_at ? Date.parse(live.email_sent_at) : 0;
  if (
    Number(live.email_send_count) >= PROMO_RATE_LIMITS.maxSendsPerCode ||
    (last && now.getTime() - last < PROMO_RATE_LIMITS.resendGapMs)
  ) {
    return { kind: "resend_throttled", code: live.code };
  }
  return {
    kind: "resend",
    code: live.code,
    issuedAt: live.issued_at,
    expiresAt: live.expires_at,
    discountRate: Number(live.discount_rate),
    minimumVehicleFareGbp: Number(live.minimum_fare_pence) / 100,
  };
}

export async function markPromoEmailSent(db: PromoDb, code: string, now: Date): Promise<void> {
  await db
    .prepare("UPDATE promo_codes SET email_sent_at = ?, email_send_count = email_send_count + 1 WHERE code = ?")
    .bind(now.toISOString(), code)
    .run();
}

/** A brand-new code whose email could not be sent is withdrawn, so the customer can simply retry. */
export async function withdrawUnsentPromoCode(db: PromoDb, code: string): Promise<void> {
  await db.prepare("DELETE FROM promo_codes WHERE code = ? AND email_send_count = 0 AND status = 'active'").bind(code).run();
}

/* ------------------------------------------------------------------ checkout */

export type PromoCheck =
  | { ok: true; terms: PromoTerms; emailHash: string; expiresAt: string }
  | { ok: false; reason: PromoRejectReason; minimumVehicleFareGbp?: number };

/**
 * Can this code be used by this booking email right now? (No state change.)
 * The vehicle-fare minimum is checked separately, against the server's own fare.
 */
export async function checkPromoCodeForBooking(
  db: PromoDb,
  input: { code: string; bookingEmail: string; now: Date; secret?: string; checkoutKey?: string },
): Promise<PromoCheck> {
  const row = await db.prepare("SELECT * FROM promo_codes WHERE code = ?").bind(input.code).first<CodeRecord>();
  if (!row) return { ok: false, reason: "not_found" };
  const bookingHash = await promoEmailHash(input.bookingEmail, input.secret);
  if (!bookingHash || bookingHash !== row.email_hash) return { ok: false, reason: "email_mismatch" };
  if (row.status === "deactivated") return { ok: false, reason: "deactivated" };
  if (row.status === "redeemed") {
    return input.checkoutKey && row.redeemed_key === input.checkoutKey
      ? { ok: true, terms: termsOf(row), emailHash: row.email_hash, expiresAt: row.expires_at }
      : { ok: false, reason: "redeemed" };
  }
  if (row.status === "expired" || Date.parse(row.expires_at) <= input.now.getTime()) return { ok: false, reason: "expired" };
  // One redemption per customer, across every code they were ever sent.
  const used = await db
    .prepare("SELECT 1 AS used FROM promo_codes WHERE email_hash = ? AND status = 'redeemed' LIMIT 1")
    .bind(row.email_hash)
    .first<{ used: number }>();
  if (used) return { ok: false, reason: "already_used_by_customer" };
  return { ok: true, terms: termsOf(row), emailHash: row.email_hash, expiresAt: row.expires_at };
}

function termsOf(row: CodeRecord): PromoTerms {
  return {
    code: row.code,
    discountRate: Number(row.discount_rate),
    minimumVehicleFareGbp: Number(row.minimum_fare_pence) / 100,
  };
}

export function promoVehicleFareQualifies(terms: PromoTerms, vehicleFareGbp: number): boolean {
  return promoMeetsMinimum(vehicleFareGbp, terms.minimumVehicleFareGbp);
}

/** Default hold on a code while the customer is on the payment page (Stripe sessions last 24 h). */
export const PROMO_RESERVATION_MS = 24 * 3_600_000;

/**
 * Hold the code for one checkout. The same customer starting again (new payment page,
 * short-notice request) moves the hold to the new checkout; the old page is closed by the
 * existing supersede logic. Never succeeds once redeemed, deactivated or expired.
 */
export async function reservePromoCode(
  db: PromoDb,
  input: { code: string; emailHash: string; key: string; until: Date; now: Date },
): Promise<boolean> {
  const now = input.now.toISOString();
  const result = await db
    .prepare(
      "UPDATE promo_codes SET status = 'reserved', reserved_key = ?, reserved_until = ? " +
        "WHERE code = ? AND email_hash = ? AND expires_at > ? AND status IN ('active', 'reserved') " +
        "AND NOT EXISTS (SELECT 1 FROM promo_codes r WHERE r.email_hash = promo_codes.email_hash AND r.status = 'redeemed')",
    )
    .bind(input.key, input.until.toISOString(), input.code, input.emailHash, now)
    .run();
  return changes(result) === 1;
}

/** Point a hold at the real checkout id once the payment page exists. */
export async function rebindPromoReservation(
  db: PromoDb,
  input: { code: string; fromKey: string; toKey: string; until?: Date },
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE promo_codes SET reserved_key = ?${input.until ? ", reserved_until = ?" : ""} WHERE code = ? AND status = 'reserved' AND reserved_key = ?`,
    )
    .bind(...(input.until ? [input.toKey, input.until.toISOString()] : [input.toKey]), input.code, input.fromKey)
    .run();
  return changes(result) === 1;
}

/** Payment failed / page expired / request declined: the code is usable again (if still in date). */
export async function releasePromoReservation(db: PromoDb, input: { key: string; code?: string }): Promise<number> {
  const stmt = input.code
    ? db
        .prepare("UPDATE promo_codes SET status = 'active', reserved_key = NULL, reserved_until = NULL WHERE code = ? AND status = 'reserved' AND reserved_key = ?")
        .bind(input.code, input.key)
    : db
        .prepare("UPDATE promo_codes SET status = 'active', reserved_key = NULL, reserved_until = NULL WHERE status = 'reserved' AND reserved_key = ?")
        .bind(input.key);
  return changes(await stmt.run());
}

export type RedeemOutcome = "redeemed" | "already_redeemed_by_this_booking" | "conflict" | "missing";

/**
 * A paid (or card-authorised and confirmed) booking used the code. Always records the use —
 * the customer has already been charged the discounted price — but a second booking on a code
 * that was already spent is flagged for the owner instead of overwriting the first.
 */
export async function redeemPromoCode(
  db: PromoDb,
  input: {
    code: string;
    key: string;
    bookingReference: string;
    discountGbp: number;
    vehicleFareGbp: number;
    bookingTotalGbp: number;
    now: Date;
  },
): Promise<RedeemOutcome> {
  const now = input.now.toISOString();
  const result = await db
    .prepare(
      "UPDATE promo_codes SET status = 'redeemed', redeemed_at = ?, redeemed_key = ?, booking_reference = ?, " +
        "discount_pence = ?, vehicle_fare_pence = ?, booking_total_pence = ?, reserved_key = NULL, reserved_until = NULL " +
        "WHERE code = ? AND status IN ('active', 'reserved', 'expired', 'deactivated')",
    )
    .bind(
      now,
      input.key,
      input.bookingReference,
      pence(input.discountGbp),
      pence(input.vehicleFareGbp),
      pence(input.bookingTotalGbp),
      input.code,
    )
    .run();
  if (changes(result) === 1) return "redeemed";
  const row = await db.prepare("SELECT redeemed_key, booking_reference FROM promo_codes WHERE code = ?").bind(input.code).first<{ redeemed_key: string | null; booking_reference: string | null }>();
  if (!row) return "missing";
  if (row.redeemed_key === input.key || (row.booking_reference && row.booking_reference === input.bookingReference)) {
    return "already_redeemed_by_this_booking";
  }
  await db
    .prepare("UPDATE promo_codes SET conflict_at = ?, conflict_detail = ? WHERE code = ?")
    .bind(now, `Also used by ${input.bookingReference} (${input.key})`.slice(0, 300), input.code)
    .run();
  return "conflict";
}

/** Whole booking cancelled and fully refunded: the customer gets their code back (if still in date). */
export async function reinstatePromoCode(
  db: PromoDb,
  input: { code: string; bookingReference: string; now: Date },
): Promise<boolean> {
  const now = input.now.toISOString();
  const result = await db
    .prepare(
      "UPDATE promo_codes SET status = CASE WHEN expires_at > ? THEN 'active' ELSE 'expired' END, reinstated_at = ?, " +
        "redeemed_at = NULL, redeemed_key = NULL, booking_reference = NULL, discount_pence = NULL, vehicle_fare_pence = NULL, booking_total_pence = NULL " +
        "WHERE code = ? AND status = 'redeemed' AND booking_reference = ?",
    )
    .bind(now, now, input.code, input.bookingReference)
    .run();
  return changes(result) === 1;
}

export async function deactivatePromoCode(db: PromoDb, input: { code: string; reason: string; now: Date }): Promise<boolean> {
  const result = await db
    .prepare(
      "UPDATE promo_codes SET status = 'deactivated', deactivated_at = ?, deactivated_reason = ?, reserved_key = NULL, reserved_until = NULL " +
        "WHERE code = ? AND status IN ('active', 'reserved', 'expired')",
    )
    .bind(input.now.toISOString(), input.reason.slice(0, 200), input.code)
    .run();
  return changes(result) === 1;
}

/* ------------------------------------------------------------------ consent */

export async function recordMarketingConsent(
  db: PromoDb,
  input: { at: Date; email: string; emailHash: string; consented: boolean; source: string; ipHash?: string; wording?: string; version?: string },
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO marketing_consents (at, email, email_hash, consented, wording, version, source, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      input.at.toISOString(),
      normalizePromoEmail(input.email) || input.email.trim().toLowerCase(),
      input.emailHash,
      input.consented ? 1 : 0,
      input.wording ?? (input.consented ? PROMO_MARKETING_CONSENT_WORDING : "Unsubscribed"),
      input.version ?? PROMO_MARKETING_CONSENT_VERSION,
      input.source.slice(0, 40),
      input.ipHash ?? "",
    )
    .run();
}

/* ------------------------------------------------------------------ dashboard */

function toRow(r: CodeRecord, now: Date): PromoCodeRow {
  return {
    code: r.code,
    email: r.email,
    status: r.status,
    displayStatus: promoDisplayStatus({ status: r.status, expiresAt: r.expires_at, reservedUntil: r.reserved_until }, now),
    discountRate: Number(r.discount_rate),
    minimumVehicleFareGbp: Number(r.minimum_fare_pence) / 100,
    issuedAt: r.issued_at,
    expiresAt: r.expires_at,
    ...(r.redeemed_at ? { redeemedAt: r.redeemed_at } : {}),
    ...(r.booking_reference ? { bookingReference: r.booking_reference } : {}),
    ...(r.discount_pence != null ? { discountGbp: gbp(r.discount_pence) } : {}),
    ...(r.vehicle_fare_pence != null ? { vehicleFareGbp: gbp(r.vehicle_fare_pence) } : {}),
    ...(r.booking_total_pence != null ? { bookingTotalGbp: gbp(r.booking_total_pence) } : {}),
    marketingOptIn: Boolean(r.marketing_opt_in),
    ...(r.deactivated_at ? { deactivatedAt: r.deactivated_at } : {}),
    ...(r.deactivated_reason ? { deactivatedReason: r.deactivated_reason } : {}),
    ...(r.conflict_at ? { conflict: true } : {}),
  };
}

export async function listPromoCodes(
  db: PromoDb,
  input: { now: Date; search?: string; status?: string; limit?: number },
): Promise<PromoCodeRow[]> {
  const limit = Math.min(Math.max(Number(input.limit) || 500, 1), 2000);
  const search = (input.search ?? "").trim().toLowerCase().slice(0, 100);
  const clauses: string[] = [];
  const values: unknown[] = [];
  if (search) {
    clauses.push("(lower(email) LIKE ? OR code LIKE ? OR lower(IFNULL(booking_reference,'')) LIKE ?)");
    const like = `%${search.replace(/[%_]/g, "")}%`;
    values.push(like, like.toUpperCase(), like);
  }
  const iso = input.now.toISOString();
  switch (input.status) {
    case "active":
      clauses.push("((status = 'active' AND expires_at > ?) OR (status = 'reserved' AND expires_at > ?))");
      values.push(iso, iso);
      break;
    case "redeemed":
      clauses.push("status = 'redeemed'");
      break;
    case "expired":
      clauses.push("(status = 'expired' OR (status IN ('active','reserved') AND expires_at <= ?))");
      values.push(iso);
      break;
    case "deactivated":
      clauses.push("status = 'deactivated'");
      break;
    default:
      break;
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const result = await db
    .prepare(`SELECT * FROM promo_codes ${where} ORDER BY issued_at DESC LIMIT ${limit}`)
    .bind(...values)
    .all<CodeRecord>();
  return (result.results ?? []).map((r) => toRow(r, input.now));
}

export type PromoStats = {
  requests: number;
  uniqueRequesters: number;
  issued: number;
  active: number;
  redeemed: number;
  expired: number;
  deactivated: number;
  conflicts: number;
  discountTotalGbp: number;
  revenueTotalGbp: number;
  /** Redeemed ÷ issued (codes that turned into paid bookings). */
  conversionRate: number;
  marketingOptIns: number;
};

export async function promoStats(db: PromoDb, now: Date): Promise<PromoStats> {
  const iso = now.toISOString();
  const codes = await db
    .prepare(
      "SELECT COUNT(*) AS issued, " +
        "SUM(CASE WHEN status IN ('active','reserved') AND expires_at > ? THEN 1 ELSE 0 END) AS active, " +
        "SUM(CASE WHEN status = 'redeemed' THEN 1 ELSE 0 END) AS redeemed, " +
        "SUM(CASE WHEN status = 'expired' OR (status IN ('active','reserved') AND expires_at <= ?) THEN 1 ELSE 0 END) AS expired, " +
        "SUM(CASE WHEN status = 'deactivated' THEN 1 ELSE 0 END) AS deactivated, " +
        "SUM(CASE WHEN conflict_at IS NOT NULL THEN 1 ELSE 0 END) AS conflicts, " +
        "SUM(CASE WHEN status = 'redeemed' THEN IFNULL(discount_pence,0) ELSE 0 END) AS discount_pence, " +
        "SUM(CASE WHEN status = 'redeemed' THEN IFNULL(booking_total_pence,0) ELSE 0 END) AS revenue_pence, " +
        "SUM(CASE WHEN marketing_opt_in = 1 THEN 1 ELSE 0 END) AS opt_ins " +
        "FROM promo_codes",
    )
    .bind(iso, iso)
    .first<Record<string, number | null>>();
  const reqs = await db
    .prepare("SELECT COUNT(*) AS requests, COUNT(DISTINCT email_hash) AS uniq FROM promo_requests WHERE outcome NOT IN ('rate_limited', 'validate', 'disabled')")
    .first<{ requests: number; uniq: number }>();
  const n = (v: unknown) => Number(v ?? 0) || 0;
  const issued = n(codes?.issued);
  const redeemed = n(codes?.redeemed);
  return {
    requests: n(reqs?.requests),
    uniqueRequesters: n(reqs?.uniq),
    issued,
    active: n(codes?.active),
    redeemed,
    expired: n(codes?.expired),
    deactivated: n(codes?.deactivated),
    conflicts: n(codes?.conflicts),
    discountTotalGbp: n(codes?.discount_pence) / 100,
    revenueTotalGbp: n(codes?.revenue_pence) / 100,
    conversionRate: issued > 0 ? Math.round((redeemed / issued) * 1000) / 1000 : 0,
    marketingOptIns: n(codes?.opt_ins),
  };
}

/* ------------------------------------------------------------------ retention */

/**
 * Retention (also set out in the Privacy Policy):
 * - request log (rate limiting / abuse): 90 days;
 * - codes never used: deleted 12 months after they expire;
 * - redeemed codes: the email address is erased 24 months after use; the hashed customer key,
 *   code and amounts stay for the one-per-customer rule and promotion accounting;
 * - consent evidence: 3 years after it was recorded (the live list keeps its own unsubscribe state).
 */
export async function runPromoRetention(db: PromoDb, now: Date): Promise<{ requests: number; codes: number; anonymised: number; consents: number }> {
  const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
  await expireStalePromoCodes(db, now);
  const requests = changes(await db.prepare("DELETE FROM promo_requests WHERE at < ?").bind(ago(90)).run());
  const codes = changes(
    await db
      .prepare("DELETE FROM promo_codes WHERE status IN ('expired','deactivated') AND expires_at < ?")
      .bind(ago(365))
      .run(),
  );
  const anonymised = changes(
    await db
      .prepare("UPDATE promo_codes SET email = '', anonymised_at = ? WHERE status = 'redeemed' AND redeemed_at < ? AND email <> ''")
      .bind(now.toISOString(), ago(730))
      .run(),
  );
  const consents = changes(await db.prepare("DELETE FROM marketing_consents WHERE at < ?").bind(ago(1095)).run());
  return { requests, codes, anonymised, consents };
}

/** Owner dashboard: every request outcome tally (abuse visibility). */
export async function promoRequestOutcomes(db: PromoDb): Promise<Record<string, number>> {
  const result = await db.prepare("SELECT outcome, COUNT(*) AS n FROM promo_requests GROUP BY outcome").all<{ outcome: string; n: number }>();
  return Object.fromEntries((result.results ?? []).map((r) => [r.outcome, Number(r.n)]));
}

export { canonicalPromoEmail };
