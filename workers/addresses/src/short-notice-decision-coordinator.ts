/**
 * Per-request decision lock + deadline timer for owner-approval bookings
 * (Cloudflare Durable Object, one instance per short-notice reference).
 *
 * - Atomic decision: approve / decline / expire. The first claim wins; any
 *   other action is refused. A Durable Object processes one request at a time
 *   and its storage is strongly consistent, so — unlike the KV lock it
 *   replaces — two decisions can never both succeed.
 * - Approve / decline claims carry the approval deadline. At or after the
 *   deadline they are refused and the decision becomes "expire", so an
 *   approval can never land after expiry, even by a millisecond.
 * - Deadline timer: `schedule` sets a Durable Object alarm at the deadline.
 *   Alarms are durable (they survive restarts and deploys and are retried by
 *   Cloudflare on failure). When it fires, the request is expired, the card
 *   hold is released and the customer is emailed. The 5-minute cron stays as
 *   a backstop.
 */
import { configureStripe } from "../shared/stripe-payments";
import { SHORT_NOTICE_RESPONSE_EXPIRED_ADMIN_MESSAGE } from "../shared/short-notice-booking";
import type { ShortNoticeDecisionAction, ShortNoticeDecisionClaim } from "./short-notice-store";

type StoredDecision = { action: ShortNoticeDecisionAction; at: string };

type ClaimBody = { op: "claim"; action: ShortNoticeDecisionAction; deadlineAt?: string };
type ReleaseBody = { op: "release"; action: ShortNoticeDecisionAction };
type ScheduleBody = { op: "schedule"; reference: string; deadlineAt: string };
type CoordinatorBody = ClaimBody | ReleaseBody | ScheduleBody;

/** Runs the expiry for one reference when the alarm fires. Set by index.ts. */
export type DeadlineRunner = (env: unknown, reference: string) => Promise<void>;
let deadlineRunner: DeadlineRunner | null = null;
export function setShortNoticeDeadlineRunner(runner: DeadlineRunner): void {
  deadlineRunner = runner;
}

function conflictMessage(action: ShortNoticeDecisionAction): string {
  if (action === "expire") return SHORT_NOTICE_RESPONSE_EXPIRED_ADMIN_MESSAGE;
  if (action === "approve") return "This request has already been approved.";
  return "This request has already been declined.";
}

/** Pure decision rule (unit-tested in scripts/check-booking-decision-lock.ts). */
export function decideClaim(
  existing: StoredDecision | null,
  action: ShortNoticeDecisionAction,
  deadlineAt: string | undefined,
  now: Date,
): { claim: ShortNoticeDecisionClaim; store?: StoredDecision } {
  if (existing) {
    if (existing.action === action) {
      return { claim: { ok: true, alreadyClaimed: true, existingAction: action } };
    }
    return {
      claim: { ok: false, error: conflictMessage(existing.action), existingAction: existing.action },
    };
  }
  const deadlineMs = deadlineAt ? new Date(deadlineAt).getTime() : NaN;
  if (action !== "expire" && Number.isFinite(deadlineMs) && now.getTime() >= deadlineMs) {
    const expired: StoredDecision = { action: "expire", at: now.toISOString() };
    return {
      claim: { ok: false, error: SHORT_NOTICE_RESPONSE_EXPIRED_ADMIN_MESSAGE, existingAction: "expire" },
      store: expired,
    };
  }
  if (action === "expire" && Number.isFinite(deadlineMs) && now.getTime() < deadlineMs) {
    return { claim: { ok: false, error: "This request has not reached its deadline yet." } };
  }
  const stored: StoredDecision = { action, at: now.toISOString() };
  return { claim: { ok: true, alreadyClaimed: false }, store: stored };
}

export class ShortNoticeDecisionCoordinator {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Record<string, unknown>,
  ) {}

  async fetch(request: Request): Promise<Response> {
    let body: CoordinatorBody;
    try {
      body = (await request.json()) as CoordinatorBody;
    } catch {
      return Response.json({ ok: false, error: "Invalid request" }, { status: 400 });
    }
    const storage = this.state.storage;

    if (body.op === "claim") {
      // No awaits on external I/O between get and put: the object's input
      // gate keeps this read-modify-write atomic.
      const existing = (await storage.get<StoredDecision>("decision")) ?? null;
      const result = decideClaim(existing, body.action, body.deadlineAt, new Date());
      if (result.store) {
        await storage.put("decision", result.store);
        await storage.put(
          "audit",
          [...((await storage.get<StoredDecision[]>("audit")) ?? []), result.store],
        );
      }
      return Response.json(result.claim);
    }

    if (body.op === "release") {
      // Only used when an approval could not be charged and must be retried.
      const existing = await storage.get<StoredDecision>("decision");
      if (existing && existing.action === body.action && body.action !== "expire") {
        await storage.delete("decision");
        return Response.json({ ok: true, released: true });
      }
      return Response.json({ ok: true, released: false });
    }

    if (body.op === "schedule") {
      const at = new Date(body.deadlineAt).getTime();
      if (!Number.isFinite(at)) return Response.json({ ok: false, error: "Bad deadline" }, { status: 400 });
      await storage.put("reference", body.reference);
      await storage.put("deadlineAt", body.deadlineAt);
      // A second schedule (e.g. window restarted when the card was held) replaces the first.
      await storage.setAlarm(Math.max(at, Date.now()));
      return Response.json({ ok: true });
    }

    return Response.json({ ok: false, error: "Unknown op" }, { status: 400 });
  }

  async alarm(): Promise<void> {
    const reference = await this.state.storage.get<string>("reference");
    if (!reference || !deadlineRunner) return;
    configureStripe(this.env as never);
    // Throwing makes Cloudflare retry the alarm with backoff.
    await deadlineRunner(this.env, reference);
  }
}
