/**
 * BespokeQuoteCoordinator — SQLite-backed Durable Object.
 *
 * Three kinds of instance, separated by the name used with idFromName():
 *   "quote:<reference>"   authoritative bespoke quote record (one per request)
 *   "dedupe:<sha256>"     24-hour duplicate-request claim
 *   "rate:<sha256>"       fixed-window rate limit counter
 *   "registry:open-quotes" open quotations and their expiry (for the expiry sweep)
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
const NOTIFICATIONS_KEY = "notifications";
const NOTIFICATIONS_LIMIT = 50;
const REGISTRY_KEY = "open-quotes";
const REGISTRY_LIMIT = 5000;

/**
 * Once-only notification log, kept beside the record (not inside it, so email
 * bookkeeping never bumps the record version an owner is editing against).
 *  - "sending": claimed; a send is in flight or the Worker died mid-send. Shown
 *    as "outcome unknown". Never retried automatically (the email may have gone).
 *  - "accepted": the provider ACCEPTED the message. This is NOT proof of delivery.
 *  - "failed" / "skipped": final for that key.
 * `delivery` is only set from signed provider delivery events (Resend webhooks).
 */
export type BespokeDeliveryEvent = "delivered" | "delayed" | "bounced" | "complained" | "failed";

export type BespokeNotificationEntry = {
  key: string;
  kind: string;
  /** "sent" is a legacy alias of "accepted" (Phase 2 development records). */
  status: "sending" | "accepted" | "sent" | "failed" | "skipped";
  claimedAt: string;
  finishedAt?: string;
  provider?: string;
  /** Provider message id (Resend) — lets delivery events find this entry. */
  providerMessageId?: string;
  error?: string;
  delivery?: BespokeDeliveryEvent;
  deliveryAt?: string;
};

/** A later "delayed" never hides a final outcome; final outcomes are kept. */
const DELIVERY_RANK: Record<BespokeDeliveryEvent, number> = {
  delayed: 1,
  delivered: 2,
  complained: 3,
  bounced: 3,
  failed: 3,
};

type RegistryEntry = { expiresAt: string; flaggedAt?: string };

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
    if (await this.ctx.storage.get(RECORD_KEY)) return;
    if (await this.ctx.storage.get(REGISTRY_KEY)) return;
    await this.ctx.storage.deleteAll();
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
        return json({
          record: (await this.ctx.storage.get<BespokeQuoteRecord>(RECORD_KEY)) ?? null,
          notifications: (await this.ctx.storage.get<BespokeNotificationEntry[]>(NOTIFICATIONS_KEY)) ?? [],
        });
      case "notify-begin":
        return this.notifyBegin(body);
      case "notify-finish":
        return this.notifyFinish(body);
      case "notify-delivery":
        return this.notifyDelivery(body);
      case "registry-set":
        return this.registrySet(body);
      case "registry-due":
        return this.registryDue(body);
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

  /** Claim a notification key. Only the first caller may send; everyone else is told it is taken. */
  private async notifyBegin(body: Record<string, unknown>): Promise<Response> {
    const key = typeof body.key === "string" && /^[A-Za-z0-9:_-]{2,120}$/.test(body.key) ? body.key : "";
    const kind = typeof body.kind === "string" ? body.kind.slice(0, 40) : "";
    if (!key || !kind) return json({ error: "Invalid notification" }, 400);
    return this.ctx.blockConcurrencyWhile(async () => {
      if (!(await this.ctx.storage.get(RECORD_KEY))) return json({ error: "Request not found" }, 404);
      const log = (await this.ctx.storage.get<BespokeNotificationEntry[]>(NOTIFICATIONS_KEY)) ?? [];
      const existing = log.find((e) => e.key === key);
      if (existing) return json({ claimed: false, entry: existing });
      const entry: BespokeNotificationEntry = { key, kind, status: "sending", claimedAt: this.now().toISOString() };
      await this.ctx.storage.put(NOTIFICATIONS_KEY, [...log, entry].slice(-NOTIFICATIONS_LIMIT));
      return json({ claimed: true, entry });
    });
  }

  private async notifyFinish(body: Record<string, unknown>): Promise<Response> {
    const key = typeof body.key === "string" ? body.key : "";
    const status = body.status === "sent" ? "accepted" : body.status;
    if (status !== "accepted" && status !== "failed" && status !== "skipped") return json({ error: "Invalid status" }, 400);
    return this.ctx.blockConcurrencyWhile(async () => {
      const log = (await this.ctx.storage.get<BespokeNotificationEntry[]>(NOTIFICATIONS_KEY)) ?? [];
      const entry = log.find((e) => e.key === key);
      if (!entry) return json({ error: "Unknown notification" }, 404);
      if (entry.status !== "sending") return json({ ok: true, entry });
      entry.status = status;
      entry.finishedAt = this.now().toISOString();
      if (typeof body.provider === "string") entry.provider = body.provider.slice(0, 40);
      if (typeof body.providerMessageId === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(body.providerMessageId)) {
        entry.providerMessageId = body.providerMessageId;
      }
      if (typeof body.error === "string") entry.error = body.error.slice(0, 300);
      await this.ctx.storage.put(NOTIFICATIONS_KEY, log);
      return json({ ok: true, entry });
    });
  }

  /** Record a signed provider delivery event for an accepted email (idempotent). */
  private async notifyDelivery(body: Record<string, unknown>): Promise<Response> {
    const key = typeof body.key === "string" ? body.key : "";
    const event = body.event as BespokeDeliveryEvent;
    const messageId = typeof body.providerMessageId === "string" ? body.providerMessageId : "";
    const at = typeof body.at === "string" && !Number.isNaN(Date.parse(body.at)) ? body.at : this.now().toISOString();
    if (!key || !(event in DELIVERY_RANK)) return json({ error: "Invalid delivery event" }, 400);
    return this.ctx.blockConcurrencyWhile(async () => {
      const log = (await this.ctx.storage.get<BespokeNotificationEntry[]>(NOTIFICATIONS_KEY)) ?? [];
      const entry = log.find((e) => e.key === key);
      if (!entry) return json({ error: "Unknown notification" }, 404);
      // The event must be for the exact message we sent under this key.
      if (!entry.providerMessageId || entry.providerMessageId !== messageId) {
        return json({ error: "Message id mismatch" }, 409);
      }
      if (entry.delivery && DELIVERY_RANK[entry.delivery] >= DELIVERY_RANK[event]) {
        return json({ ok: true, entry, unchanged: true });
      }
      entry.delivery = event;
      entry.deliveryAt = at;
      await this.ctx.storage.put(NOTIFICATIONS_KEY, log);
      return json({ ok: true, entry });
    });
  }

  /** Registry instance only: record (or clear, with expiresAt null) an open quotation. */
  private async registrySet(body: Record<string, unknown>): Promise<Response> {
    const reference = typeof body.reference === "string" ? body.reference : "";
    const expiresAt = typeof body.expiresAt === "string" ? body.expiresAt : null;
    if (!/^MATNI-BQ-/.test(reference) || (expiresAt !== null && Number.isNaN(Date.parse(expiresAt)))) {
      return json({ error: "Invalid registry entry" }, 400);
    }
    return this.ctx.blockConcurrencyWhile(async () => {
      if (await this.ctx.storage.get(RECORD_KEY)) return json({ error: "Wrong instance" }, 409);
      const map = (await this.ctx.storage.get<Record<string, RegistryEntry>>(REGISTRY_KEY)) ?? {};
      if (expiresAt === null) delete map[reference];
      else if (map[reference]?.expiresAt !== expiresAt) map[reference] = { expiresAt };
      if (Object.keys(map).length > REGISTRY_LIMIT) return json({ error: "Registry full" }, 507);
      await this.ctx.storage.put(REGISTRY_KEY, map);
      return json({ ok: true, size: Object.keys(map).length });
    });
  }

  /**
   * Registry instance only: references whose quotation expiry has passed.
   * `flag` marks references the sweep could not expire (customer at checkout) so
   * they are not retried every 5 minutes; they come back if their expiry changes.
   */
  private async registryDue(body: Record<string, unknown>): Promise<Response> {
    const limit = typeof body.limit === "number" ? Math.min(Math.max(body.limit, 1), 200) : 50;
    const flag = Array.isArray(body.flag) ? body.flag.filter((r): r is string => typeof r === "string") : [];
    return this.ctx.blockConcurrencyWhile(async () => {
      if (await this.ctx.storage.get(RECORD_KEY)) return json({ error: "Wrong instance" }, 409);
      const map = (await this.ctx.storage.get<Record<string, RegistryEntry>>(REGISTRY_KEY)) ?? {};
      const nowIso = this.now().toISOString();
      for (const ref of flag) if (map[ref]) map[ref].flaggedAt = nowIso;
      if (flag.length > 0) await this.ctx.storage.put(REGISTRY_KEY, map);
      const nowMs = this.now().getTime();
      const due = Object.entries(map)
        .filter(([, e]) => !e.flaggedAt && Date.parse(e.expiresAt) <= nowMs)
        .sort((a, b) => Date.parse(a[1].expiresAt) - Date.parse(b[1].expiresAt))
        .slice(0, limit)
        .map(([reference]) => reference);
      const flagged = Object.entries(map).filter(([, e]) => e.flaggedAt).map(([reference]) => reference);
      return json({ due, flagged });
    });
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
