/**
 * BespokeQuoteCoordinator — SQLite-backed Durable Object.
 *
 * Three kinds of instance, separated by the name used with idFromName():
 *   "quote:<reference>"   authoritative bespoke quote record (one per request)
 *   "dedupe:<sha256>"     24-hour duplicate-request claim
 *   "rate:<sha256>"       fixed-window rate limit counter
 *
 * A Durable Object handles one request at a time, and every read-modify-write
 * below runs inside blockConcurrencyWhile, so status changes are atomic: an
 * owner cancel, a customer checkout and a payment callback can never interleave.
 * No external I/O (email, payment provider, KV) ever runs inside the lock.
 *
 * Requires wrangler migration "v5-bespoke-quote-coordinator" (new_sqlite_classes).
 */

import {
  applyBespokeQuoteAction,
  type BespokeQuoteAction,
  type BespokeQuoteRecord,
} from "../shared/bespoke-quote";

const RECORD_KEY = "record";
const IDEMPOTENCY_KEY = "idempotency";
const IDEMPOTENCY_LIMIT = 50;

type IdempotencyEntry = { key: string; version: number; outcome?: string };

export type CoordinatorApplyResponse =
  | { ok: true; record: BespokeQuoteRecord; changed: boolean; outcome?: string; replayed?: boolean }
  | { ok: false; code: string; error: string; status: number; currentVersion?: number };

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

export class BespokeQuoteCoordinator implements DurableObject {
  constructor(protected readonly ctx: DurableObjectState, _env?: unknown) {}

  /** Overridable clock (tests). */
  protected now(): Date {
    return new Date();
  }

  async alarm(): Promise<void> {
    // Only dedupe/rate instances set alarms. Quote records are never auto-deleted.
    if (!(await this.ctx.storage.get(RECORD_KEY))) await this.ctx.storage.deleteAll();
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const action = new URL(request.url).pathname.replace(/^\//, "");
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
    switch (action) {
      case "create":
        return this.create(body);
      case "get":
        return json({ record: (await this.ctx.storage.get<BespokeQuoteRecord>(RECORD_KEY)) ?? null });
      case "apply":
        return this.apply(body);
      case "claim":
        return this.claim(body);
      case "rate":
        return this.rate(body);
      default:
        return json({ error: "Unknown action" }, 404);
    }
  }

  /** Idempotent create: a second create returns the existing record unchanged. */
  private async create(body: Record<string, unknown>): Promise<Response> {
    const record = body.record as BespokeQuoteRecord | undefined;
    if (!record || typeof record.reference !== "string" || record.status !== "NEW") {
      return json({ error: "Invalid record" }, 400);
    }
    return this.ctx.blockConcurrencyWhile(async () => {
      const existing = await this.ctx.storage.get<BespokeQuoteRecord>(RECORD_KEY);
      if (existing) return json({ created: false, record: existing });
      await this.ctx.storage.put(RECORD_KEY, record);
      return json({ created: true, record });
    });
  }

  private async apply(body: Record<string, unknown>): Promise<Response> {
    const action = body.action as BespokeQuoteAction | undefined;
    if (!action || typeof action !== "object" || typeof action.type !== "string") {
      return json({ ok: false, code: "invalid_input", error: "Action is required.", status: 400 }, 400);
    }
    const expectedVersion = typeof body.expectedVersion === "number" ? body.expectedVersion : undefined;
    const idempotencyKey =
      typeof body.idempotencyKey === "string" && /^[A-Za-z0-9_-]{8,100}$/.test(body.idempotencyKey)
        ? body.idempotencyKey
        : undefined;

    const result = await this.ctx.blockConcurrencyWhile(async (): Promise<CoordinatorApplyResponse> => {
      const record = await this.ctx.storage.get<BespokeQuoteRecord>(RECORD_KEY);
      if (!record) return { ok: false, code: "not_found", error: "Request not found.", status: 404 };

      const seen = (await this.ctx.storage.get<IdempotencyEntry[]>(IDEMPOTENCY_KEY)) ?? [];
      if (idempotencyKey) {
        const replay = seen.find((e) => e.key === idempotencyKey);
        if (replay) {
          return { ok: true, record, changed: false, outcome: replay.outcome, replayed: true };
        }
      }
      if (expectedVersion !== undefined && expectedVersion !== record.version) {
        return {
          ok: false,
          code: "version_conflict",
          error: "This request was changed elsewhere. Refresh and try again.",
          status: 409,
          currentVersion: record.version,
        };
      }

      const outcome = applyBespokeQuoteAction(record, action, this.now());
      if (!outcome.ok) return outcome;
      if (outcome.changed) await this.ctx.storage.put(RECORD_KEY, outcome.record);
      if (idempotencyKey) {
        const next = [...seen, { key: idempotencyKey, version: outcome.record.version, outcome: outcome.outcome }];
        await this.ctx.storage.put(IDEMPOTENCY_KEY, next.slice(-IDEMPOTENCY_LIMIT));
      }
      return outcome;
    });
    return json(result, result.ok ? 200 : result.status);
  }

  /** First caller wins; later callers get the stored value. Expires after ttlSeconds. */
  private async claim(body: Record<string, unknown>): Promise<Response> {
    const value = typeof body.value === "string" ? body.value : "";
    const ttlSeconds = typeof body.ttlSeconds === "number" ? body.ttlSeconds : 0;
    if (!value || ttlSeconds < 60 || ttlSeconds > 7 * 86400) return json({ error: "Invalid claim" }, 400);
    return this.ctx.blockConcurrencyWhile(async () => {
      if (await this.ctx.storage.get(RECORD_KEY)) return json({ error: "Wrong instance" }, 409);
      const now = this.now().getTime();
      const existing = await this.ctx.storage.get<{ value: string; until: number }>("claim");
      if (existing && existing.until > now) return json({ claimed: false, value: existing.value });
      await this.ctx.storage.put("claim", { value, until: now + ttlSeconds * 1000 });
      await this.ctx.storage.setAlarm(now + ttlSeconds * 1000);
      return json({ claimed: true, value });
    });
  }

  private async rate(body: Record<string, unknown>): Promise<Response> {
    const limit = typeof body.limit === "number" ? body.limit : 0;
    const windowSeconds = typeof body.windowSeconds === "number" ? body.windowSeconds : 0;
    if (limit < 1 || windowSeconds < 1 || windowSeconds > 7 * 86400) return json({ error: "Invalid limit" }, 400);
    return this.ctx.blockConcurrencyWhile(async () => {
      if (await this.ctx.storage.get(RECORD_KEY)) return json({ error: "Wrong instance" }, 409);
      const now = this.now().getTime();
      const current = await this.ctx.storage.get<{ count: number; until: number }>("rate");
      const window = current && current.until > now ? current : { count: 0, until: now + windowSeconds * 1000 };
      if (window.count >= limit) return json({ allowed: false, retryAfterSeconds: Math.ceil((window.until - now) / 1000) });
      window.count += 1;
      await this.ctx.storage.put("rate", window);
      await this.ctx.storage.setAlarm(window.until);
      return json({ allowed: true });
    });
  }
}
