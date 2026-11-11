/**
 * Old unpaid payment pages are closed when the customer starts a newer payment for a
 * changed booking — and nothing else is ever closed.
 * Run: npx tsx scripts/check-supersede-checkout.ts
 */
import assert from "node:assert/strict";
import { savePendingCheckout, getPendingCheckout, type PendingCheckoutRecord } from "../workers/addresses/src/pending-checkout-store";
import { supersedeEarlierCheckouts } from "../workers/addresses/src/supersede-checkout";

function fakeKv(): KVNamespace {
  const data = new Map<string, string>();
  return {
    async get(key: string, type?: string) {
      const raw = data.get(key);
      if (raw == null) return null;
      return type === "json" ? JSON.parse(raw) : raw;
    },
    async put(key: string, value: string) { data.set(key, value); },
    async delete(key: string) { data.delete(key); },
  } as unknown as KVNamespace;
}

function pending(id: string, extra: Partial<PendingCheckoutRecord> = {}, booking: Record<string, unknown> = {}): PendingCheckoutRecord {
  return {
    checkoutId: id,
    checkoutReference: `REF-${id.slice(-4)}`,
    amount: 68,
    createdAt: new Date().toISOString(),
    booking: {
      customerName: "Test Customer", customerEmail: "test@example.com", mobileNumber: "07700 900123",
      quoteTransactionId: "quote_abc", ...booking,
    } as PendingCheckoutRecord["booking"],
    ...extra,
  };
}

function ops(statuses: Record<string, "open" | "complete" | "expired">) {
  const expired: string[] = [];
  return {
    expired,
    retrieve: async (id: string) => ({ status: statuses[id] ?? null }),
    expire: async (id: string) => { expired.push(id); statuses[id] = "expired"; },
  };
}

const A = "cs_test_AAAA1111", B = "cs_test_BBBB2222", C = "cs_test_CCCC3333";
let n = 0;
async function check(name: string, run: () => Promise<void>) { await run(); n++; console.log(`OK  ${name}`); }

(async () => {
  await check("same quote: the earlier open payment page is closed when a new one is created", async () => {
    const kv = fakeKv(); const o = ops({ [A]: "open", [B]: "open" });
    await savePendingCheckout(kv, pending(A));
    assert.deepEqual((await supersedeEarlierCheckouts(kv, { newCheckoutId: A }, o)).superseded, []);
    await savePendingCheckout(kv, pending(B, { amount: 75 }));
    assert.deepEqual((await supersedeEarlierCheckouts(kv, { newCheckoutId: B }, o)).superseded, [A]);
    assert.deepEqual(o.expired, [A]);
    const old = await getPendingCheckout(kv, A);
    assert.equal(old?.supersededByCheckoutId, B);
    assert.ok(old?.unsuccessfulEmailSentAt, "owner is not sent a 'payment failed' email for a replaced link");
  });

  await check("a different quote from the same browser tab is closed when the browser names it", async () => {
    const kv = fakeKv(); const o = ops({ [A]: "open", [B]: "open" });
    await savePendingCheckout(kv, pending(A, {}, { quoteTransactionId: "quote_old" }));
    await supersedeEarlierCheckouts(kv, { newCheckoutId: A }, o);
    await savePendingCheckout(kv, pending(B, {}, { quoteTransactionId: "quote_new" }));
    const r = await supersedeEarlierCheckouts(kv, { newCheckoutId: B, clientPreviousCheckoutId: A }, o);
    assert.deepEqual(r.superseded, [A]);
  });

  await check("another customer's payment page can never be closed by naming its id", async () => {
    const kv = fakeKv(); const o = ops({ [A]: "open", [B]: "open" });
    await savePendingCheckout(kv, pending(A, {}, { quoteTransactionId: "quote_x", customerEmail: "someone@else.com", mobileNumber: "07700 900999" }));
    await savePendingCheckout(kv, pending(B, {}, { quoteTransactionId: "quote_y" }));
    const r = await supersedeEarlierCheckouts(kv, { newCheckoutId: B, clientPreviousCheckoutId: A }, o);
    assert.deepEqual(r.superseded, []); assert.deepEqual(o.expired, []);
  });

  await check("a paid booking or an authorised card hold is never touched", async () => {
    for (const extra of [{ finalizedAt: "2026-11-11T00:00:00Z" }, { paymentReference: "pi_123" }, {}]) {
      const kv = fakeKv(); const o = ops({ [A]: "complete", [B]: "open" });
      await savePendingCheckout(kv, pending(A, extra));
      await supersedeEarlierCheckouts(kv, { newCheckoutId: A }, o);
      await savePendingCheckout(kv, pending(B));
      const r = await supersedeEarlierCheckouts(kv, { newCheckoutId: B, clientPreviousCheckoutId: A }, o);
      assert.deepEqual(r.superseded, []); assert.deepEqual(o.expired, []);
    }
  });

  await check("token-based links (short notice, personal, quick, saved, A2A, return offer) and top-ups are left alone", async () => {
    const tokens: Partial<PendingCheckoutRecord>[] = [
      { shortNoticeToken: "t" }, { personalQuoteCode: "PQ1" }, { quickQuoteId: "qq" }, { savedQuoteToken: "sq" },
      { a2aQuoteToken: "a2a" }, { returnOfferToken: "ro" }, { checkoutKind: "amendment-topup" }, { checkoutKind: "short-notice-hold" },
    ];
    for (const token of tokens) {
      // old link is token-based
      let kv = fakeKv(); let o = ops({ [A]: "open", [B]: "open" });
      await savePendingCheckout(kv, pending(A, token)); await savePendingCheckout(kv, pending(B));
      assert.deepEqual((await supersedeEarlierCheckouts(kv, { newCheckoutId: B, clientPreviousCheckoutId: A }, o)).superseded, []);
      // new link is token-based
      kv = fakeKv(); o = ops({ [A]: "open", [B]: "open" });
      await savePendingCheckout(kv, pending(A)); await supersedeEarlierCheckouts(kv, { newCheckoutId: A }, o);
      await savePendingCheckout(kv, pending(B, token));
      assert.deepEqual((await supersedeEarlierCheckouts(kv, { newCheckoutId: B, clientPreviousCheckoutId: A }, o)).superseded, []);
      assert.deepEqual(o.expired, []);
    }
  });

  await check("a third payment closes the second; the first is not closed twice", async () => {
    const kv = fakeKv(); const o = ops({ [A]: "open", [B]: "open", [C]: "open" });
    for (const id of [A, B, C]) { await savePendingCheckout(kv, pending(id)); await supersedeEarlierCheckouts(kv, { newCheckoutId: id, clientPreviousCheckoutId: A }, o); }
    assert.deepEqual(o.expired, [A, B]);
  });

  await check("a Stripe failure never blocks the new payment", async () => {
    const kv = fakeKv();
    await savePendingCheckout(kv, pending(A)); await savePendingCheckout(kv, pending(B));
    const failing = { retrieve: async () => { throw new Error("stripe down"); }, expire: async () => { throw new Error("stripe down"); } };
    await supersedeEarlierCheckouts(kv, { newCheckoutId: A }, failing);
    assert.deepEqual((await supersedeEarlierCheckouts(kv, { newCheckoutId: B }, failing)).superseded, []);
  });

  await check("SumUp (non-Stripe) checkout ids are ignored", async () => {
    const kv = fakeKv(); const o = ops({ [B]: "open" });
    await savePendingCheckout(kv, pending("sumup-1234")); await supersedeEarlierCheckouts(kv, { newCheckoutId: "sumup-1234" }, o);
    await savePendingCheckout(kv, pending(B));
    assert.deepEqual((await supersedeEarlierCheckouts(kv, { newCheckoutId: B }, o)).superseded, []);
  });

  console.log(`OK  supersede checkout (${n} checks)`);
})().catch((error) => { console.error(error); process.exit(1); });
