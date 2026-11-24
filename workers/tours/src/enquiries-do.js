import { authenticateOwner } from "./auth.js";
import { STATUSES, MAX_BODY_BYTES, RETENTION_DAYS, buildEnquiryRecord, receipt, validateEnquiry } from "./enquiries.js";
import { buildSchedule, cruiseScopeFor } from "./engine/itinerary.js";
import { ATTRACTION_BY_ID } from "./engine/attractions.js";

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const DAY = 24 * 3600 * 1000;
const LIMITS = { enquiry: { perHour: 5 }, save: { perHour: 20 }, read: { perHour: 120 } };
export const MAX_STORED_ENQUIRIES = 500;
export const MAX_STORED_PLANS = 1000;

/**
 * Tours enquiries and saved itineraries (staging). Own SQLite-backed storage, own rate limits. Retention is enforced by an alarm AND on every request:
 * expired records are deleted, never merely hidden. Mobility preferences live only inside enquiry records, which only the owner can read.
 */
export class TourEnquiriesDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    await this.purge();
    if (method === "POST" && path === "/submit") return this.submit(request);
    if (method === "POST" && path === "/plans") return this.savePlan(request);
    const plan = path.match(/^\/plans\/([A-Za-z0-9_-]{20,64})$/);
    if (plan && method === "GET") return this.readPlan(plan[1], request);
    if (plan && method === "DELETE") return this.deletePlan(plan[1], request);
    // Everything below is owner only.
    const auth = await authenticateOwner(this.state, this.env, request);
    if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
    if (method === "GET" && path === "/owner/enquiries") return this.list();
    if (method === "POST" && path === "/owner/status") return this.setStatus(request);
    if (method === "POST" && path === "/owner/delete") return this.deleteEnquiry(request);
    return json({ ok: false, error: "not-found" }, 404);
  }

  async alarm() {
    await this.purge();
  }

  async scheduleAlarm() {
    const next = await this.state.storage.getAlarm();
    if (!next) await this.state.storage.setAlarm(Date.now() + DAY);
  }

  async purge() {
    const now = Date.now();
    const last = (await this.state.storage.get("meta:lastPurge")) || 0;
    if (now - last < 60 * 1000) return;
    const doomed = [];
    for (const prefix of ["e:", "p:"]) {
      for (const [key, value] of await this.state.storage.list({ prefix })) if (Date.parse(value.expiresAt) <= now) doomed.push(key);
    }
    for (const [key, value] of await this.state.storage.list({ prefix: "rl:" })) if (value.until <= now) doomed.push(key);
    for (let i = 0; i < doomed.length; i += 128) await this.state.storage.delete(doomed.slice(i, i + 128));
    await this.state.storage.put("meta:lastPurge", now);
  }

  async limited(kind, client) {
    const limit = LIMITS[kind].perHour;
    const bucket = Math.floor(Date.now() / 3600000);
    const key = `rl:${kind}:${client}:${bucket}`;
    const entry = (await this.state.storage.get(key)) || { count: 0, until: (bucket + 1) * 3600000 + 3600000 };
    if (entry.count >= limit) return true;
    await this.state.storage.put(key, { count: entry.count + 1, until: entry.until });
    return false;
  }

  async body(request, max = MAX_BODY_BYTES) {
    const text = await request.text();
    if (text.length > max) return { error: "too-large" };
    try { return { body: JSON.parse(text) }; } catch { return { error: "bad-json" }; }
  }

  async submit(request) {
    const client = request.headers.get("x-client-id") || "unknown";
    if (await this.limited("enquiry", client)) return json({ ok: false, error: "rate-limited" }, 429);
    const parsed = await this.body(request);
    if (parsed.error) return json({ ok: false, error: parsed.error }, parsed.error === "too-large" ? 413 : 400);
    const checked = validateEnquiry(parsed.body);
    if (!checked.ok) return checked.spam ? json({ ok: true, reference: "TE-0000", handling: "standard", message: "Thank you." }) : json({ ok: false, error: "invalid", errors: checked.errors }, 400);
    const count = [...(await this.state.storage.list({ prefix: "e:" })).keys()].length;
    if (count >= MAX_STORED_ENQUIRIES) return json({ ok: false, error: "temporarily-unavailable" }, 503);
    const decision = await this.controlsDecision(checked.value);
    const id = `TE-${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
    const { record } = buildEnquiryRecord(checked.value, { id, now: Date.now(), controlsDecision: decision });
    await this.state.storage.put(`e:${record.createdAt}:${id}`, record);
    await this.scheduleAlarm();
    return json(receipt(record), 201);
  }

  /** Emergency controls always get the last word: the decision is read for this exact request, never cached. Failure is fail-safe (manual review). */
  async controlsDecision(value) {
    try {
      const stub = this.env.TOUR_CONTROLS.get(this.env.TOUR_CONTROLS.idFromName("tour-controls-staging"));
      const schedule = buildSchedule({ stopIds: value.stopIds, date: value.date, startMinutes: value.startMinutes, pickupZoneId: value.pickupZoneId, guests: value.guests, cruise: value.cruise });
      const tourId = (await import("./enquiries.js")).controlsTourFor({ tourId: value.tourId, cruiseScope: value.cruise ? cruiseScopeFor(value.stopIds) : null, durationMinutes: schedule.customer?.durationMinutes ?? 0 });
      const response = await stub.fetch(new Request("https://controls.internal/internal/enquiry-decision", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "enquiry", tourId, variantId: value.variantId || undefined, date: value.date }) }));
      const data = await response.json();
      if (data?.ok && data.decision) return data.decision;
    } catch { /* fall through */ }
    return { kind: "enquiry", allowed: true, manualReview: true, failSafe: true, controlsVersion: null };
  }

  async savePlan(request) {
    const client = request.headers.get("x-client-id") || "unknown";
    if (await this.limited("save", client)) return json({ ok: false, error: "rate-limited" }, 429);
    const parsed = await this.body(request, 8 * 1024);
    if (parsed.error) return json({ ok: false, error: parsed.error }, parsed.error === "too-large" ? 413 : 400);
    const p = parsed.body?.plan;
    const ids = Array.isArray(p?.stopIds) ? p.stopIds : [];
    if (ids.length < 1 || ids.length > 8 || ids.some((s) => !ATTRACTION_BY_ID.has(s))) return json({ ok: false, error: "invalid", errors: ["stopIds"] }, 400);
    const count = [...(await this.state.storage.list({ prefix: "p:" })).keys()].length;
    if (count >= MAX_STORED_PLANS) return json({ ok: false, error: "temporarily-unavailable" }, 503);
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const now = Date.now();
    // Deliberately NOT stored: contact details, mobility preferences, free text. A saved plan is stops, times and preferences only.
    const plan = { stopIds: ids, date: typeof p.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.date) ? p.date : null, startTime: typeof p.startTime === "string" && /^\d{2}:\d{2}$/.test(p.startTime) ? p.startTime : "09:00", guests: Number.isInteger(p.guests) && p.guests >= 1 && p.guests <= 4 ? p.guests : 2, pickupZoneId: typeof p.pickupZoneId === "string" ? p.pickupZoneId.slice(0, 30) : "belfast-centre", interests: Array.isArray(p.interests) ? p.interests.filter((i) => typeof i === "string").slice(0, 10).map((i) => i.slice(0, 20)) : [], pace: ["relaxed", "balanced", "full"].includes(p.pace) ? p.pace : "balanced" };
    await this.state.storage.put(`p:${token}`, { plan, createdAt: new Date(now).toISOString(), expiresAt: new Date(now + RETENTION_DAYS * DAY).toISOString() });
    await this.scheduleAlarm();
    return json({ ok: true, token, expiresAt: new Date(now + RETENTION_DAYS * DAY).toISOString() }, 201);
  }

  async readPlan(token, request) {
    const client = request.headers.get("x-client-id") || "unknown";
    if (await this.limited("read", client)) return json({ ok: false, error: "rate-limited" }, 429);
    const rec = await this.state.storage.get(`p:${token}`);
    if (!rec || Date.parse(rec.expiresAt) <= Date.now()) return json({ ok: false, error: "not-found" }, 404);
    return json({ ok: true, plan: rec.plan, expiresAt: rec.expiresAt });
  }

  async deletePlan(token) {
    await this.state.storage.delete(`p:${token}`);
    return json({ ok: true });
  }

  async list() {
    const entries = [...(await this.state.storage.list({ prefix: "e:", reverse: true })).values()].slice(0, 200);
    return json({ ok: true, retentionDays: RETENTION_DAYS, statuses: STATUSES, entries });
  }

  async setStatus(request) {
    const parsed = await this.body(request, 2048);
    if (parsed.error) return json({ ok: false, error: parsed.error }, 400);
    const { id, status } = parsed.body || {};
    if (typeof id !== "string" || !STATUSES.includes(status)) return json({ ok: false, error: "invalid" }, 400);
    for (const [key, value] of await this.state.storage.list({ prefix: "e:" })) {
      if (value.id === id) { await this.state.storage.put(key, { ...value, status }); return json({ ok: true }); }
    }
    return json({ ok: false, error: "not-found" }, 404);
  }

  async deleteEnquiry(request) {
    const parsed = await this.body(request, 2048);
    const id = parsed.body?.id;
    if (typeof id !== "string") return json({ ok: false, error: "invalid" }, 400);
    for (const [key, value] of await this.state.storage.list({ prefix: "e:" })) if (value.id === id) { await this.state.storage.delete(key); return json({ ok: true }); }
    return json({ ok: false, error: "not-found" }, 404);
  }
}
