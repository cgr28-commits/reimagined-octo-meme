/**
 * Per-booking refund coordinator (Cloudflare Durable Object).
 *
 * Serializes money-movement for a single payment reference using
 * Durable Object strong consistency + blockConcurrencyWhile.
 * Workers KV is never used as a refund lock.
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

/**
 * One Durable Object instance per payment reference (idFromName).
 * Only one refund critical section runs at a time for that booking.
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

    if (!body?.paymentReference?.trim()) {
      return Response.json({ ok: false, error: "Missing paymentReference" }, { status: 400 });
    }
    if (body.confirmOwnerKeyVerified !== true) {
      return Response.json(
        {
          ok: false,
          paymentReference: body.paymentReference,
          error: "Refund coordinator requires prior server-side owner confirmation.",
        },
        { status: 401 },
      );
    }
    if (!body.confirmOwnerKey?.trim()) {
      return Response.json(
        {
          ok: false,
          paymentReference: body.paymentReference,
          error: "Re-enter OWNER_ACCESS_KEY to confirm this refund or cancellation.",
        },
        { status: 401 },
      );
    }

    // Strongly consistent serialization for this payment reference.
  // Serialization for this payment reference — no KV refund lock in handlers.
    const result: RefundIssueResult = await this.ctx.blockConcurrencyWhile(async () =>
      processBookingRefundOrCancel(this.env, {
        ...body,
        paymentReference: body.paymentReference.trim(),
      }),
    );

    const status = result.ok
      ? 200
      : result.error?.includes("OWNER_ACCESS_KEY") || result.error?.includes("Re-enter")
        ? 401
        : 502;

    return Response.json(result, { status });
  }
}
