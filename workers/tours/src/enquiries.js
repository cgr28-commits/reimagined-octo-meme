import { ATTRACTION_BY_ID } from "./engine/attractions.js";
import { buildSchedule, cruiseScopeFor, publicView } from "./engine/itinerary.js";
import { TOUR_BY_ID } from "./engine/tours.js";
import { ZONE_BY_ID } from "./engine/zones.js";
import { parseHM, toHM } from "./engine/estimate.js";
import { DEFAULT_ANCHOR } from "./anchor.js";

/** Public tours enquiries: validation, server-side re-check of the itinerary, record building. Pure functions (the DO only stores). */
export const RETENTION_DAYS = 30; // D8: saved plans and unconverted enquiries (provisional, owner configurable)
export const MAX_BODY_BYTES = 24 * 1024;
export const MOBILITY_CODES = Object.freeze(["limited-walking", "avoid-steps", "wheelchair-folding", "needs-seating", "avoid-steep-paths"]);
export const STATUSES = Object.freeze(["new", "reviewing", "quoted", "declined", "closed"]);

const clean = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : null);

/** Nearest controls tour for an itinerary (conservative mapping for emergency pauses). */
export function controlsTourFor({ tourId, cruiseScope, durationMinutes }) {
  if (tourId && TOUR_BY_ID.has(tourId)) return tourId;
  if (cruiseScope === "belfastOnly") return "cruise-express";
  if (cruiseScope === "longDistance") return "cruise-causeway";
  if (durationMinutes <= 300) return "belfast-city";
  if (durationMinutes <= 480) return "antrim-coast";
  return "giants-causeway";
}

export function validateEnquiry(body, now = Date.now()) {
  const errors = [];
  if (body === null || typeof body !== "object" || Array.isArray(body)) return { ok: false, errors: ["body"] };
  if (typeof body.website === "string" && body.website.trim() !== "") return { ok: false, errors: ["rejected"], spam: true }; // honeypot
  const name = clean(body.name, 80);
  if (name.length < 2) errors.push("name");
  const email = clean(body.email, 254).toLowerCase();
  if (!EMAIL.test(email)) errors.push("email");
  const phone = clean(body.phone, 24);
  if (phone && !/^[+\d][\d\s()-]{6,22}$/.test(phone)) errors.push("phone");
  const contactVia = ["email", "whatsapp", "phone"].includes(body.contactVia) ? body.contactVia : "email";
  if (contactVia !== "email" && !phone) errors.push("phone");
  const date = typeof body.date === "string" && DATE.test(body.date) ? body.date : null;
  if (!date) errors.push("date");
  else {
    const t = Date.parse(`${date}T12:00:00Z`);
    if (!Number.isFinite(t) || t < now - 24 * 3600 * 1000 || t > now + 550 * 24 * 3600 * 1000) errors.push("date-range");
  }
  const startMinutes = parseHM(body.startTime);
  if (startMinutes === null) errors.push("startTime");
  const guests = int(body.guests, 1, 4);
  if (guests === null) errors.push("guests");
  const pickupZoneId = ZONE_BY_ID.has(body.pickupZoneId) ? body.pickupZoneId : null;
  const dropoffZoneId = ZONE_BY_ID.has(body.dropoffZoneId) ? body.dropoffZoneId : pickupZoneId;
  if (!pickupZoneId) errors.push("pickupZoneId");
  const stopIds = Array.isArray(body.stopIds) ? body.stopIds.filter((s) => typeof s === "string") : [];
  if (stopIds.length < 1 || stopIds.length > 8 || stopIds.some((s) => !ATTRACTION_BY_ID.has(s))) errors.push("stopIds");
  const tourId = typeof body.tourId === "string" && TOUR_BY_ID.has(body.tourId) ? body.tourId : null;
  const luggage = { large: int(body.luggage?.large ?? 0, 0, 8), cabin: int(body.luggage?.cabin ?? 0, 0, 8) };
  if (luggage.large === null || luggage.cabin === null) errors.push("luggage");
  let cruise = null;
  if (body.cruise) {
    cruise = { ship: clean(body.cruise.ship, 60), allAboard: body.cruise.allAboard, canLeaveTerminal: body.cruise.canLeaveTerminal, confirmed: body.cruise.confirmed === true };
    if (!cruise.ship) errors.push("cruise.ship");
    if (parseHM(cruise.allAboard) === null) errors.push("cruise.allAboard");
    if (parseHM(cruise.canLeaveTerminal) === null) errors.push("cruise.canLeaveTerminal");
    if (!cruise.confirmed) errors.push("cruise.confirmed");
  }
  const mobilityRequested = Array.isArray(body.mobility?.preferences) && body.mobility.preferences.length > 0;
  const mobilityConsent = body.mobility?.consent === true;
  if (mobilityRequested && !mobilityConsent) errors.push("mobility.consent"); // D17: explicit consent before any preference is stored
  const mobility = mobilityRequested && mobilityConsent ? body.mobility.preferences.filter((c) => MOBILITY_CODES.includes(c)).slice(0, 5) : [];
  if (body.consentToStore !== true) errors.push("consentToStore");
  const notes = clean(body.notes, 1000);
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { name, email, phone, contactVia, date, startMinutes, guests, pickupZoneId, dropoffZoneId, pickupNote: clean(body.pickupNote, 200), stopIds, tourId, variantId: clean(body.variantId, 20) || null, luggage, cruise, mobility, notes, visitMinutes: sanitiseVisits(body.visitMinutes, stopIds) } };
}

function sanitiseVisits(v, stopIds) {
  if (v === null || typeof v !== "object") return {};
  const out = {};
  for (const id of stopIds) if (Number.isFinite(v[id])) out[id] = Math.round(v[id]);
  return out;
}

/** Luggage limits are unset until the boots are measured (D16): any luggage at all goes to owner review. */
export const luggageNeedsReview = (luggage) => luggage.large > 0 || luggage.cabin > 0;

/**
 * Server-side authority: the itinerary is rebuilt from stop ids (client timings are never trusted) and the engine's result decides.
 * Returns { record, schedule } where `record` is what the Durable Object stores (owner view) and `schedule` is customer-safe.
 */
export function buildEnquiryRecord(value, { id, now, controlsDecision, anchor }) {
  const result = buildSchedule({
    stopIds: value.stopIds, date: value.date, startMinutes: value.startMinutes, pickupZoneId: value.pickupZoneId, dropoffZoneId: value.dropoffZoneId, guests: value.guests,
    cruise: value.cruise ? { allAboard: value.cruise.allAboard, canLeaveTerminal: value.cruise.canLeaveTerminal, confirmed: value.cruise.confirmed } : undefined,
    visitMinutes: value.visitMinutes, anchor: anchor || DEFAULT_ANCHOR,
  });
  const flags = {
    infeasible: !result.ok,
    zoneReview: result.issues.some((i) => i.code === "zone-review"),
    reviewRequired: Boolean(result.reviewRequired),
    luggageReview: luggageNeedsReview(value.luggage),
    cruise: Boolean(value.cruise),
    controlsManualReview: Boolean(controlsDecision?.manualReview),
    controlsFailSafe: Boolean(controlsDecision?.failSafe),
  };
  const stored = result.customer
    ? { startTime: toHM(result.customer.startMinutes), endTime: toHM(result.customer.endMinutes), durationMinutes: result.customer.durationMinutes, items: result.customer.items.map((i) => ({ type: i.type, id: i.id, name: i.name, time: toHM(i.startMinutes), minutes: i.minutes })) }
    : null;
  const record = {
    id,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + RETENTION_DAYS * 24 * 3600 * 1000).toISOString(),
    status: "new",
    contact: { name: value.name, email: value.email, phone: value.phone, via: value.contactVia },
    request: { date: value.date, guests: value.guests, pickupZoneId: value.pickupZoneId, dropoffZoneId: value.dropoffZoneId, pickupNote: value.pickupNote, tourId: value.tourId, variantId: value.variantId, luggage: value.luggage, notes: value.notes },
    cruise: value.cruise ? { ship: value.cruise.ship, allAboard: value.cruise.allAboard, canLeaveTerminal: value.cruise.canLeaveTerminal, scope: cruiseScopeFor(value.stopIds), latestBack: result.cruise?.latestBack ?? null } : null,
    itinerary: stored,
    stopIds: value.stopIds,
    price: result.price,
    mobility: value.mobility, // owner-only; never in a public response, analytics or advertising
    owner: { driverWorkingMinutes: result.driver?.workingMinutes ?? null, positioningMinutes: result.driver ? result.driver.positioningOutMinutes + result.driver.positioningBackMinutes : null },
    issues: result.issues.map(({ code, severity, message }) => ({ code, severity, message })),
    flags,
    controls: controlsDecision ? { allowed: controlsDecision.allowed, manualReview: Boolean(controlsDecision.manualReview), controlsVersion: controlsDecision.controlsVersion ?? null, failSafe: Boolean(controlsDecision.failSafe) } : null,
  };
  return { record, schedule: publicView(result) };
}

/** The ONLY thing a customer ever gets back after submitting. */
export function receipt(record) {
  const review = record.flags.infeasible || record.flags.controlsManualReview || record.flags.controlsFailSafe || record.flags.luggageReview || record.flags.zoneReview || record.flags.reviewRequired;
  return {
    ok: true,
    reference: record.id,
    expiresAt: record.expiresAt,
    handling: review ? "manual-review" : "standard",
    message: review
      ? "Thank you. We will review your plan personally and send you a private quote. Nothing is charged."
      : "Thank you. We will check availability and send you a private quote. Nothing is charged until you accept it.",
  };
}
