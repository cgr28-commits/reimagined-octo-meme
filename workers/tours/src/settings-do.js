import { canonicalize, constantTimeEqual, sha256Hex, snapshotHash, verifySnapshot } from "./canonical.js";
import { seedSettings } from "./seed.js";
import { validate } from "./validate.js";

const MAX_BODY_BYTES = 256 * 1024;
const MAX_FAILS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });

/** Durable Object: settings, immutable versions, append-only audit log, optimistic concurrency. Staging only. */
export class TourSettingsDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.chain = Promise.resolve();
    this.fails = new Map(); // in-memory limiter (per DO instance); also persisted lockout below
  }

  /** Serialise every request so version numbers and audit sequence cannot race. */
  async fetch(request) {
    const run = this.chain.then(() => this.handle(request)).catch((error) => {
      console.error("tours-settings internal error", error && error.name);
      return json({ ok: false, error: "internal-error", detail: `${error && error.name}: ${String((error && error.message) || "").slice(0, 200)}` }, 500);
    });
    this.chain = run.then(() => undefined, () => undefined);
    return run;
  }

  async authenticate(request) {
    const key = this.env.TOURS_OWNER_KEY;
    if (typeof key !== "string" || key.length < 16) return { ok: false, status: 503, error: "owner-auth-not-configured" }; // fail closed
    const now = Date.now();
    const client = request.headers.get("x-client-id") || "unknown";
    const lock = (await this.state.storage.get(`lock:${client}`)) || { count: 0, until: 0 };
    if (lock.until > now) return { ok: false, status: 429, error: "locked-out" };
    const supplied = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const [a, b] = await Promise.all([sha256Hex(supplied), sha256Hex(key)]); // equal-length digests
    if (constantTimeEqual(a, b)) {
      if (lock.count) await this.state.storage.delete(`lock:${client}`);
      return { ok: true };
    }
    const count = lock.count + 1;
    await this.state.storage.put(`lock:${client}`, { count, until: count >= MAX_FAILS ? now + LOCKOUT_MS : 0 });
    return { ok: false, status: 401, error: "unauthorised" };
  }

  async ensureInitialised() {
    if ((await this.state.storage.get("current")) !== undefined) return;
    const settings = seedSettings();
    await this.writeVersion(1, settings, "system", "Initial provisional seed (staging)", null);
  }

  async writeVersion(version, settings, actor, reason, restoredFrom) {
    const hash = await snapshotHash(version, settings);
    const record = { version, settings, hash, createdAt: new Date().toISOString(), actor, reason, restoredFrom };
    await this.state.storage.put(`v:${String(version).padStart(8, "0")}`, record);
    await this.state.storage.put("current", version);
    await this.audit(restoredFrom ? "rollback" : version === 1 ? "seed" : "publish", actor, { version, hash, reason, restoredFrom });
    return record;
  }

  async audit(action, actor, detail) {
    const seq = ((await this.state.storage.get("auditSeq")) || 0) + 1;
    await this.state.storage.put(`a:${String(seq).padStart(8, "0")}`, { seq, at: new Date().toISOString(), action, actor, detail });
    await this.state.storage.put("auditSeq", seq);
  }

  async getVersion(n) {
    return this.state.storage.get(`v:${String(n).padStart(8, "0")}`);
  }

  async readBody(request) {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return { error: "body-too-large" };
    try {
      const body = JSON.parse(text);
      return body && typeof body === "object" && !Array.isArray(body) ? { body } : { error: "invalid-json" };
    } catch {
      return { error: "invalid-json" };
    }
  }

  async handle(request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const method = request.method;

    const auth = await this.authenticate(request);
    if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
    await this.ensureInitialised();
    const actor = "owner";
    const current = await this.state.storage.get("current");

    if (method === "GET" && path === "/settings") return json({ ok: true, ...(await this.getVersion(current)) });
    if (method === "GET" && path === "/versions") {
      const list = await this.state.storage.list({ prefix: "v:" });
      return json({ ok: true, current, versions: [...list.values()].map(({ version, hash, createdAt, actor: by, reason, restoredFrom }) => ({ version, hash, createdAt, actor: by, reason, restoredFrom })) });
    }
    const vm = path.match(/^\/versions\/(\d{1,8})$/);
    if (method === "GET" && vm) {
      const rec = await this.getVersion(Number(vm[1]));
      return rec ? json({ ok: true, ...rec }) : json({ ok: false, error: "not-found" }, 404);
    }
    if (method === "GET" && path === "/audit") {
      const list = await this.state.storage.list({ prefix: "a:" });
      return json({ ok: true, entries: [...list.values()] });
    }

    if (method !== "POST") return json({ ok: false, error: "method-not-allowed" }, 405);
    const parsed = await this.readBody(request);
    if (parsed.error) return json({ ok: false, error: parsed.error }, 400);
    const { body } = parsed;

    if (path === "/validate") {
      const result = validate(body.settings);
      return json({ ok: true, valid: result.ok, errors: result.errors, warnings: result.warnings });
    }

    if (path === "/publish") {
      if (!Number.isInteger(body.baseVersion)) return json({ ok: false, error: "baseVersion-required" }, 400);
      if (typeof body.reason !== "string" || body.reason.trim().length < 5) return json({ ok: false, error: "reason-required" }, 400);
      if (body.baseVersion !== current) {
        await this.audit("publish-conflict", actor, { baseVersion: body.baseVersion, current });
        return json({ ok: false, error: "version-conflict", currentVersion: current }, 409);
      }
      const result = validate(body.settings);
      if (!result.ok) {
        await this.audit("publish-rejected", actor, { errorCodes: result.errors.map((e) => e.code).slice(0, 20) });
        return json({ ok: false, error: "validation-failed", errors: result.errors, warnings: result.warnings }, 422);
      }
      const rec = await this.writeVersion(current + 1, body.settings, actor, body.reason.trim(), null);
      return json({ ok: true, version: rec.version, hash: rec.hash, warnings: result.warnings }, 201);
    }

    if (path === "/rollback") {
      if (!Number.isInteger(body.baseVersion) || !Number.isInteger(body.targetVersion)) return json({ ok: false, error: "versions-required" }, 400);
      if (typeof body.reason !== "string" || body.reason.trim().length < 5) return json({ ok: false, error: "reason-required" }, 400);
      if (body.baseVersion !== current) return json({ ok: false, error: "version-conflict", currentVersion: current }, 409);
      const target = await this.getVersion(body.targetVersion);
      if (!target) return json({ ok: false, error: "not-found" }, 404);
      if (!(await verifySnapshot(target, target.hash))) {
        await this.audit("rollback-integrity-failure", actor, { targetVersion: body.targetVersion });
        return json({ ok: false, error: "integrity-failure" }, 409);
      }
      // Rollback never rewrites history: it appends a NEW version carrying the old settings, re-validated against today's mandatory rules.
      const result = validate(target.settings);
      if (!result.ok) return json({ ok: false, error: "validation-failed", errors: result.errors }, 422);
      const rec = await this.writeVersion(current + 1, target.settings, actor, body.reason.trim(), body.targetVersion);
      return json({ ok: true, version: rec.version, hash: rec.hash, restoredFrom: body.targetVersion }, 201);
    }

    if (path === "/verify") {
      if (!Number.isInteger(body.version)) return json({ ok: false, error: "version-required" }, 400);
      const rec = await this.getVersion(body.version);
      if (!rec) return json({ ok: false, error: "not-found" }, 404);
      const supplied = typeof body.hash === "string" ? body.hash : rec.hash;
      const intact = await verifySnapshot({ version: rec.version, settings: rec.settings }, supplied);
      return json({ ok: true, version: rec.version, hash: rec.hash, intact });
    }

    return json({ ok: false, error: "not-found" }, 404);
  }
}

export { canonicalize };
