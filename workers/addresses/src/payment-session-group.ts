/**
 * One customer booking = one payment group, however many times the customer presses Pay.
 *
 * Before a new payment link is created, every earlier link in the group is checked with the
 * provider, and the group is locked (strongly consistent Durable Object) so two simultaneous
 * requests can never both create links:
 *
 *   earlier link paid (or a card hold)        -> no new link ("already paid"); never cancelled
 *   earlier link with money moving            -> no new link ("payment in progress")
 *   earlier link open, same details, not near
 *     expiry                                   -> reuse it (double clicks, refresh, other tabs)
 *   earlier link open, anything else           -> expire it at Stripe, then create the new link
 *   earlier link already expired / cancelled   -> ignored
 *
 * If anything cannot be confirmed (provider or lock store unavailable) no new link is created
 * (fail closed). The finalisation guard (claimGroupFinalization) is the last line of defence:
 * only one payment per group can ever become a booking.
 */

export type GroupSessionState = "open" | "expired" | "paid";

export type GroupSession = {
  checkoutId: string;
  /** Hash of everything that affects the price/booking for this link. */
  digest: string;
  createdAt: string;
  state: GroupSessionState;
  /** The original successful create response, returned again when the link is reused. */
  response?: Record<string, unknown>;
};

export type ProviderSessionView = {
  status: "open" | "complete" | "expired" | null | string;
  paid: boolean;
  /** Unix seconds. */
  expiresAt?: number | null;
  paymentIntentStatus?: string | null;
};

export type PaymentGroupDeps = {
  namespace: DurableObjectNamespace;
  /** Only Stripe Checkout Sessions can be checked and expired here. */
  isManagedSession: (checkoutId: string) => boolean;
  retrieve: (checkoutId: string) => Promise<ProviderSessionView>;
  expire: (checkoutId: string) => Promise<void>;
  now?: () => number;
};

export type GroupedCreateResult = { status: number; body: Record<string, unknown>; reused?: boolean };

export const PAYMENT_IN_PROGRESS_MESSAGE =
  "We're already preparing or processing a payment for this booking. Please wait a moment before trying again, and don't start another payment.";
export const PAYMENT_GROUP_BUSY_MESSAGE =
  "Your secure payment is being prepared in another window or by an earlier click. Please wait a few seconds, then press Pay again.";
export const PAYMENT_ALREADY_PAID_MESSAGE =
  "This booking has already been paid. Please check your email for your confirmation. To change a paid booking, please contact us rather than paying again.";
export const PAYMENT_STATUS_UNCONFIRMED_MESSAGE =
  "We couldn't confirm the status of your earlier payment link, so we haven't created a new one. Please try again in a minute, or contact us before paying.";

/** Money is moving (or held) on this payment: never expire, never replace. */
const MONEY_MOVING = new Set(["processing", "requires_capture", "succeeded"]);
/** Reuse an open link only when it has comfortably longer than this left. */
const REUSE_MIN_REMAINING_MS = 15 * 60 * 1000;
/** A lock older than this is treated as abandoned (a crashed request). */
export const GROUP_LOCK_LEASE_MS = 120 * 1000;

type GroupBeginResponse = {
  state: "acquired" | "busy";
  sessions?: GroupSession[];
  /** Set once a payment in this group has become a booking. */
  finalizedCheckoutId?: string;
};

function stub(namespace: DurableObjectNamespace, groupKey: string) {
  return namespace.get(namespace.idFromName(groupKey));
}

async function call<T>(namespace: DurableObjectNamespace, groupKey: string, action: string, body: unknown): Promise<T> {
  const response = await stub(namespace, groupKey).fetch(`https://payment-group/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Payment group ${action} failed (${response.status})`);
  return (await response.json()) as T;
}

export async function paymentGroupHash(value: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Browser-generated id for one booking (kept across Back, refresh and tabs). */
export function isValidPaymentGroupId(value: unknown): value is string {
  return typeof value === "string" && /^pg_[a-z0-9]{16,64}$/.test(value);
}

/**
 * Stable group key: the browser's booking id when present, otherwise the customer's email and
 * trip date (so edits to time, address, vehicle or extras stay in the same group).
 */
export async function resolvePaymentGroupKey(input: {
  paymentGroupId?: unknown;
  customerEmail?: unknown;
  tripDate?: unknown;
}): Promise<string | null> {
  if (isValidPaymentGroupId(input.paymentGroupId)) {
    return `payment-group:id:${await paymentGroupHash(input.paymentGroupId)}`;
  }
  const email = String(input.customerEmail ?? "").trim().toLowerCase();
  const date = String(input.tripDate ?? "").trim();
  if (!email || !date) return null;
  return `payment-group:fallback:${await paymentGroupHash([email, date])}`;
}

function json(status: number, body: Record<string, unknown>): GroupedCreateResult {
  return { status, body };
}

/**
 * Create a payment link for this booking, replacing (never duplicating) earlier unpaid links.
 * `create` performs the existing, unchanged checkout creation.
 */
export async function createOrReplaceGroupedCheckout(input: {
  deps: PaymentGroupDeps;
  groupKey: string;
  digest: string;
  create: () => Promise<GroupedCreateResult>;
}): Promise<GroupedCreateResult> {
  const { deps, groupKey, digest } = input;
  const now = deps.now ?? (() => Date.now());
  const token = crypto.randomUUID();

  const begin = await call<GroupBeginResponse>(deps.namespace, groupKey, "group-begin", {
    token,
    now: now(),
    leaseMs: GROUP_LOCK_LEASE_MS,
  });
  if (begin.state !== "acquired") {
    // Another tab/click is creating this booking's link right now: safe to retry shortly.
    return json(409, { error: PAYMENT_GROUP_BUSY_MESSAGE, code: "payment_group_busy" });
  }

  const sessions: GroupSession[] = (begin.sessions ?? []).map((s) => ({ ...s }));
  let finished = false;
  const finish = async () => {
    if (finished) return;
    finished = true;
    await call(deps.namespace, groupKey, "group-finish", { token, sessions, now: now() });
  };

  try {
    // A payment in this group has already become (or is becoming) a booking.
    const paidCheckoutId =
      begin.finalizedCheckoutId || sessions.find((s) => s.state === "paid")?.checkoutId || "";
    if (paidCheckoutId) {
      await finish();
      return json(409, { error: PAYMENT_ALREADY_PAID_MESSAGE, code: "already_paid", checkoutId: paidCheckoutId });
    }

    let reusable: GroupSession | null = null;

    for (const session of sessions) {
      if (session.state !== "open") continue;
      if (!deps.isManagedSession(session.checkoutId)) continue; // e.g. SumUp: unchanged behaviour

      let view: ProviderSessionView;
      try {
        view = await deps.retrieve(session.checkoutId);
      } catch {
        await finish();
        return json(503, { error: PAYMENT_STATUS_UNCONFIRMED_MESSAGE, code: "payment_status_unknown" });
      }

      if (view.paid || view.status === "complete") {
        session.state = "paid";
        await finish();
        return json(409, {
          error: PAYMENT_ALREADY_PAID_MESSAGE,
          code: "already_paid",
          checkoutId: session.checkoutId,
        });
      }
      if (view.status === "expired") {
        session.state = "expired";
        continue;
      }
      if (view.paymentIntentStatus && MONEY_MOVING.has(view.paymentIntentStatus)) {
        await finish();
        return json(409, { error: PAYMENT_IN_PROGRESS_MESSAGE, code: "payment_in_progress" });
      }

      const remainingMs = view.expiresAt ? view.expiresAt * 1000 - now() : 0;
      if (!reusable && session.digest === digest && session.response && remainingMs > REUSE_MIN_REMAINING_MS) {
        reusable = session;
        continue;
      }

      // Superseded (details changed) or close to expiry: close it so it can never be paid.
      try {
        await deps.expire(session.checkoutId);
        session.state = "expired";
      } catch {
        // Expiry refused: find out why before doing anything else.
        let after: ProviderSessionView | null = null;
        try {
          after = await deps.retrieve(session.checkoutId);
        } catch {
          after = null;
        }
        if (after && (after.paid || after.status === "complete")) {
          session.state = "paid";
          await finish();
          return json(409, { error: PAYMENT_ALREADY_PAID_MESSAGE, code: "already_paid", checkoutId: session.checkoutId });
        }
        if (after && after.status === "expired") {
          session.state = "expired";
          continue;
        }
        await finish();
        return json(503, { error: PAYMENT_STATUS_UNCONFIRMED_MESSAGE, code: "payment_status_unknown" });
      }
    }

    // Any other open link with different details has been expired above, so reuse is safe.
    if (reusable?.response) {
      await finish();
      return { status: 200, body: reusable.response, reused: true };
    }

    const result = await input.create();
    const checkoutId = typeof result.body.checkoutId === "string" ? result.body.checkoutId : "";
    if (result.status === 200 && checkoutId) {
      sessions.push({
        checkoutId,
        digest,
        createdAt: new Date(now()).toISOString(),
        state: "open",
        response: result.body,
      });
    }
    await finish();
    return result;
  } catch (error) {
    // Release the lock; a retry is safe because Stripe de-duplicates identical create requests
    // and the finalisation guard stops a second booking in any case.
    try {
      await finish();
    } catch {
      // The lease expires on its own.
    }
    throw error;
  }
}

export type GroupFinalizeClaim =
  | { state: "claimed" }
  | { state: "duplicate"; firstCheckoutId: string; firstClaimedAt?: string };

/**
 * Atomically record which payment became this group's booking. A second, different payment in
 * the same group is reported as a duplicate and must not create another booking.
 */
export async function claimGroupFinalization(input: {
  namespace: DurableObjectNamespace;
  groupKey: string;
  checkoutId: string;
  now?: number;
}): Promise<GroupFinalizeClaim> {
  return call<GroupFinalizeClaim>(input.namespace, input.groupKey, "group-finalize-claim", {
    checkoutId: input.checkoutId,
    now: input.now ?? Date.now(),
  });
}
