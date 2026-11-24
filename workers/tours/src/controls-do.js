import { authenticateOwner } from "./auth.js";
import { constantTimeEqual, snapshotHash } from "./canonical.js";
import {
  UNAFFECTED_KINDS, createOverride, createPause, describeScope, evaluateKind, failSafeDecision, initialControls, notificationIntent,
  pauseIsActive, publicStatus, resumePause, revokeOverride, setLimits, unreadablePublicStatus, validateControls, cleanText,
} from "./controls.js";

const MAX_BODY_BYTES = 64 * 1024;
const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", ...extra } });
const vkey = (n) => `c:${String(n).padStart(8, "0")}`;
const seqKey = (prefix, n) => `${prefix}:${String(n).padStart(8, "0")}`;

/**
 * Durable Object: emergency controls state. Immutable versions, append-only audit, notification-intent outbox, optimistic
 * concurrency. Every change is ONE storage transaction: version + current pointer + audit entry + notification intents.
 * Staging only.
 */
export class TourControlsDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.chain = Promise.resolve();
  }

  async fetch(request) {
    const run = this.chain.then(() => this.handle(request)).catch((error) => {
      console.error("tours-controls internal error", error && error.name);
      return json({ ok: false, error: "internal-error", detail: `${error && error.name}: ${String((error && error.message) || "").slice(0, 200)}` }, 500);
    });
    this.chain = run.then(() => undefined, () => undefined);
    return run;
  }

  /** ATOMIC: version, pointer, audit entry and notification intents commit together or not at all. */
  async commit(version, doc, action, detail, notifications = []) {
    const hash = await snapshotHash(version, doc);
    const at = new Date().toISOString();
    await this.state.storage.transaction(async (txn) => {
      const current = await txn.get("current");
      if (version !== (current === undefined ? 1 : current + 1)) throw new Error("version-sequence");
      if ((await txn.get(vkey(version))) !== undefined) throw new Error("version-exists");
      const seq = ((await txn.get("auditSeq")) || 0) + 1;
      await txn.put(vkey(version), { version, controls: doc, hash, createdAt: at, actor: action === "seed" ? "system" : "owner", action });
      await txn.put("current", version);
      await txn.put(seqKey("a", seq), { seq, at, action, actor: action === "seed" ? "system" : "owner", detail: { version, hash, ...detail } });
      await txn.put("auditSeq", seq);
      let nseq = (await txn.get("notifySeq")) || 0;
      for (const n of notifications) { nseq += 1; await txn.put(seqKey("n", nseq), { seq: nseq, at, ...n }); }
      await txn.put("notifySeq", nseq);
    });
    return { version, hash };
  }

  async auditOnly(action, detail) {
    await this.state.storage.transaction(async (txn) => {
      const seq = ((await txn.get("auditSeq")) || 0) + 1;
      await txn.put(seqKey("a", seq), { seq, at: new Date().toISOString(), action, actor: "owner", detail });
      await txn.put("auditSeq", seq);
    });
  }

  /** Reads the CURRENT controls and verifies hash + structure. Throws if anything is missing, tampered or invalid (callers fail safe). */
  async load() {
    const current = await this.state.storage.get("current");
    if (current === undefined) return null; // never initialised
    const rec = await this.state.storage.get(vkey(current));
    if (!rec || rec.version !== current) throw new Error("controls-missing");
    const hash = await snapshotHash(rec.version, rec.controls);
    if (!constantTimeEqual(hash, String(rec.hash))) throw new Error("controls-hash-mismatch");
    const problems = validateControls(rec.controls);
    if (problems.length) throw new Error(`controls-invalid:${problems[0]}`);
    return rec;
  }

  async ensureInitialised() {
    if ((await this.state.storage.get("current")) === undefined) await this.commit(1, initialControls(), "seed", { reason: "Initial controls: nothing paused (staging)" });
  }

  async readBody(request) {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return { error: "body-too-large" };
    try { const body = JSON.parse(text); return body && typeof body === "object" && !Array.isArray(body) ? { body } : { error: "invalid-json" }; } catch { return { error: "invalid-json" }; }
  }

  async handle(request) {
    const path = new URL(request.url).pathname.replace(/\/+$/, "") || "/";
    const method = request.method;

    // Public, informational, minimal. Reached only through the Worker's GET /status mapping; never fails open.
    if (method === "GET" && path === "/public-status") {
      let status;
      try { const rec = await this.load(); status = rec ? publicStatus(rec.controls) : publicStatus(initialControls()); } catch { status = unreadablePublicStatus(); }
      return json(status, 200, { "cache-control": "public, max-age=30", "x-status-informational": "true" });
    }

    // Internal only: reachable solely through the TOUR_CONTROLS binding (the public Worker never forwards this path). Always answers; failure is fail-safe.
    if (method === "POST" && path === "/internal/enquiry-decision") return this.check(request);

    const auth = await authenticateOwner(this.state, this.env, request);
    if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);

    // Authoritative decision endpoint: ALWAYS answers; an unreadable state yields the fail-safe decision.
    if (method === "POST" && path === "/controls/check") return this.check(request);

    if (method === "GET") return this.read(path);
    if (method !== "POST") return json({ ok: false, error: "method-not-allowed" }, 405);
    return this.mutate(path, request);
  }

  async read(path) {
    await this.ensureInitialised();
    let rec;
    try { rec = await this.load(); } catch (error) { return json({ ok: false, error: "controls-unreadable", detail: String(error.message).slice(0, 80) }, 503); }
    const now = Date.now();
    if (path === "/controls") {
      return json({ ok: true, version: rec.version, hash: rec.hash, controls: rec.controls, activePauseIds: rec.controls.pauses.filter((p) => pauseIsActive(p, now)).map((p) => p.id), now: new Date(now).toISOString() });
    }
    if (path === "/controls/versions") {
      const list = await this.state.storage.list({ prefix: "c:" });
      return json({ ok: true, current: rec.version, versions: [...list.values()].map(({ version, hash, createdAt, actor, action }) => ({ version, hash, createdAt, actor, action })) });
    }
    const vm = path.match(/^\/controls\/versions\/(\d{1,8})$/);
    if (vm) { const v = await this.state.storage.get(vkey(Number(vm[1]))); return v ? json({ ok: true, ...v }) : json({ ok: false, error: "not-found" }, 404); }
    if (path === "/controls/audit") return json({ ok: true, entries: [...(await this.state.storage.list({ prefix: "a:" })).values()] });
    if (path === "/controls/notifications") return json({ ok: true, delivery: "not-integrated", entries: [...(await this.state.storage.list({ prefix: "n:" })).values()] });
    return json({ ok: false, error: "not-found" }, 404);
  }

  async check(request) {
    const parsed = await this.readBody(request);
    if (parsed.error) return json({ ok: false, error: parsed.error }, 400);
    const { kind, tourId, variantId, date, quoteId, mandatory } = parsed.body;
    const known = ["enquiry", "new-payment", ...UNAFFECTED_KINDS];
    if (!known.includes(kind)) return json({ ok: false, error: "invalid", errors: ["kind"] }, 400);
    if (UNAFFECTED_KINDS.includes(kind)) return json({ ok: true, decision: evaluateKind(initialControls(), kind, {}, Date.now(), null) });
    if (typeof tourId !== "string") return json({ ok: false, error: "invalid", errors: ["tourId"] }, 400);
    try {
      await this.ensureInitialised();
      const rec = await this.load();
      return json({ ok: true, decision: evaluateKind(rec.controls, kind, { tourId, variantId, date, quoteId, mandatory }, Date.now(), rec.version) });
    } catch {
      return json({ ok: true, decision: failSafeDecision(kind) }); // never fails open
    }
  }

  async mutate(path, request) {
    const parsed = await this.readBody(request);
    if (parsed.error) return json({ ok: false, error: parsed.error }, 400);
    const body = parsed.body;
    const handlers = { "/controls/pause": this.doPause, "/controls/resume": this.doResume, "/controls/override": this.doOverride, "/controls/override/revoke": this.doRevoke, "/controls/limits": this.doLimits };
    const fn = handlers[path];
    if (!fn) return json({ ok: false, error: "not-found" }, 404);
    await this.ensureInitialised();
    let rec;
    try { rec = await this.load(); } catch (error) { return json({ ok: false, error: "controls-unreadable", detail: String(error.message).slice(0, 80) }, 503); }
    if (!Number.isInteger(body.expectedVersion)) return json({ ok: false, error: "invalid", errors: ["expectedVersion"] }, 400);
    if (body.expectedVersion !== rec.version) {
      await this.auditOnly("conflict", { path, expectedVersion: body.expectedVersion, currentVersion: rec.version });
      return json({ ok: false, error: "version-conflict", currentVersion: rec.version, currentHash: rec.hash }, 409);
    }
    const now = Date.now();
    const result = await fn.call(this, rec, body, now);
    if (!result.ok) {
      await this.auditOnly("rejected", { path, errors: result.errors.slice(0, 20) });
      return json({ ok: false, error: "invalid", errors: result.errors }, 400);
    }
    const committed = await this.commit(rec.version + 1, result.doc, result.action, result.detail, result.notifications);
    return json({ ok: true, ...committed, ...result.response });
  }

  async doPause(rec, body, now) {
    const r = createPause(rec.controls, body, now, crypto.randomUUID());
    if (!r.ok) return r;
    const p = r.pause;
    return { ok: true, doc: r.doc, action: "pause", detail: { pauseId: p.id, scope: p.scope, effect: p.effect, reason: p.reason, resumeAt: p.resumeAt }, response: { pause: p },
      notifications: [notificationIntent("pause-created", `Paused: ${describeScope(p.scope)} (${p.effect}).${p.resumeAt ? ` Resumes automatically ${p.resumeAt}.` : ""}`)] };
  }

  async doResume(rec, body, now) {
    const r = resumePause(rec.controls, body, now);
    if (!r.ok) return r;
    return { ok: true, doc: r.doc, action: "resume", detail: { pauseId: r.pause.id, scope: r.pause.scope, reason: r.pause.endReason, stillActive: r.stillActive }, response: { pause: r.pause, stillActive: r.stillActive },
      notifications: [notificationIntent("pause-resumed", `Resumed: ${describeScope(r.pause.scope)}.${r.stillActive.length ? ` ${r.stillActive.length} other pause(s) still apply.` : ""}`)] };
  }

  async doOverride(rec, body, now) {
    const r = createOverride(rec.controls, body, now, crypto.randomUUID());
    if (!r.ok) return r;
    const o = r.override;
    return { ok: true, doc: r.doc, action: "override", detail: { overrideId: o.id, quoteId: o.quoteId, reason: o.reason, expiresAt: o.expiresAt }, response: { override: o },
      notifications: [notificationIntent("override-created", `Payment override for quote ${o.quoteId} until ${o.expiresAt}.`)] };
  }

  async doRevoke(rec, body, now) {
    const r = revokeOverride(rec.controls, body, now);
    if (!r.ok) return r;
    return { ok: true, doc: r.doc, action: "override-revoked", detail: { overrideId: r.override.id, quoteId: r.override.quoteId, reason: cleanText(body.reason) }, response: { override: r.override }, notifications: [] };
  }

  async doLimits(rec, body) {
    const r = setLimits(rec.controls, body);
    if (!r.ok) return r;
    return { ok: true, doc: r.doc, action: "limits", detail: { limits: r.limits, reason: cleanText(body.reason) }, response: { limits: r.limits }, notifications: [] };
  }
}
