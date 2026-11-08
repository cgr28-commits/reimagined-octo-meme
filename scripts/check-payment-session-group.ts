/**
 * Duplicate-payment protection (workers/addresses/src/payment-session-group.ts).
 * Real Durable Object code with isolated in-memory storage + a simulated Stripe. No network,
 * no Stripe keys, no real sessions, charges or bookings.
 */
import assert from "node:assert/strict";
import { isolatedPaymentCoordinator } from "./fixtures/payment-coordinator";
import {
  claimGroupFinalization,
  createOrReplaceGroupedCheckout,
  GROUP_LOCK_LEASE_MS,
  resolvePaymentGroupKey,
  type PaymentGroupDeps,
  type ProviderSessionView,
} from "../workers/addresses/src/payment-session-group";
import { __duplicateGroupPaymentForTests as duplicateGroupPayment } from "../workers/addresses/src/finalize-paid-checkout";

type FakeSession = { id: string; status: "open" | "complete" | "expired"; paid: boolean; expiresAt: number; pi: string | null };

/** Minimal Stripe model: open sessions can be paid or expired; expire refuses once money moves. */
function fakeStripe(clock: { now: number }) {
  const sessions = new Map<string, FakeSession>();
  let seq = 0;
  const calls = { retrieve: 0, expire: 0, create: 0 };
  return {
    sessions,
    calls,
    create(): string {
      calls.create++;
      const id = `cs_test_sim${++seq}`;
      sessions.set(id, { id, status: "open", paid: false, expiresAt: Math.floor(clock.now / 1000) + 23 * 3600, pi: null });
      return id;
    },
    async retrieve(id: string): Promise<ProviderSessionView> {
      calls.retrieve++;
      const s = sessions.get(id);
      if (!s) throw new Error("No such checkout session");
      const status = s.status === "open" && clock.now / 1000 > s.expiresAt ? "expired" : s.status;
      return { status, paid: s.paid, expiresAt: s.expiresAt, paymentIntentStatus: s.pi };
    },
    async expire(id: string): Promise<void> {
      calls.expire++;
      const s = sessions.get(id);
      if (!s || s.status !== "open" || (s.pi && ["processing", "requires_capture", "succeeded"].includes(s.pi))) {
        throw new Error("Checkout Session is not in an expireable state");
      }
      s.status = "expired";
    },
    /** Customer completes payment on a link (as Stripe would allow only while open). */
    pay(id: string): boolean {
      const s = sessions.get(id);
      if (!s || s.status !== "open" || clock.now / 1000 > s.expiresAt) return false;
      s.status = "complete";
      s.paid = true;
      s.pi = "succeeded";
      return true;
    },
  };
}

function setup() {
  const clock = { now: Date.UTC(2026, 10, 8, 12) };
  const stripe = fakeStripe(clock);
  const namespace = isolatedPaymentCoordinator();
  const deps: PaymentGroupDeps = {
    namespace,
    isManagedSession: (id) => id.startsWith("cs_"),
    retrieve: (id) => stripe.retrieve(id),
    expire: (id) => stripe.expire(id),
    now: () => clock.now,
  };
  const pay = (groupKey: string, digest: string, opts: { slow?: number } = {}) =>
    createOrReplaceGroupedCheckout({
      deps,
      groupKey,
      digest,
      create: async () => {
        if (opts.slow) await new Promise((r) => setTimeout(r, opts.slow));
        const checkoutId = stripe.create();
        return { status: 200, body: { ok: true, checkoutId, paymentUrl: `/pay/card/?checkout=${checkoutId}` } };
      },
    });
  return { clock, stripe, namespace, deps, pay };
}

const pass = (message: string) => console.log(`PASS ${message}`);

async function main() {
  // Group keys
  {
    const a = await resolvePaymentGroupKey({ paymentGroupId: "pg_0123456789abcdef0123" });
    const b = await resolvePaymentGroupKey({ paymentGroupId: "pg_0123456789abcdef0123", customerEmail: "x@y.z", tripDate: "2026-11-20" });
    assert.equal(a, b, "browser booking id wins over the email fallback");
    const f1 = await resolvePaymentGroupKey({ paymentGroupId: "not-valid", customerEmail: " A@B.com ", tripDate: "2026-11-20" });
    const f2 = await resolvePaymentGroupKey({ customerEmail: "a@b.com", tripDate: "2026-11-20" });
    assert.equal(f1, f2, "invalid ids fall back to email + trip date (case-insensitive)");
    assert.equal(await resolvePaymentGroupKey({ customerEmail: "", tripDate: "" }), null);
    pass("group key: browser booking id, else email + trip date");
  }

  // 1. Repeated Pay clicks / refresh / Back with the same details reuse the same open link.
  {
    const { stripe, pay } = setup();
    const first = await pay("g1", "details-A");
    const again = await pay("g1", "details-A");
    assert.equal(first.status, 200);
    assert.equal(again.status, 200);
    assert.equal(again.body.checkoutId, first.body.checkoutId);
    assert.equal(again.reused, true);
    assert.equal(stripe.calls.create, 1);
    pass("repeat Pay / refresh / Back with unchanged details reuse the same link (1 Stripe session)");
  }

  // 2. Simultaneous requests (two tabs / double tap) — same details.
  {
    const { stripe, pay } = setup();
    const results = await Promise.all([pay("g2", "details-A", { slow: 30 }), pay("g2", "details-A", { slow: 30 }), pay("g2", "details-A", { slow: 30 })]);
    const created = results.filter((r) => r.status === 200);
    const busy = results.filter((r) => r.body.code === "payment_group_busy");
    assert.equal(stripe.calls.create, 1, "exactly one session created for simultaneous requests");
    assert.equal(created.length, 1);
    assert.equal(busy.length, 2);
    const after = await pay("g2", "details-A");
    assert.equal(after.body.checkoutId, created[0].body.checkoutId, "the waiting tab then gets the same link");
    pass("SIMULTANEOUS requests (3 at once, same details): one session, others told to wait, then reuse it");
  }

  // 3. Simultaneous requests with DIFFERENT details (two tabs edited differently).
  {
    const { stripe, pay } = setup();
    const results = await Promise.all([pay("g3", "details-A", { slow: 30 }), pay("g3", "details-B", { slow: 30 })]);
    assert.equal(stripe.calls.create, 1);
    assert.equal(results.filter((r) => r.status === 200).length, 1);
    pass("SIMULTANEOUS requests with different details: still only one live session");
  }

  // 4. Changed details replace the old link; the old link can no longer be paid.
  {
    const { stripe, pay } = setup();
    const a = await pay("g4", "details-A");
    const b = await pay("g4", "details-B");
    assert.equal(b.status, 200);
    assert.notEqual(b.body.checkoutId, a.body.checkoutId);
    assert.equal(stripe.sessions.get(String(a.body.checkoutId))!.status, "expired");
    assert.equal(stripe.pay(String(a.body.checkoutId)), false, "old link cannot be paid");
    assert.equal(stripe.pay(String(b.body.checkoutId)), true, "new link can be paid");
    pass("changed details: old link expired at Stripe (unpayable), new link created");
  }

  // 5. Old link already paid: never cancelled, no new link.
  {
    const { stripe, pay } = setup();
    const a = await pay("g5", "details-A");
    stripe.pay(String(a.body.checkoutId));
    const b = await pay("g5", "details-B");
    assert.equal(b.status, 409);
    assert.equal(b.body.code, "already_paid");
    assert.equal(stripe.calls.expire, 0, "a paid session is never expired");
    assert.equal(stripe.calls.create, 1);
    const c = await pay("g5", "details-A");
    assert.equal(c.body.code, "already_paid", "stays blocked (Back after paying, other tab)");
    pass("already paid: no expiry, no new link, customer told it's paid");
  }

  // 6. Money moving (processing / card hold) on the old link: leave it alone.
  for (const pi of ["processing", "requires_capture"]) {
    const { stripe, pay } = setup();
    const a = await pay(`g6-${pi}`, "details-A");
    stripe.sessions.get(String(a.body.checkoutId))!.pi = pi;
    const b = await pay(`g6-${pi}`, "details-B");
    assert.equal(b.status, 409);
    assert.equal(b.body.code, "payment_in_progress");
    assert.equal(stripe.calls.expire, 0);
    assert.equal(stripe.calls.create, 1);
    pass(`payment ${pi}: not expired, no new link`);
  }

  // 7. Abandoned 3-D Secure (requires_action) on the old link can be replaced (no money taken).
  {
    const { stripe, pay } = setup();
    const a = await pay("g7", "details-A");
    stripe.sessions.get(String(a.body.checkoutId))!.pi = "requires_action";
    const b = await pay("g7", "details-B");
    assert.equal(b.status, 200);
    assert.equal(stripe.sessions.get(String(a.body.checkoutId))!.status, "expired");
    pass("abandoned 3-D Secure on old link: replaced safely");
  }

  // 8. Race: old link paid at the moment we try to expire it.
  {
    const { stripe, pay, deps } = setup();
    const a = await pay("g8", "details-A");
    const realExpire = deps.expire;
    deps.expire = async (id) => {
      stripe.pay(id); // customer completes payment in another tab at this instant
      return realExpire(id);
    };
    const b = await pay("g8", "details-B");
    assert.equal(b.body.code, "already_paid");
    assert.equal(stripe.calls.create, 1);
    pass("race (paid during expiry): treated as paid, no new link");
  }

  // 9. Stripe unreachable: fail closed (no new link).
  {
    const { stripe, pay, deps } = setup();
    await pay("g9", "details-A");
    deps.retrieve = async () => {
      throw new Error("network");
    };
    const b = await pay("g9", "details-B");
    assert.equal(b.status, 503);
    assert.equal(b.body.code, "payment_status_unknown");
    assert.equal(stripe.calls.create, 1);
    pass("Stripe unreachable: no new link (fail closed)");
  }

  // 10. Expire refused for an unknown reason and status can't be confirmed: fail closed.
  {
    const { stripe, pay, deps } = setup();
    await pay("g10", "details-A");
    deps.expire = async () => {
      throw new Error("rate limited");
    };
    const b = await pay("g10", "details-B");
    assert.equal(b.status, 503);
    assert.equal(stripe.calls.create, 1);
    pass("expiry refused (status still open): no new link (fail closed)");
  }

  // 11. Link expired by Stripe (after 23h) with unchanged details: a fresh link, not the dead one.
  {
    const { stripe, pay, clock } = setup();
    const a = await pay("g11", "details-A");
    clock.now += 24 * 3600 * 1000;
    const b = await pay("g11", "details-A");
    assert.equal(b.status, 200);
    assert.notEqual(b.body.checkoutId, a.body.checkoutId);
    assert.equal(stripe.calls.create, 2);
    pass("expired link (24h later): fresh link instead of the dead one");
  }

  // 12. Unchanged details but under 15 minutes left: replaced, so the customer isn't caught out.
  {
    const { stripe, pay, clock } = setup();
    const a = await pay("g12", "details-A");
    clock.now += (23 * 3600 - 10 * 60) * 1000;
    const b = await pay("g12", "details-A");
    assert.notEqual(b.body.checkoutId, a.body.checkoutId);
    assert.equal(stripe.sessions.get(String(a.body.checkoutId))!.status, "expired");
    pass("nearly expired link: expired and replaced");
  }

  // 13. A crashed request's lock is released after the lease.
  {
    const { pay, namespace, clock } = setup();
    const stub = namespace.get(namespace.idFromName("g13"));
    await stub.fetch("https://payment-group/group-begin", { method: "POST", body: JSON.stringify({ token: "crashed", now: clock.now, leaseMs: GROUP_LOCK_LEASE_MS }) });
    const blocked = await pay("g13", "details-A");
    assert.equal(blocked.body.code, "payment_group_busy");
    clock.now += GROUP_LOCK_LEASE_MS + 1000;
    const ok = await pay("g13", "details-A");
    assert.equal(ok.status, 200);
    pass("crashed request: lock released after the 2-minute lease");
  }

  // 14. Create failure releases the lock; retry works.
  {
    const { deps, stripe } = setup();
    await assert.rejects(
      createOrReplaceGroupedCheckout({ deps, groupKey: "g14", digest: "d", create: async () => { throw new Error("provider timeout"); } }),
    );
    const ok = await createOrReplaceGroupedCheckout({
      deps, groupKey: "g14", digest: "d",
      create: async () => ({ status: 200, body: { checkoutId: stripe.create() } }),
    });
    assert.equal(ok.status, 200);
    pass("provider error: lock released, retry allowed (Stripe de-duplicates identical creates)");
  }

  // 15. Validation rejections (no session) are passed through and not recorded.
  {
    const { deps } = setup();
    const rejected = await createOrReplaceGroupedCheckout({
      deps, groupKey: "g15", digest: "d",
      create: async () => ({ status: 400, body: { error: "Flight number required", code: "invalid_flight_number" } }),
    });
    assert.equal(rejected.status, 400);
    assert.equal(rejected.body.code, "invalid_flight_number");
    pass("validation errors pass through unchanged");
  }

  // 16. Non-Stripe (SumUp) links are left exactly as before.
  {
    const { deps, stripe } = setup();
    await createOrReplaceGroupedCheckout({ deps, groupKey: "g16", digest: "a", create: async () => ({ status: 200, body: { checkoutId: "sumup-123" } }) });
    const b = await createOrReplaceGroupedCheckout({ deps, groupKey: "g16", digest: "b", create: async () => ({ status: 200, body: { checkoutId: stripe.create() } }) });
    assert.equal(b.status, 200);
    assert.equal(stripe.calls.retrieve, 0);
    pass("SumUp links: unchanged behaviour (not checked or expired here)");
  }

  // 17. Finalisation guard: SIMULTANEOUS completion of two different paid links in one group.
  {
    const { namespace } = setup();
    const claims = await Promise.all([
      claimGroupFinalization({ namespace, groupKey: "g17", checkoutId: "cs_test_A" }),
      claimGroupFinalization({ namespace, groupKey: "g17", checkoutId: "cs_test_B" }),
    ]);
    assert.equal(claims.filter((c) => c.state === "claimed").length, 1);
    assert.equal(claims.filter((c) => c.state === "duplicate").length, 1);
    const winner = claims[0].state === "claimed" ? "cs_test_A" : "cs_test_B";
    assert.equal((await claimGroupFinalization({ namespace, groupKey: "g17", checkoutId: winner })).state, "claimed", "same payment re-claims (webhook + browser return)");
    pass("SIMULTANEOUS finalisation of two paid links: exactly one booking, the other flagged duplicate");
  }

  // 18. After a booking is finalised, the group refuses new links.
  {
    const { pay, namespace } = setup();
    await claimGroupFinalization({ namespace, groupKey: "g18", checkoutId: "cs_test_done" });
    const b = await pay("g18", "details-A");
    assert.equal(b.body.code, "already_paid");
    pass("after confirmation, Back + Pay cannot start a second payment");
  }

  // 19. Duplicate payment at finalisation: no booking, recorded, owner alerted, nothing refunded automatically.
  {
    const { namespace } = setup();
    const kv = new Map<string, string>();
    const pendingFor = (id: string) => JSON.stringify({
      checkoutId: id, checkoutReference: `ref-${id}`, amount: 267, createdAt: "2026-11-08T12:00:00Z",
      paymentGroupKey: "g19", checkoutKind: "booking",
      booking: { customerName: "Test Customer", customerEmail: "test@example.invalid", pickupLabel: "Dublin Airport", dropoffLabel: "Belfast City Hall", tripDate: "2026-11-20", tripTime: "14:30" },
    });
    kv.set("pending-checkout:cs_test_first", pendingFor("cs_test_first"));
    kv.set("pending-checkout:cs_test_second", pendingFor("cs_test_second"));
    const store = {
      get: async (k: string, type?: string) => { const v = kv.get(k); return v == null ? null : type === "json" ? JSON.parse(v) : v; },
      put: async (k: string, v: string) => { kv.set(k, v); },
      delete: async (k: string) => { kv.delete(k); },
      list: async () => ({ keys: [] }),
    } as unknown as KVNamespace;
    const env = { TRACKING_STORE: store, QUOTE_LEAD_COORDINATOR: namespace };
    const input = (id: string) => ({ env, checkoutId: id, booking: {} as never, logPaidBookingCalendar: async () => ({ logged: false }) }) as never;
    // Never let a test send real email: capture every outbound request instead.
    const outbound: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request) => {
      outbound.push(String(url instanceof Request ? url.url : url));
      return new Response("{}", { status: 202 });
    }) as typeof fetch;
    const first = await duplicateGroupPayment(input("cs_test_first"), { amount: 267, currency: "GBP" } as never).finally(() => undefined);
    assert.equal(first, null, "first payment finalises normally");
    const second = await duplicateGroupPayment(input("cs_test_second"), { amount: 267, currency: "GBP" } as never).finally(() => {
      globalThis.fetch = realFetch;
    });
    assert.equal(outbound.length <= 1, true, "at most one owner alert attempted (stubbed, nothing sent)");
    assert.ok(second);
    assert.equal(second!.paid, true);
    assert.equal(second!.ok, false);
    assert.equal(second!.customerEmailSent, false);
    assert.equal(second!.calendarLogged, false);
    const record = JSON.parse(kv.get("duplicate-payment:cs_test_second") ?? "{}");
    assert.equal(record.duplicateOfCheckoutId, "cs_test_first");
    assert.equal(record.status, "refund_needed");
    pass("duplicate paid link at finalisation: no second booking, recorded for refund, owner alert attempted");
  }

  console.log("ALL payment-session-group checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
