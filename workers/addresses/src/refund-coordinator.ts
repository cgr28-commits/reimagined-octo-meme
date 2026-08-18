/**
 * Per-booking refund coordinator (Cloudflare Durable Object).
 *
 * Uses Durable Object storage for strongly consistent operation-state.
 * `blockConcurrencyWhile` is used ONLY for short atomic reserve/update of
 * operation state — never held across SumUp, email, or calendar I/O
 * (Cloudflare applies a ~30s timeout and advises against external I/O inside it).
 */

import {
  processBookingRefundOrCancel,
  type ProcessRefundOptions,
  type RefundIssueResult,
} from "./refund-handlers";

export type RefundCoordinatorEnv = {
  SUMUP_API_KEY?: string;
  SUMUP_MERCHANT_CODE?: string;
  TRACKING_STORE?: KVNamespace;
  BOOKING_TO_EMAIL?: string;
  GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON?: string;
  GOOGLE_CALENDAR_ID?: string;
  OWNER_ACCESS_KEY?: string;
  DRIVER_ACCESS_KEY?: string;
  RESEND_API_KEY?: string;
  WEB3FORMS_ACCESS_KEY?: string;
  BOOKING_FROM_EMAIL?: string;
  EMAIL?: {
    send(message: {
      to: string;
      from: string | { email: string; name?: string };
      subject: string;
      text?: string;
      replyTo?: string | { email: string; name?: string };
    }): Promise<{ messageId?: string }>;
  };
};

type RefundCoordinatorRequest = ProcessRefundOptions & {
  paymentReference: string;
  /** Must already be verified by the Worker HTTP handler. */
  confirmOwnerKeyVerified: true;
};

type CoordinatorOpState =
  | "processing"
  | "processor_accepted"
  | "completed"
  | "failed"
  | "reconciliation_required";

type StoredRefundOp = {
  paymentReference: string;
  idempotencyKey: string;
  intendedAmount: number | null;
  cancelBooking: boolean;
  actionKind: string;
  state: CoordinatorOpState;
  reservedAt: string;
  updatedAt: string;
  auditId?: string;
  lastResult?: RefundIssueResult;
};

type ReservationOutcome =
  | { kind: "reserved"; op: StoredRefundOp }
  | { kind: "resume"; op: StoredRefundOp }
  | { kind: "already_done"; op: StoredRefundOp }
  | { kind: "busy"; op: StoredRefundOp };

const OP_KEY = "activeRefundOp";

/**
 * One Durable Object instance per payment reference (idFromName).
 * Only one SumUp refund attempt may be authorised at a time for that booking.
 */
export class RefundCoordinator implements DurableObject {
  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: RefundCoordinatorEnv,
  ) {}

  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
    }

    let body: RefundCoordinatorRequest;
    try {
      body = (await request.json()) as RefundCoordinatorRequest;
    } catch {
      return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const paymentReference = body?.paymentReference?.trim() ?? "";
    if (!paymentReference) {
      return Response.json({ ok: false, error: "Missing paymentReference" }, { status: 400 });
    }
    if (body.confirmOwnerKeyVerified !== true) {
      return Response.json(
        {
          ok: false,
          paymentReference,
          error: "Refund coordinator requires prior server-side owner confirmation.",
        },
        { status: 401 },
      );
    }
    if (!body.confirmOwnerKey?.trim()) {
      return Response.json(
        {
          ok: false,
          paymentReference,
          error: "Re-enter OWNER_ACCESS_KEY to confirm this refund or cancellation.",
        },
        { status: 401 },
      );
    }

    const idempotencyKey = String(body.idempotencyKey ?? "").trim();
    if (!idempotencyKey) {
      return Response.json(
        { ok: false, paymentReference, error: "Missing idempotency key." },
        { status: 400 },
      );
    }

    const intendedAmount =
      body.amount != null && Number.isFinite(Number(body.amount)) ? Number(body.amount) : null;

    // Short atomic reservation only — no external I/O inside this block.
    const reservation = await this.ctx.blockConcurrencyWhile(() =>
      this.reserveOperation({
        paymentReference,
        idempotencyKey,
        intendedAmount,
        cancelBooking: Boolean(body.cancelBooking),
        actionKind: String(body.actionKind ?? ""),
      }),
    );

    if (reservation.kind === "busy") {
      return Response.json(
        {
          ok: false,
          paymentReference,
          error:
            "Another refund operation is already in progress for this booking. Wait and retry — do not issue a duplicate SumUp refund.",
          auditId: reservation.op.auditId,
        },
        { status: 409 },
      );
    }

    if (reservation.kind === "already_done" && reservation.op.lastResult) {
      return Response.json(
        {
          ...reservation.op.lastResult,
          alreadyProcessed: true,
        },
        { status: 200 },
      );
    }

    // External work (SumUp / email / calendar / KV) runs OUTSIDE blockConcurrencyWhile.
    let result: RefundIssueResult;
    try {
      result = await processBookingRefundOrCancel(this.env, {
        ...body,
        paymentReference,
      });
    } catch (error) {
      await this.ctx.blockConcurrencyWhile(async () => {
        const current = (await this.ctx.storage.get<StoredRefundOp>(OP_KEY)) ?? reservation.op;
        if (current.idempotencyKey !== idempotencyKey) return;
        await this.ctx.storage.put(OP_KEY, {
          ...current,
          state: "reconciliation_required",
          updatedAt: new Date().toISOString(),
        });
      });
      return Response.json(
        {
          ok: false,
          paymentReference,
          error:
            error instanceof Error
              ? error.message
              : "Refund coordinator failed — reconciliation required before retry.",
        },
        { status: 502 },
      );
    }

    // Persist terminal / intermediate coordinator state (short block, no I/O).
    await this.ctx.blockConcurrencyWhile(async () => {
      const current = (await this.ctx.storage.get<StoredRefundOp>(OP_KEY)) ?? reservation.op;
      if (current.idempotencyKey !== idempotencyKey) return;

      let state: CoordinatorOpState = "failed";
      if (result.ok) {
        state = "completed";
      } else if (result.sumUpRefunded || result.auditId) {
        // Money may have moved or audit exists — require SumUp reconcile on next attempt.
        state = result.error?.includes("SumUp")
          ? "failed"
          : "reconciliation_required";
        if (result.sumUpRefunded) {
          state = "processor_accepted";
        }
      }

      // If process reported success with warnings only, completed is correct.
      if (result.ok) state = "completed";

      await this.ctx.storage.put(OP_KEY, {
        ...current,
        state: result.ok
          ? "completed"
          : result.sumUpRefunded
            ? "processor_accepted"
            : state === "failed"
              ? "failed"
              : "reconciliation_required",
        updatedAt: new Date().toISOString(),
        auditId: result.auditId ?? current.auditId,
        lastResult: result.ok ? result : current.lastResult,
      });
    });

    const status = result.ok
      ? 200
      : result.error?.includes("OWNER_ACCESS_KEY") || result.error?.includes("Re-enter")
        ? 401
        : 502;

    return Response.json(result, { status });
  }

  private async reserveOperation(input: {
    paymentReference: string;
    idempotencyKey: string;
    intendedAmount: number | null;
    cancelBooking: boolean;
    actionKind: string;
  }): Promise<ReservationOutcome> {
    const now = new Date().toISOString();
    const existing = await this.ctx.storage.get<StoredRefundOp>(OP_KEY);

    if (existing) {
      const sameKey = existing.idempotencyKey === input.idempotencyKey;
      const inFlight =
        existing.state === "processing" ||
        existing.state === "reconciliation_required" ||
        existing.state === "processor_accepted";

      if (sameKey && existing.state === "completed" && existing.lastResult) {
        return { kind: "already_done", op: existing };
      }

      if (sameKey && inFlight) {
        // Same idempotency key may resume / reconcile — never authorise a second SumUp attempt blindly.
        const resumed: StoredRefundOp = {
          ...existing,
          state: existing.state === "processor_accepted" ? "processor_accepted" : "reconciliation_required",
          updatedAt: now,
        };
        await this.ctx.storage.put(OP_KEY, resumed);
        return { kind: "resume", op: resumed };
      }

      if (!sameKey && inFlight) {
        return { kind: "busy", op: existing };
      }

      // Prior failed/completed different key — allow a new reservation.
    }

    const op: StoredRefundOp = {
      paymentReference: input.paymentReference,
      idempotencyKey: input.idempotencyKey,
      intendedAmount: input.intendedAmount,
      cancelBooking: input.cancelBooking,
      actionKind: input.actionKind,
      state: "processing",
      reservedAt: now,
      updatedAt: now,
    };
    await this.ctx.storage.put(OP_KEY, op);
    return { kind: "reserved", op };
  }
}
