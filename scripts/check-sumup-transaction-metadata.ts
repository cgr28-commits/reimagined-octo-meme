/**
 * SumUp transaction id is stored from an authoritative SumUp payload.
 * A PAID checkout with an empty transactions array must not invent an id
 * or create another charge. Reconciliation fills blank metadata only.
 *
 * Run: npx tsx scripts/check-sumup-transaction-metadata.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PaidBookingDetails } from "../shared/booking-notifications";
import type { PaidBookingRecord } from "../shared/paid-booking-record";
import {
  getSuccessfulTransactionCode,
  getSuccessfulTransactionId,
  resolveAuthoritativeSumUpTransaction,
  successfulTransactionFromCheckout,
  type SumUpCheckoutDetails,
} from "../shared/sumup-checkout";
import { finalizePaidCheckout } from "../workers/addresses/src/finalize-paid-checkout";
import { savePaidBookingRecord } from "../workers/addresses/src/paid-booking-store";
import {
  handleReconcileSumUpTransactionsRequest,
  reconcilePaidBookingSumUpTransaction,
} from "../workers/addresses/src/reconcile-sumup-transaction";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function memoryKv() {
  const data = new Map<string, string>();
  return {
    async get(key: string, type?: string) {
      const raw = data.get(key);
      if (raw == null) return null;
      return type === "json" ? JSON.parse(raw) : raw;
    },
    async put(key: string, value: string) {
      data.set(key, value);
    },
    async delete(key: string) {
      data.delete(key);
    },
    async list(options?: { prefix?: string }) {
      const prefix = options?.prefix ?? "";
      const keys = [...data.keys()]
        .filter((name) => name.startsWith(prefix))
        .map((name) => ({ name }));
      return { keys, list_complete: true, cursor: "" };
    },
  } as unknown as KVNamespace;
}

type FetchCall = { method: string; url: string };

function installFetch(
  handler: (url: string, method: string) => { status: number; body: unknown },
): { calls: FetchCall[]; restore: () => void } {
  const calls: FetchCall[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({ method, url });
    if (!url.includes("api.sumup.com")) {
      return new Response("not sumup", { status: 503 });
    }
    if (method !== "GET" || url.includes("/refund")) {
      throw new Error(`Unexpected money-moving SumUp ${method} ${url}`);
    }
    const result = handler(url, method);
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

function sumUpCalls(calls: FetchCall[]): FetchCall[] {
  return calls.filter((call) => call.url.includes("api.sumup.com"));
}

function assertReadOnlySumUp(calls: FetchCall[]): void {
  const sumup = sumUpCalls(calls);
  assert.ok(sumup.length > 0);
  for (const call of sumup) {
    assert.equal(call.method, "GET", call.url);
    assert.equal(call.url.includes("/refund"), false, call.url);
    assert.equal(call.url.includes("/transactions/history"), false, call.url);
  }
}

const booking = {
  customerName: "Alex",
  customerEmail: "alex@example.com",
  mobileNumber: "07700900123",
  tripLabel: "Belfast to Belfast International",
  pickupLabel: "Belfast",
  dropoffLabel: "Belfast International Airport",
  returnJourney: false,
  tripDate: "2026-10-04",
  tripTime: "10:00",
  returnDate: "",
  returnTime: "",
  flightNumber: "",
  passengers: 2,
  suitcases: 1,
  vehicle: "Saloon",
  isAirportTrip: true,
  airportCode: "BFS",
} as PaidBookingDetails;

function paidCheckout(overrides: Partial<SumUpCheckoutDetails> = {}): SumUpCheckoutDetails {
  return {
    id: "chk-100",
    status: "PAID",
    amount: 48,
    currency: "GBP",
    checkout_reference: "matni-ref-100",
    transactions: [
      { id: "txn-uuid-100", transaction_code: "TCODE100", status: "SUCCESSFUL" },
    ],
    ...overrides,
  };
}

function storedBooking(overrides: Partial<PaidBookingRecord> = {}): PaidBookingRecord {
  return {
    paymentReference: "matni-ref-e",
    customerReference: "MAT-2401",
    checkoutId: "chk-e",
    amount: 55,
    currency: "GBP",
    amountPaidLabel: "£55.00",
    originalAmount: 55,
    customerName: "Alex",
    customerEmail: "alex@example.com",
    mobileNumber: "07700900123",
    tripLabel: "Airport transfer",
    pickupLabel: "Belfast",
    dropoffLabel: "BFS",
    returnJourney: false,
    tripDate: "2026-10-04",
    tripTime: "10:00",
    calendarEventIds: ["cal-keep"],
    trackingToken: "track-keep",
    status: "confirmed",
    paymentStatus: "paid",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

async function loadRecord(store: KVNamespace, paymentReference: string): Promise<PaidBookingRecord> {
  const raw = await store.get(`booking:ref:${paymentReference}`, "json");
  assert.ok(raw && typeof raw === "object");
  return raw as PaidBookingRecord;
}

async function main(): Promise<void> {
console.log("=== SumUp transaction metadata ===");

console.log("--- helpers read a SUCCESSFUL transaction, then PAID checkout fields ---");
{
  const withTransaction = paidCheckout();
  assert.equal(getSuccessfulTransactionId(withTransaction), "txn-uuid-100");
  assert.equal(getSuccessfulTransactionCode(withTransaction), "TCODE100");

  const topLevel = paidCheckout({
    transactions: [],
    transaction_id: "txn-uuid-top",
    transaction_code: "TCODETOP",
  });
  assert.equal(successfulTransactionFromCheckout(topLevel)?.source, "checkout_fields");
  assert.equal(getSuccessfulTransactionId(topLevel), "txn-uuid-top");
  assert.equal(getSuccessfulTransactionCode(topLevel), "TCODETOP");

  const pending = paidCheckout({
    status: "PENDING",
    transactions: [],
    transaction_id: "txn-do-not-use",
    transaction_code: "CODE-DO-NOT-USE",
  });
  assert.equal(successfulTransactionFromCheckout(pending), null);

  const emptyPaid = paidCheckout({ transactions: undefined, transaction_id: undefined, transaction_code: undefined });
  assert.equal(successfulTransactionFromCheckout(emptyPaid), null);
}

console.log("--- A. PAID checkout already has a SUCCESSFUL transaction ---");
{
  const fetchMock = installFetch(() => {
    throw new Error("SumUp lookup must not run when the transaction is already on the checkout");
  });
  try {
    const resolved = await resolveAuthoritativeSumUpTransaction({
      apiKey: "test-sumup-key",
      merchantCode: "MCODE",
      checkout: paidCheckout(),
    });
    assert.equal(resolved.transactionId, "txn-uuid-100");
    assert.equal(resolved.transactionCode, "TCODE100");
    assert.equal(resolved.source, "checkout_transactions");
    assert.equal(fetchMock.calls.length, 0);

    const store = memoryKv();
    let calendarCalls = 0;
    const finalized = await finalizePaidCheckout({
      env: { SUMUP_API_KEY: "test-sumup-key", SUMUP_MERCHANT_CODE: "MCODE", TRACKING_STORE: store },
      checkoutId: "chk-100",
      booking,
      checkout: paidCheckout(),
      logPaidBookingCalendar: async () => {
        calendarCalls += 1;
        return { logged: true, events: 0, eventIds: [] };
      },
    });
    assert.equal(finalized.ok, true);
    assert.equal(finalized.paid, true);
    assert.equal(finalized.paymentReference, "TCODE100");
    const saved = await loadRecord(store, "TCODE100");
    assert.equal(saved.transactionId, "txn-uuid-100");
    assert.equal(saved.transactionCode, "TCODE100");
    assert.equal(saved.checkoutId, "chk-100");
    assert.equal(saved.amount, 48);
    assert.equal(calendarCalls, 1);
    assert.equal(sumUpCalls(fetchMock.calls).length, 0);
  } finally {
    fetchMock.restore();
  }
}

console.log("--- B. PAID checkout with no transactions; fallback lookup finds them ---");
{
  const empty = paidCheckout({
    transactions: [],
    transaction_id: undefined,
    transaction_code: undefined,
  });
  const found = paidCheckout();
  const fetchMock = installFetch((url) => {
    if (url.includes("/v0.1/checkouts/chk-100")) {
      return { status: 200, body: found };
    }
    return { status: 404, body: {} };
  });
  try {
    const resolved = await resolveAuthoritativeSumUpTransaction({
      apiKey: "test-sumup-key",
      merchantCode: "MCODE",
      checkout: empty,
      paymentReference: "matni-ref-100",
    });
    assert.equal(resolved.source, "checkout_refetch");
    assert.equal(resolved.transactionId, "txn-uuid-100");
    assert.equal(resolved.transactionCode, "TCODE100");
    assertReadOnlySumUp(fetchMock.calls);

    const store = memoryKv();
    const finalized = await finalizePaidCheckout({
      env: { SUMUP_API_KEY: "test-sumup-key", SUMUP_MERCHANT_CODE: "MCODE", TRACKING_STORE: store },
      checkoutId: "chk-100",
      booking,
      checkout: empty,
      logPaidBookingCalendar: async () => ({ logged: true, events: 0, eventIds: [] }),
    });
    assert.equal(finalized.paymentReference, "TCODE100");
    const saved = await loadRecord(store, "TCODE100");
    assert.equal(saved.transactionId, "txn-uuid-100");
    assert.equal(saved.transactionCode, "TCODE100");
    assert.equal(saved.amount, 48);
    assertReadOnlySumUp(fetchMock.calls);
  } finally {
    fetchMock.restore();
  }
}

console.log("--- B2. refetch still empty; checkout-reference list returns the transaction ---");
{
  const empty = paidCheckout({ transactions: [], transaction_id: " ", transaction_code: "" });
  const fetchMock = installFetch((url) => {
    if (url.includes("/v0.1/checkouts?")) {
      return { status: 200, body: [paidCheckout(), paidCheckout({ id: "chk-other", transactions: [{ id: "txn-other", transaction_code: "OTHER", status: "SUCCESSFUL" }] })] };
    }
    if (url.includes("/v0.1/checkouts/chk-100")) {
      return { status: 200, body: empty };
    }
    return { status: 404, body: {} };
  });
  try {
    const resolved = await resolveAuthoritativeSumUpTransaction({
      apiKey: "test-sumup-key",
      checkout: empty,
    });
    assert.equal(resolved.source, "checkout_reference");
    assert.equal(resolved.transactionId, "txn-uuid-100");
    assert.equal(resolved.transactionCode, "TCODE100");
    assertReadOnlySumUp(fetchMock.calls);
  } finally {
    fetchMock.restore();
  }
}

console.log("--- B3. transaction code without id; retrieve-transaction supplies the id ---");
{
  const coded = paidCheckout({
    transactions: [],
    transaction_id: undefined,
    transaction_code: "TCODE100",
  });
  const fetchMock = installFetch((url) => {
    if (url.includes("/transactions?id=")) return { status: 404, body: {} };
    if (url.includes("/transactions?transaction_code=")) {
      return {
        status: 200,
        body: { id: "txn-uuid-100", transaction_code: "TCODE100", status: "SUCCESSFUL", amount: 48 },
      };
    }
    if (url.includes("/v0.1/me/transactions")) return { status: 404, body: {} };
    if (url.includes("/v0.1/checkouts?")) return { status: 200, body: [] };
    if (url.includes("/v0.1/checkouts/chk-100")) return { status: 200, body: coded };
    return { status: 404, body: {} };
  });
  try {
    const resolved = await resolveAuthoritativeSumUpTransaction({
      apiKey: "test-sumup-key",
      merchantCode: "MCODE",
      checkout: coded,
    });
    assert.equal(resolved.source, "transaction_details");
    assert.equal(resolved.transactionId, "txn-uuid-100");
    assert.equal(resolved.transactionCode, "TCODE100");
    assertReadOnlySumUp(fetchMock.calls);
  } finally {
    fetchMock.restore();
  }
}

console.log("--- C. PAID checkout whose transaction cannot be resolved ---");
{
  const empty = paidCheckout({
    id: "chk-missing",
    checkout_reference: "matni-ref-missing",
    transactions: [],
    transaction_id: undefined,
    transaction_code: undefined,
  });
  const fetchMock = installFetch((url, method) => {
    if (method !== "GET") return { status: 500, body: { error: "no writes" } };
    if (url.includes("/v0.1/checkouts?")) return { status: 200, body: [empty] };
    if (url.includes("/v0.1/checkouts/chk-missing")) return { status: 200, body: empty };
    return { status: 404, body: {} };
  });
  try {
    const resolved = await resolveAuthoritativeSumUpTransaction({
      apiKey: "test-sumup-key",
      merchantCode: "MCODE",
      checkout: empty,
    });
    assert.equal(resolved.source, "unresolved");
    assert.equal(resolved.transactionId, undefined);
    assert.equal(resolved.transactionCode, undefined);

    const store = memoryKv();
    const finalized = await finalizePaidCheckout({
      env: { SUMUP_API_KEY: "test-sumup-key", SUMUP_MERCHANT_CODE: "MCODE", TRACKING_STORE: store },
      checkoutId: "chk-missing",
      booking,
      checkout: empty,
      logPaidBookingCalendar: async () => ({ logged: true, events: 0, eventIds: [] }),
    });
    assert.equal(finalized.ok, true);
    assert.equal(finalized.paid, true);
    assert.equal(finalized.paymentReference, "matni-ref-missing");
    const saved = await loadRecord(store, "matni-ref-missing");
    assert.equal(saved.transactionId, undefined);
    assert.equal(saved.transactionCode, undefined);
    assert.equal(saved.checkoutId, "chk-missing");
    assert.equal(saved.amount, 48);
    assert.equal(saved.paymentReference, "matni-ref-missing");
    assertReadOnlySumUp(fetchMock.calls);
  } finally {
    fetchMock.restore();
  }
}

console.log("--- D. repeated finalisation stays idempotent ---");
{
  const checkout = paidCheckout({ id: "chk-repeat", checkout_reference: "matni-ref-repeat" });
  const fetchMock = installFetch(() => {
    throw new Error("Second finalisation must not call SumUp when the transaction is already stored");
  });
  try {
    const store = memoryKv();
    let calendarCalls = 0;
    const env = { SUMUP_API_KEY: "test-sumup-key", SUMUP_MERCHANT_CODE: "MCODE", TRACKING_STORE: store };
    const first = await finalizePaidCheckout({
      env,
      checkoutId: "chk-repeat",
      booking,
      checkout,
      logPaidBookingCalendar: async () => {
        calendarCalls += 1;
        return { logged: true, events: 0, eventIds: [] };
      },
    });
    const second = await finalizePaidCheckout({
      env,
      checkoutId: "chk-repeat",
      booking,
      checkout,
      logPaidBookingCalendar: async () => {
        calendarCalls += 1;
        return { logged: true, events: 0, eventIds: [] };
      },
    });
    assert.equal(first.alreadyFinalized, undefined);
    assert.equal(second.alreadyFinalized, true);
    assert.equal(second.paymentReference, first.paymentReference);
    assert.equal(calendarCalls, 1);
    assert.equal(sumUpCalls(fetchMock.calls).length, 0);
    const saved = await loadRecord(store, "TCODE100");
    assert.equal(saved.transactionId, "txn-uuid-100");
    assert.equal(saved.customerReference?.startsWith("MAT-"), true);
    const again = await loadRecord(store, saved.paymentReference);
    assert.equal(again.customerReference, saved.customerReference);
  } finally {
    fetchMock.restore();
  }
}

console.log("--- D2. a later finalisation fills a missing id without a second booking ---");
{
  const empty = paidCheckout({
    id: "chk-later",
    checkout_reference: "matni-ref-later",
    transactions: [],
    transaction_id: undefined,
    transaction_code: undefined,
  });
  let reveal = false;
  const fetchMock = installFetch((url) => {
    if (!url.includes("/v0.1/checkouts/chk-later") && !url.includes("/v0.1/checkouts?")) {
      return { status: 404, body: {} };
    }
    if (url.includes("/v0.1/checkouts?")) return { status: 200, body: [] };
    if (!reveal) return { status: 200, body: empty };
    return { status: 200, body: paidCheckout({ id: "chk-later", checkout_reference: "matni-ref-later" }) };
  });
  try {
    const store = memoryKv();
    let calendarCalls = 0;
    const env = { SUMUP_API_KEY: "test-sumup-key", SUMUP_MERCHANT_CODE: "MCODE", TRACKING_STORE: store };
    const logPaidBookingCalendar = async () => {
      calendarCalls += 1;
      return { logged: true, events: 0, eventIds: [] as string[] };
    };
    const first = await finalizePaidCheckout({
      env,
      checkoutId: "chk-later",
      booking,
      checkout: empty,
      logPaidBookingCalendar,
    });
    assert.equal(first.paymentReference, "matni-ref-later");
    const before = await loadRecord(store, "matni-ref-later");
    assert.equal(before.transactionId, undefined);
    const customerReference = before.customerReference;

    reveal = true;
    const second = await finalizePaidCheckout({
      env,
      checkoutId: "chk-later",
      booking,
      checkout: empty,
      logPaidBookingCalendar,
    });
    assert.equal(second.alreadyFinalized, true);
    assert.equal(second.paymentReference, "matni-ref-later");
    assert.equal(calendarCalls, 1);
    const after = await loadRecord(store, "matni-ref-later");
    assert.equal(after.transactionId, "txn-uuid-100");
    assert.equal(after.transactionCode, "TCODE100");
    assert.equal(after.customerReference, customerReference);
    assert.equal(after.amount, 48);
    assert.equal(after.paymentReference, "matni-ref-later");
    assertReadOnlySumUp(fetchMock.calls);
  } finally {
    fetchMock.restore();
  }
}

console.log("--- E. reconcile an existing paid booking with a missing transaction id ---");
{
  const store = memoryKv();
  const original = storedBooking();
  await savePaidBookingRecord(store, original);
  const fetchMock = installFetch((url) => {
    if (url.includes("/v0.1/checkouts/chk-e")) {
      return {
        status: 200,
        body: paidCheckout({
          id: "chk-e",
          amount: 1,
          checkout_reference: "matni-ref-e",
          transactions: [{ id: "txn-uuid-e", transaction_code: "TCODE-E", status: "SUCCESSFUL" }],
        }),
      };
    }
    return { status: 404, body: {} };
  });
  try {
    const result = await reconcilePaidBookingSumUpTransaction({
      apiKey: "test-sumup-key",
      merchantCode: "MCODE",
      store,
      record: original,
    });
    assert.equal(result.status, "repaired");
    assert.equal(result.transactionId, "txn-uuid-e");
    assert.equal(result.transactionCode, "TCODE-E");
    const saved = await loadRecord(store, "matni-ref-e");
    assert.equal(saved.transactionId, "txn-uuid-e");
    assert.equal(saved.transactionCode, "TCODE-E");
    assert.equal(saved.amount, 55);
    assert.equal(saved.amountPaidLabel, "£55.00");
    assert.equal(saved.paymentReference, "matni-ref-e");
    assert.deepEqual(saved.calendarEventIds, ["cal-keep"]);
    assert.equal(saved.trackingToken, "track-keep");
    assert.equal(saved.status, "confirmed");
    assert.equal(saved.customerEmail, "alex@example.com");
    assertReadOnlySumUp(fetchMock.calls);

    const keptCode = storedBooking({
      paymentReference: "matni-ref-keep",
      checkoutId: "chk-keep",
      transactionCode: "KEEP-CODE",
    });
    await savePaidBookingRecord(store, keptCode);
    const keepFetch = installFetch((url) => {
      if (url.includes("/v0.1/checkouts/chk-keep")) {
        return {
          status: 200,
          body: paidCheckout({
            id: "chk-keep",
            checkout_reference: "matni-ref-keep",
            transactions: [{ id: "txn-uuid-keep", transaction_code: "OTHER-CODE", status: "SUCCESSFUL" }],
          }),
        };
      }
      return { status: 404, body: {} };
    });
    try {
      const kept = await reconcilePaidBookingSumUpTransaction({
        apiKey: "test-sumup-key",
        merchantCode: "MCODE",
        store,
        record: keptCode,
      });
      assert.equal(kept.status, "repaired");
      const savedKept = await loadRecord(store, "matni-ref-keep");
      assert.equal(savedKept.transactionId, "txn-uuid-keep");
      assert.equal(savedKept.transactionCode, "KEEP-CODE");
      assert.equal(savedKept.amount, 55);
      assertReadOnlySumUp(keepFetch.calls);
    } finally {
      keepFetch.restore();
    }
  } finally {
    fetchMock.restore();
  }
}

console.log("--- F. reconcile does not overwrite transaction metadata or move money ---");
{
  const store = memoryKv();
  const complete = storedBooking({
    paymentReference: "matni-ref-complete",
    checkoutId: "chk-complete",
    transactionId: "txn-already",
    transactionCode: "TCODE-ALREADY",
  });
  await savePaidBookingRecord(store, complete);
  const fetchMock = installFetch(() => {
    throw new Error("Complete transaction metadata must not call SumUp");
  });
  try {
    const result = await reconcilePaidBookingSumUpTransaction({
      apiKey: "test-sumup-key",
      merchantCode: "MCODE",
      store,
      record: complete,
    });
    assert.equal(result.status, "already_complete");
    assert.equal(result.transactionId, "txn-already");
    assert.equal(result.transactionCode, "TCODE-ALREADY");
    assert.equal(sumUpCalls(fetchMock.calls).length, 0);
    const saved = await loadRecord(store, "matni-ref-complete");
    assert.equal(saved.transactionId, "txn-already");
    assert.equal(saved.transactionCode, "TCODE-ALREADY");
    assert.equal(saved.amount, 55);
    assert.equal(saved.amountPaidLabel, "£55.00");
    assert.deepEqual(saved.calendarEventIds, ["cal-keep"]);
  } finally {
    fetchMock.restore();
  }
}

console.log("--- unpaid checkout is not given a transaction id ---");
{
  const store = memoryKv();
  const record = storedBooking({ checkoutId: "chk-unpaid", paymentReference: "matni-ref-unpaid" });
  await savePaidBookingRecord(store, record);
  const fetchMock = installFetch((url) => {
    if (url.includes("/v0.1/checkouts/chk-unpaid")) {
      return { status: 200, body: paidCheckout({ id: "chk-unpaid", status: "PENDING", transactions: [] }) };
    }
    return { status: 404, body: {} };
  });
  try {
    const result = await reconcilePaidBookingSumUpTransaction({
      apiKey: "test-sumup-key",
      store,
      record,
    });
    assert.equal(result.status, "error");
    const saved = await loadRecord(store, "matni-ref-unpaid");
    assert.equal(saved.transactionId, undefined);
    assert.equal(saved.amount, 55);
    assert.equal(saved.status, "confirmed");
    assertReadOnlySumUp(fetchMock.calls);
  } finally {
    fetchMock.restore();
  }
}

console.log("--- owner reconcile route ---");
{
  const store = memoryKv();
  await savePaidBookingRecord(store, storedBooking());
  await savePaidBookingRecord(
    store,
    storedBooking({
      paymentReference: "matni-ref-done",
      checkoutId: "chk-done",
      customerReference: "MAT-2402",
      transactionId: "txn-done",
      transactionCode: "TCODE-DONE",
    }),
  );
  const env = {
    OWNER_ACCESS_KEY: "owner-test-key",
    SUMUP_API_KEY: "test-sumup-key",
    SUMUP_MERCHANT_CODE: "MCODE",
    TRACKING_STORE: store,
  };
  const denied = await handleReconcileSumUpTransactionsRequest(
    new Request("https://worker.test/paid-bookings/reconcile-transactions", {
      method: "POST",
      body: JSON.stringify({ scan: true }),
    }),
    env,
    null,
  );
  assert.equal(denied.status, 401);

  const missing = await handleReconcileSumUpTransactionsRequest(
    new Request("https://worker.test/paid-bookings/reconcile-transactions", {
      method: "POST",
      headers: { "X-Owner-Key": "owner-test-key" },
      body: JSON.stringify({}),
    }),
    env,
    null,
  );
  assert.equal(missing.status, 400);

  const fetchMock = installFetch((url) => {
    if (url.includes("/v0.1/checkouts/chk-e")) {
      return {
        status: 200,
        body: paidCheckout({
          id: "chk-e",
          checkout_reference: "matni-ref-e",
          transactions: [{ id: "txn-uuid-e", transaction_code: "TCODE-E", status: "SUCCESSFUL" }],
        }),
      };
    }
    if (url.includes("chk-done")) {
      throw new Error("Already-complete booking must not be looked up");
    }
    return { status: 404, body: {} };
  });
  try {
    const response = await handleReconcileSumUpTransactionsRequest(
      new Request("https://worker.test/api/paid-bookings/reconcile-transactions", {
        method: "POST",
        headers: { "X-Owner-Key": "owner-test-key", "Content-Type": "application/json" },
        body: JSON.stringify({ scan: true, days: 2, limit: 20 }),
      }),
      env,
      "https://www.myairporttaxini.co.uk",
    );
    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      repaired: number;
      alreadyComplete: number;
      results: Array<{ status: string; paymentReference: string; transactionId?: string }>;
    };
    assert.equal(payload.repaired, 1);
    assert.equal(payload.alreadyComplete, 1);
    const repaired = payload.results.find((item) => item.paymentReference === "matni-ref-e");
    const done = payload.results.find((item) => item.paymentReference === "matni-ref-done");
    assert.equal(repaired?.status, "repaired");
    assert.equal(repaired?.transactionId, "txn-uuid-e");
    assert.equal(done?.status, "already_complete");
    assertReadOnlySumUp(fetchMock.calls);
    assert.equal(fetchMock.calls.some((call) => call.url.includes("chk-done")), false);
  } finally {
    fetchMock.restore();
  }
}

console.log("--- storage and every paid finalisation path ---");
{
  const refundHandlers = read("workers/addresses/src/refund-handlers.ts");
  assert.match(refundHandlers, /transactionId: input\.transactionId/);
  assert.match(refundHandlers, /transactionCode: input\.transactionCode/);

  const recordType = read("shared/paid-booking-record.ts");
  assert.match(recordType, /transactionId\?: string/);
  assert.match(recordType, /transactionCode\?: string/);

  const finalize = read("workers/addresses/src/finalize-paid-checkout.ts");
  const resolveAt = finalize.indexOf("resolveAuthoritativeSumUpTransaction");
  const amendmentAt = finalize.indexOf("finalizeAmendmentTopUpCheckout");
  const saveAt = finalize.indexOf("savePaidBookingRecordFromConfirm");
  assert.ok(resolveAt > 0 && amendmentAt > resolveAt && saveAt > resolveAt);
  assert.match(finalize, /transactionId,/);
  assert.match(finalize, /transactionCode,/);

  const index = read("workers/addresses/src/index.ts");
  const webhookStart = index.indexOf("async function handlePaymentWebhookRequest");
  const confirmStart = index.indexOf("async function handlePaymentConfirmRequest");
  const webhook = index.slice(webhookStart, confirmStart);
  const confirmNext = index.indexOf("\nasync function ", confirmStart + 1);
  const confirm = index.slice(confirmStart, confirmNext === -1 ? undefined : confirmNext);
  assert.match(webhook, /finalizePaidCheckout\(/);
  assert.match(confirm, /finalizePaidCheckout\(/);
  assert.doesNotMatch(webhook, /createSumUpHostedCheckout|refundSumUpTransaction/);
  assert.doesNotMatch(confirm, /createSumUpHostedCheckout|refundSumUpTransaction/);
  assert.match(index, /paid-bookings-reconcile-transactions/);

  const scheduled = index.slice(index.indexOf("async scheduled("));
  assert.doesNotMatch(scheduled, /reconcile/);

  const recover = read("workers/addresses/src/recover-paid-checkouts.ts");
  assert.match(recover, /finalizePaidCheckout\(\{[\s\S]*checkout,/);

  const reconcile = read("workers/addresses/src/reconcile-sumup-transaction.ts");
  assert.doesNotMatch(reconcile, /refundSumUpTransaction|createSumUpHostedCheckout|findSumUpTransactionByCode/);
  assert.match(reconcile, /fillMissingPaidBookingTransactionMetadata/);

  const sumup = read("shared/sumup-checkout.ts");
  assert.match(sumup, /transactions\/history/);
  assert.match(sumup, /history by checkout reference/);
}

console.log("OK  SumUp transaction metadata");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
