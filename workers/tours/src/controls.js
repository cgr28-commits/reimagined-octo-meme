import { seedSettings } from "./seed.js";

/**
 * WP-B2 emergency controls: PURE logic (no storage, no network). Staging only.
 *
 * Concerns NEW private-tour enquiries and NEW tour payments only. It has no notion of airport transfers, confirmed bookings,
 * payments already in progress, Stripe webhooks, refunds or customer booking access, and cannot block them.
 * Authoritative checks are server-side (evaluateEnquiry / evaluatePayment). The public status is informational only.
 */
export const CONTROLS_SCHEMA = "tour-controls/1";
export const DEFAULT_LIMITS = { maxRangeDays: 366, maxAutoResumeDays: 90, maxOverrideHours: 72 }; // provisional, owner-configurable
export const LIMIT_BOUNDS = { maxRangeDays: [1, 3660], maxAutoResumeDays: [1, 3660], maxOverrideHours: [1, 168] };
export const EFFECTS = ["enquiries", "payments", "both"]; // enquiries = manual review mode; payments = no NEW payments
export const SCOPE_KINDS = ["all", "tour", "date", "cruise"];
export const CRUISE_SCOPES = ["all", "belfastOnly", "longDistance"];
export const MANDATORY_FLAGS = ["launchGatesPassed", "availabilityConfirmed", "safetyApproved"];
/** Things emergency controls can never block. */
export const UNAFFECTED_KINDS = ["confirmed-booking", "payment-in-progress", "stripe-webhook", "refund", "customer-booking-access"];
export const MAX_ACTIVE_PAUSES = 100;
const RETAIN_ENDED_MS = 90 * 24 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

const seed = seedSettings();
/** tourId -> { variants: Set, cruiseScope: "belfastOnly" | "longDistance" | null } (from the agreed seed; no live data) */
export const TOUR_CATALOGUE = new Map(seed.commercial.tours.map((t) => [t.id, { variants: new Set((t.variants || []).map((v) => v.id)), cruiseScope: t.cruiseScope || null }]));

export function initialControls() {
  return { schema: CONTROLS_SCHEMA, limits: { ...DEFAULT_LIMITS }, pauses: [], overrides: [], ledgerReservationPause: null };
}

// ---------------------------------------------------------------- helpers
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const clone = (v) => structuredClone(v);
export function cleanText(value) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim() : "";
}
function validDate(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
const dayNumber = (s) => Date.parse(`${s}T00:00:00Z`) / DAY_MS;
const LONDON = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" });
/** Scheduled tour date in Europe/London: a YYYY-MM-DD date is used as is; an ISO instant (with Z/offset) is converted. */
export function londonDate(input) {
  if (validDate(input)) return input;
  if (typeof input !== "string" || !/^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})$/.test(input)) return null;
  const t = Date.parse(input);
  return Number.isNaN(t) ? null : LONDON.format(new Date(t));
}

export function describeScope(scope) {
  if (scope.kind === "all") return "all private tours";
  if (scope.kind === "tour") return scope.variantId ? `${scope.tourId} (${scope.variantId})` : scope.tourId;
  if (scope.kind === "date") return scope.from === scope.to ? `tours on ${scope.from}` : `tours from ${scope.from} to ${scope.to}`;
  return scope.cruiseScope === "all" ? "all cruise tours" : scope.cruiseScope === "belfastOnly" ? "Belfast-only cruise tours" : "long-distance cruise tours";
}

// ---------------------------------------------------------------- validation
export function validateScope(scope, limits = DEFAULT_LIMITS) {
  const errors = [];
  if (!isObj(scope) || !SCOPE_KINDS.includes(scope.kind)) return ["scope.kind"];
  const allowed = { all: ["kind"], tour: ["kind", "tourId", "variantId"], date: ["kind", "from", "to"], cruise: ["kind", "cruiseScope"] }[scope.kind];
  for (const k of Object.keys(scope)) if (!allowed.includes(k)) errors.push(`scope.${k}`);
  if (scope.kind === "tour") {
    const tour = TOUR_CATALOGUE.get(scope.tourId);
    if (!tour) errors.push("scope.tourId");
    else if (scope.variantId !== undefined && !tour.variants.has(scope.variantId)) errors.push("scope.variantId");
  }
  if (scope.kind === "date") {
    if (!validDate(scope.from)) errors.push("scope.from");
    if (!validDate(scope.to)) errors.push("scope.to");
    if (validDate(scope.from) && validDate(scope.to)) {
      const days = dayNumber(scope.to) - dayNumber(scope.from) + 1;
      if (days < 1) errors.push("scope.range-order");
      else if (days > limits.maxRangeDays) errors.push(`scope.range-too-long(max ${limits.maxRangeDays} days)`);
    }
  }
  if (scope.kind === "cruise" && !CRUISE_SCOPES.includes(scope.cruiseScope)) errors.push("scope.cruiseScope");
  return errors;
}

export function validateReason(reason) {
  const text = cleanText(reason);
  return text.length >= 5 && text.length <= 500 ? [] : ["reason(5-500 characters)"];
}

/** Structural integrity of a stored controls document (used on every load: a document that fails is treated as unreadable). */
export function validateControls(doc) {
  const errors = [];
  if (!isObj(doc) || doc.schema !== CONTROLS_SCHEMA) return ["schema"];
  if (!isObj(doc.limits)) errors.push("limits");
  else for (const [k, [lo, hi]] of Object.entries(LIMIT_BOUNDS)) if (!Number.isInteger(doc.limits[k]) || doc.limits[k] < lo || doc.limits[k] > hi) errors.push(`limits.${k}`);
  if (doc.ledgerReservationPause !== null) errors.push("ledgerReservationPause(reserved for the ledger package)");
  if (!Array.isArray(doc.pauses) || !Array.isArray(doc.overrides)) return [...errors, "pauses/overrides"];
  const ids = new Set();
  for (const p of doc.pauses) {
    if (!isObj(p) || typeof p.id !== "string" || ids.has(p.id)) { errors.push("pause.id"); continue; }
    ids.add(p.id);
    if (!EFFECTS.includes(p.effect)) errors.push(`pause.${p.id}.effect`);
    if (!["active", "resumed"].includes(p.status)) errors.push(`pause.${p.id}.status`);
    if (!isObj(p.scope) || !SCOPE_KINDS.includes(p.scope.kind)) errors.push(`pause.${p.id}.scope`);
    else if (validateScope(p.scope, { maxRangeDays: 3660 }).length) errors.push(`pause.${p.id}.scope`);
  }
  for (const o of doc.overrides) if (!isObj(o) || typeof o.id !== "string" || typeof o.quoteId !== "string" || ids.has(o.id)) errors.push("override");
  return errors;
}

// ---------------------------------------------------------------- activity and matching
export const pauseIsActive = (p, now) => p.status === "active" && !(p.resumeAt && Date.parse(p.resumeAt) <= now);
export const overrideIsValid = (o, quoteId, now) => o.quoteId === quoteId && !o.revokedAt && Date.parse(o.expiresAt) > now;
const effectReview = (p) => p.effect === "enquiries" || p.effect === "both";
const effectPayments = (p) => p.effect === "payments" || p.effect === "both";

/** ctx: { tourId, variantId?, date? } — date is the SCHEDULED tour date (Europe/London). Missing details match conservatively. */
export function scopeMatches(scope, ctx) {
  const tour = TOUR_CATALOGUE.get(ctx.tourId);
  switch (scope.kind) {
    case "all": return true;
    case "tour": return scope.tourId === ctx.tourId && (scope.variantId === undefined || ctx.variantId === undefined || scope.variantId === ctx.variantId);
    case "date": { const d = londonDate(ctx.date); return d === null ? true : d >= scope.from && d <= scope.to; }
    case "cruise": return Boolean(tour && tour.cruiseScope && (scope.cruiseScope === "all" || scope.cruiseScope === tour.cruiseScope));
    default: return true; // unknown scope kind: fail safe
  }
}
const activeMatching = (doc, ctx, now, test) => doc.pauses.filter((p) => pauseIsActive(p, now) && test(p) && scopeMatches(p.scope, ctx));

// ---------------------------------------------------------------- decisions (server-side, authoritative)
export function failSafeDecision(kind) {
  return kind === "enquiry"
    ? { kind, allowed: true, manualReview: true, autoQuote: false, reserveAvailability: false, blockedBy: ["controls-unreadable"], failSafe: true }
    : { kind, allowed: false, blockedBy: ["controls-unreadable"], failSafe: true };
}

/** New enquiries are ALWAYS accepted. While a matching pause is active they are flagged for manual review: no automatic quote, no availability reservation. */
export function evaluateEnquiry(doc, ctx, now = Date.now(), controlsVersion = null) {
  const matching = activeMatching(doc, ctx, now, effectReview);
  const review = matching.length > 0;
  return { kind: "enquiry", allowed: true, manualReview: review, autoQuote: !review, reserveAvailability: !review, blockedBy: matching.map((p) => `pause:${p.id}`), controlsVersion, failSafe: false };
}

/** A NEW payment needs: no matching payment pause (unless an audited owner override exists for this quote) AND every mandatory gate true. */
export function evaluatePayment(doc, ctx, now = Date.now(), controlsVersion = null) {
  const blockedBy = [];
  const mandatory = isObj(ctx.mandatory) ? ctx.mandatory : {};
  for (const flag of MANDATORY_FLAGS) if (mandatory[flag] !== true) blockedBy.push(`mandatory:${flag}`); // missing = blocked
  if (!TOUR_CATALOGUE.has(ctx.tourId)) blockedBy.push("unknown-tour");
  const pauses = activeMatching(doc, ctx, now, effectPayments);
  let overrideId = null;
  if (pauses.length > 0) {
    const override = typeof ctx.quoteId === "string" ? doc.overrides.find((o) => overrideIsValid(o, ctx.quoteId, now)) : undefined;
    if (override) overrideId = override.id; // lifts PAUSES only; mandatory gates above still apply
    else for (const p of pauses) blockedBy.push(`pause:${p.id}`);
  }
  return { kind: "payment", allowed: blockedBy.length === 0, blockedBy, overrideId, controlsVersion, failSafe: false };
}

export function evaluateKind(doc, kind, ctx, now, controlsVersion) {
  if (UNAFFECTED_KINDS.includes(kind)) return { kind, allowed: true, unaffected: true, blockedBy: [], controlsVersion, failSafe: false };
  if (kind === "enquiry") return evaluateEnquiry(doc, ctx, now, controlsVersion);
  if (kind === "new-payment") return evaluatePayment(doc, ctx, now, controlsVersion);
  return null;
}

/** Public, cached, INFORMATIONAL status. No reasons, ids, dates, audit or owner details. */
export function publicStatus(doc, now = Date.now()) {
  const tours = {};
  for (const [tourId, tour] of TOUR_CATALOGUE) {
    let state = "open";
    for (const p of doc.pauses) {
      if (!pauseIsActive(p, now)) continue;
      const base = { tourId };
      const matches = p.scope.kind === "date" ? true : scopeMatches(p.scope, base);
      if (!matches || (p.scope.kind === "tour" && p.scope.tourId !== tourId)) continue;
      const whole = p.scope.kind === "all" || p.scope.kind === "cruise" || (p.scope.kind === "tour" && p.scope.variantId === undefined);
      if (whole && effectReview(p)) { state = "enquiry-only"; break; }
      state = "limited";
    }
    tours[tourId] = state;
  }
  return { ok: true, informational: true, generatedAt: new Date(now).toISOString(), tours };
}
export const unreadablePublicStatus = (now = Date.now()) => ({ ok: true, informational: true, degraded: true, generatedAt: new Date(now).toISOString(), tours: Object.fromEntries([...TOUR_CATALOGUE.keys()].map((id) => [id, "enquiry-only"])) });

// ---------------------------------------------------------------- mutations (pure: return a NEW document)
function prune(doc, now) {
  doc.pauses = doc.pauses.filter((p) => pauseIsActive(p, now) || !(Date.parse(p.endedAt || p.resumeAt || 0) < now - RETAIN_ENDED_MS));
  doc.overrides = doc.overrides.filter((o) => Date.parse(o.expiresAt) > now - RETAIN_ENDED_MS);
  return doc;
}

export function createPause(doc, input, now, id) {
  const errors = [];
  if (!isObj(input)) return { ok: false, errors: ["body"] };
  errors.push(...validateScope(input.scope, doc.limits));
  if (!EFFECTS.includes(input.effect)) errors.push("effect");
  errors.push(...validateReason(input.reason));
  let resumeAt = null;
  if (input.resumeAt !== undefined && input.resumeAt !== null) {
    const t = typeof input.resumeAt === "string" && /^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})$/.test(input.resumeAt) ? Date.parse(input.resumeAt) : NaN;
    if (Number.isNaN(t)) errors.push("resumeAt");
    else if (t <= now) errors.push("resumeAt(must be in the future)");
    else if (t > now + doc.limits.maxAutoResumeDays * DAY_MS) errors.push(`resumeAt(max ${doc.limits.maxAutoResumeDays} days ahead)`);
    else resumeAt = new Date(t).toISOString();
  }
  if (doc.pauses.filter((p) => pauseIsActive(p, now)).length >= MAX_ACTIVE_PAUSES) errors.push("too-many-active-pauses");
  if (errors.length) return { ok: false, errors };
  const next = prune(clone(doc), now);
  const pause = { id, scope: clone(input.scope), effect: input.effect, reason: cleanText(input.reason), status: "active", createdAt: new Date(now).toISOString(), createdBy: "owner", resumeAt, endedAt: null, endReason: null };
  next.pauses.push(pause);
  return { ok: true, doc: next, pause };
}

export function resumePause(doc, input, now) {
  if (!isObj(input) || typeof input.pauseId !== "string") return { ok: false, errors: ["pauseId"] };
  const errors = validateReason(input.reason);
  const found = doc.pauses.find((p) => p.id === input.pauseId);
  if (!found) errors.push("pauseId(not found)");
  else if (!pauseIsActive(found, now)) errors.push("pauseId(not active)");
  if (errors.length) return { ok: false, errors };
  const next = clone(doc);
  const pause = next.pauses.find((p) => p.id === input.pauseId);
  pause.status = "resumed";
  pause.endedAt = new Date(now).toISOString();
  pause.endReason = cleanText(input.reason);
  // Resuming one pause NEVER lifts another: report what still applies.
  return { ok: true, doc: next, pause, stillActive: next.pauses.filter((p) => pauseIsActive(p, now)).map((p) => p.id) };
}

export function createOverride(doc, input, now, id) {
  if (!isObj(input)) return { ok: false, errors: ["body"] };
  const errors = validateReason(input.reason);
  if (typeof input.quoteId !== "string" || !/^[A-Za-z0-9_-]{3,64}$/.test(input.quoteId)) errors.push("quoteId");
  const hours = input.hours === undefined ? Math.min(24, doc.limits.maxOverrideHours) : input.hours;
  if (!Number.isInteger(hours) || hours < 1 || hours > doc.limits.maxOverrideHours) errors.push(`hours(1-${doc.limits.maxOverrideHours})`);
  if (doc.overrides.some((o) => o.quoteId === input.quoteId && overrideIsValid(o, input.quoteId, now))) errors.push("override-already-active-for-quote");
  if (errors.length) return { ok: false, errors };
  const next = prune(clone(doc), now);
  const override = { id, quoteId: input.quoteId, reason: cleanText(input.reason), createdAt: new Date(now).toISOString(), createdBy: "owner", expiresAt: new Date(now + hours * 3600 * 1000).toISOString(), revokedAt: null };
  next.overrides.push(override);
  return { ok: true, doc: next, override };
}

export function revokeOverride(doc, input, now) {
  if (!isObj(input) || typeof input.overrideId !== "string") return { ok: false, errors: ["overrideId"] };
  const errors = validateReason(input.reason);
  const found = doc.overrides.find((o) => o.id === input.overrideId);
  if (!found) errors.push("overrideId(not found)");
  else if (found.revokedAt) errors.push("overrideId(already revoked)");
  if (errors.length) return { ok: false, errors };
  const next = clone(doc);
  const override = next.overrides.find((o) => o.id === input.overrideId);
  override.revokedAt = new Date(now).toISOString();
  return { ok: true, doc: next, override };
}

export function setLimits(doc, input) {
  if (!isObj(input) || !isObj(input.limits)) return { ok: false, errors: ["limits"] };
  const errors = validateReason(input.reason);
  const limits = { ...doc.limits };
  for (const [k, v] of Object.entries(input.limits)) {
    if (!LIMIT_BOUNDS[k]) errors.push(`limits.${k}`);
    else if (!Number.isInteger(v) || v < LIMIT_BOUNDS[k][0] || v > LIMIT_BOUNDS[k][1]) errors.push(`limits.${k}(${LIMIT_BOUNDS[k][0]}-${LIMIT_BOUNDS[k][1]})`);
    else limits[k] = v;
  }
  if (Object.keys(input.limits).length === 0) errors.push("limits(empty)");
  if (errors.length) return { ok: false, errors };
  const next = clone(doc);
  next.limits = limits; // applies to NEW pauses only; existing pauses are untouched
  return { ok: true, doc: next, limits };
}

/** Notification INTENTS only (WP-B2 does not integrate delivery). Dashboard + immediate owner push are queued for the notifications package. */
export function notificationIntent(event, text) {
  return { event, channels: ["dashboard", "push"], title: "Private tours controls", body: text, delivered: false };
}
