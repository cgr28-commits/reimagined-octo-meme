"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Footer from "@/components/Footer";
import OwnerPortalHeader from "@/components/OwnerPortalHeader";
import {
  createRefundTestCheckout,
  fetchRefundTestList,
  issueRefundTestRefund,
  type RefundTestBookingSummary,
  type RefundTestListResponse,
} from "@/lib/refund-test-api";
import {
  fetchRefundDiagnostics,
  type RefundDiagnosticsReport,
} from "@/lib/paid-bookings-api";
import { confirmPaidBooking } from "@/lib/create-payment";
import { generateRefundOpId } from "../../shared/refund-ops";
import {
  canSubmitRefundTest,
  parseRefundTestAmountInput,
  remainingBalanceFillValue,
} from "@/lib/refund-test-ui";
import { SITE } from "@/lib/data";

const OWNER_KEY_STORAGE = "matni-owner-key";

function money(amount: number): string {
  return `£${amount.toFixed(2)}`;
}

export default function OwnerRefundTestClient() {
  const [ownerKey, setOwnerKey] = useState("");
  const [savedKey, setSavedKey] = useState("");
  const [list, setList] = useState<RefundTestListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [diagnostics, setDiagnostics] = useState<Record<string, RefundDiagnosticsReport>>({});
  const [confirmKey, setConfirmKey] = useState("");
  const [finalConfirm, setFinalConfirm] = useState(false);
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [refundAmount, setRefundAmount] = useState("");

  const redirectUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return `${SITE.url.replace(/\/$/, "")}/owner/refund-test/?payment=return`;
    }
    return `${window.location.origin}/owner/refund-test/?payment=return`;
  }, []);

  const load = useCallback(async (key: string) => {
    setLoading(true);
    setError("");
    try {
      const next = await fetchRefundTestList(key);
      setList(next);
      return next;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load refund tests");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const stored = sessionStorage.getItem(OWNER_KEY_STORAGE)?.trim() ?? "";
    if (stored) {
      setOwnerKey(stored);
      setSavedKey(stored);
      void load(stored);
    }
  }, [load]);

  useEffect(() => {
    if (!savedKey || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("payment") !== "return") return;
    const checkoutId =
      params.get("checkout_id")?.trim() ||
      params.get("id")?.trim() ||
      params.get("checkoutId")?.trim() ||
      "";
    if (!checkoutId) {
      setMessage("Returned from SumUp — refresh the list if payment completed.");
      void load(savedKey);
      return;
    }

    let cancelled = false;
    (async () => {
      setBusy(true);
      setError("");
      try {
        const result = await confirmPaidBooking(checkoutId);
        if (cancelled) return;
        setMessage(
          `TEST payment finalized: ${result.amountPaid} · ref ${result.paymentReference}. Customer confirmation email suppressed.`,
        );
        await load(savedKey);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not finalize refund-test payment — try Refresh list.",
          );
          await load(savedKey);
        }
      } finally {
        if (!cancelled) setBusy(false);
        const url = new URL(window.location.href);
        url.searchParams.delete("payment");
        url.searchParams.delete("checkout_id");
        url.searchParams.delete("id");
        url.searchParams.delete("checkoutId");
        window.history.replaceState({}, "", url.pathname + url.search);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [savedKey, load]);

  function unlock(event: FormEvent) {
    event.preventDefault();
    const key = ownerKey.trim();
    if (!key) {
      setError("Enter OWNER_ACCESS_KEY");
      return;
    }
    sessionStorage.setItem(OWNER_KEY_STORAGE, key);
    setSavedKey(key);
    setError("");
    void load(key);
  }

  function resetRefundForm() {
    setSelectedRef(null);
    setRefundAmount("");
    setConfirmKey("");
    setFinalConfirm(false);
  }

  function openRefundForm(booking: RefundTestBookingSummary) {
    if (booking.remainingRefundable < 0.01) return;
    setSelectedRef(booking.paymentReference);
    setRefundAmount("");
    setConfirmKey("");
    setFinalConfirm(false);
    setError("");
  }

  async function startCheckout() {
    if (!savedKey) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await createRefundTestCheckout({
        ownerKey: savedKey,
        redirectUrl,
      });
      if (!result.paymentUrl) {
        throw new Error("SumUp did not return a payment URL");
      }
      setMessage(
        `${result.warning ?? "LIVE SUMUP TEST"} — redirecting to pay ${result.amountLabel ?? "£1.00"}…`,
      );
      window.location.assign(result.paymentUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create £1 test checkout");
      setBusy(false);
    }
  }

  async function loadDiagnostics(booking: RefundTestBookingSummary) {
    if (!savedKey) return;
    setBusy(true);
    setError("");
    try {
      const report = await fetchRefundDiagnostics(savedKey, booking.paymentReference);
      setDiagnostics((current) => ({ ...current, [booking.paymentReference]: report }));
      setMessage(
        `Diagnostics: paid ${money(report.originalAmount)} · refunded ${money(report.amountRefunded)} · remaining ${money(report.remainingRefundable)}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Diagnostics failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitRefund(booking: RefundTestBookingSummary) {
    if (!savedKey) return;

    const gate = canSubmitRefundTest({
      amountRaw: refundAmount,
      remainingRefundable: booking.remainingRefundable,
      confirmOwnerKey: confirmKey,
      finalConfirm,
      busy,
    });
    if (!gate.ok || gate.amount == null) {
      if (gate.reason === "invalid_amount") {
        setError("Enter a valid refund amount greater than £0 and not more than remaining.");
      } else if (gate.reason === "missing_owner_key") {
        setError("Re-enter OWNER_ACCESS_KEY to confirm this refund.");
      } else if (gate.reason === "missing_confirm") {
        setError("Tick the confirmation checkbox before refunding.");
      } else if (gate.reason === "fully_refunded") {
        setError("This test booking is fully refunded.");
      }
      return;
    }

    // Disable immediately — prevent double taps.
    setBusy(true);
    setError("");
    const submittedAmount = gate.amount;

    try {
      const result = await issueRefundTestRefund({
        ownerKey: savedKey,
        confirmOwnerKey: confirmKey.trim(),
        paymentReference: booking.paymentReference,
        amount: submittedAmount,
        refundFullRemaining: false,
        idempotencyKey: `refund-test-${booking.paymentReference}-${generateRefundOpId()}`,
      });
      if (!result.ok) {
        setError(result.error ?? "Refund failed");
        return;
      }

      const cumulative =
        typeof result.cumulativeRefunded === "number" ? result.cumulativeRefunded : submittedAmount;
      const remaining =
        typeof result.remainingBalance === "number" ? result.remainingBalance : 0;

      resetRefundForm();
      await load(savedKey);
      await loadDiagnostics({
        ...booking,
        amountRefunded: cumulative,
        remainingRefundable: remaining,
      });

      setMessage(
        result.alreadyProcessed
          ? `Already processed (idempotent).\nRefund amount: ${money(submittedAmount)}\nTotal refunded: ${money(cumulative)}\nRemaining refundable: ${money(remaining)}`
          : `Refund successful: ${money(submittedAmount)}\nTotal refunded: ${money(cumulative)}\nRemaining refundable: ${money(remaining)}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refund failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <OwnerPortalHeader variant="owner" title="Refund Test" />
      <main className="min-h-screen overflow-x-clip bg-navy pb-16 pt-[calc(4.75rem+env(safe-area-inset-top))] md:pt-[calc(4.5rem+env(safe-area-inset-top))]">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="mb-6 rounded-2xl border border-amber-400/40 bg-amber-500/15 p-4">
            <p className="text-sm font-bold uppercase tracking-wider text-amber-200">
              LIVE SUMUP TEST — REAL £1 PAYMENT AND REAL REFUND
            </p>
            <p className="mt-2 text-sm text-amber-50/90">
              Owner-only. Fixed £1.00 server-side. Does not change website fares. Does not create a
              customer journey, tracking link, or calendar event. Refunds use the same SumUp +
              REFUND_COORDINATOR path as production.
            </p>
          </div>

          <header className="mb-8">
            <p className="text-sm font-semibold uppercase tracking-widest text-sky-300">
              Owner tools · TEST BOOKING / REFUND TEST
            </p>
            <h1 className="mt-2 text-3xl font-bold text-white">£1 SumUp refund test</h1>
            <p className="mt-3 text-sm text-white/70">
              Pay £1 via SumUp Hosted Checkout, then issue partial refunds through one clear submit
              action. Not linked from public navigation.
            </p>
          </header>

          {!savedKey ? (
            <form onSubmit={unlock} className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <label className="block text-sm font-semibold text-white">
                OWNER_ACCESS_KEY
                <input
                  type="password"
                  value={ownerKey}
                  onChange={(event) => setOwnerKey(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-white/15 bg-navy px-3 py-3 text-white"
                  autoComplete="current-password"
                />
              </label>
              <button
                type="submit"
                className="mt-4 min-h-11 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-bold text-navy"
              >
                Unlock Refund Test
              </button>
            </form>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void startCheckout()}
                  className="min-h-11 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-navy disabled:opacity-60"
                >
                  {busy ? "Working…" : "Create £1.00 LIVE SumUp test checkout"}
                </button>
                <button
                  type="button"
                  disabled={busy || loading}
                  onClick={() => void load(savedKey)}
                  className="min-h-11 rounded-xl border border-white/20 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  Refresh list
                </button>
                <a
                  href="/owner/"
                  className="inline-flex min-h-11 items-center rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white/80"
                >
                  Back to Owner Dashboard
                </a>
              </div>

              {list ? (
                <p className="text-xs text-white/55">
                  REFUND_COORDINATOR: {list.coordinatorConfigured ? "YES" : "NO"} · SumUp secrets:{" "}
                  {list.sumUpConfigured ? "YES" : "NO"}
                </p>
              ) : null}

              {error ? (
                <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                  {error}
                </p>
              ) : null}
              {message ? (
                <p className="whitespace-pre-line rounded-xl border border-emerald/40 bg-emerald/15 px-4 py-3 text-sm font-semibold text-emerald">
                  {message}
                </p>
              ) : null}

              {list?.pendingCheckouts?.length ? (
                <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <h2 className="text-sm font-bold text-white">Pending test checkouts</h2>
                  <ul className="mt-3 space-y-2 text-sm text-white/75">
                    {list.pendingCheckouts.map((item) => (
                      <li key={item.checkoutId} className="font-mono text-xs">
                        {item.checkoutReference} · £{item.amount.toFixed(2)} · {item.createdAt}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section className="space-y-4">
                <h2 className="text-lg font-bold text-white">Paid refund-test bookings</h2>
                {loading && !list ? (
                  <p className="text-sm text-white/60">Loading…</p>
                ) : null}
                {(list?.bookings ?? []).length === 0 ? (
                  <p className="text-sm text-white/60">
                    No paid refund-test bookings yet. Create a £1 checkout above.
                  </p>
                ) : (
                  (list?.bookings ?? []).map((booking) => {
                    const open = selectedRef === booking.paymentReference;
                    const report = diagnostics[booking.paymentReference];
                    const fullyRefunded = booking.remainingRefundable < 0.01;
                    const parsedAmount = parseRefundTestAmountInput(
                      refundAmount,
                      booking.remainingRefundable,
                    );
                    const submitGate = canSubmitRefundTest({
                      amountRaw: refundAmount,
                      remainingRefundable: booking.remainingRefundable,
                      confirmOwnerKey: confirmKey,
                      finalConfirm,
                      busy,
                    });
                    const submitLabel =
                      busy && open
                        ? "Processing refund…"
                        : parsedAmount != null
                          ? `Refund ${money(parsedAmount)}`
                          : "Enter a valid amount";

                    return (
                      <article
                        key={booking.paymentReference}
                        className="rounded-2xl border border-amber-400/20 bg-amber-500/5 p-4"
                      >
                        <p className="text-xs font-semibold uppercase tracking-wider text-amber-200">
                          TEST BOOKING / REFUND TEST
                        </p>
                        <p className="mt-1 break-all font-mono text-sm text-white">
                          {booking.paymentReference}
                        </p>
                        <p className="mt-2 text-sm text-white/80">
                          Paid {money(booking.amountPaid)} · Already refunded{" "}
                          {money(booking.amountRefunded)} · Remaining refundable{" "}
                          {money(booking.remainingRefundable)}
                        </p>
                        <p className="mt-1 text-xs text-white/55">
                          Txn {booking.transactionId || "—"} · status {booking.status} · audits{" "}
                          {booking.refundHistoryCount}
                        </p>

                        {fullyRefunded ? (
                          <p className="mt-3 rounded-xl border border-emerald/40 bg-emerald/15 px-3 py-2 text-sm font-bold uppercase tracking-wide text-emerald">
                            Fully refunded
                          </p>
                        ) : null}

                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void loadDiagnostics(booking)}
                            className="min-h-11 rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-100 disabled:opacity-60"
                          >
                            Refund diagnostics
                          </button>
                          {!fullyRefunded ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                open ? resetRefundForm() : openRefundForm(booking)
                              }
                              className="min-h-11 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-100 disabled:opacity-60"
                            >
                              {open ? "Close refund" : "Issue test refund"}
                            </button>
                          ) : null}
                        </div>

                        {report ? (
                          <dl className="mt-3 grid gap-2 rounded-xl border border-white/10 bg-navy/50 p-3 text-xs text-white/75 sm:grid-cols-2">
                            <div>
                              <dt className="text-white/40">Coordinator</dt>
                              <dd>{report.coordinatorConfigured ? "YES" : "NO"}</dd>
                            </div>
                            <div>
                              <dt className="text-white/40">SumUp txn</dt>
                              <dd className="break-all font-mono">{report.transactionId || "—"}</dd>
                            </div>
                            <div>
                              <dt className="text-white/40">Paid / refunded / remaining</dt>
                              <dd>
                                {money(report.originalAmount)} / {money(report.amountRefunded)} /{" "}
                                {money(report.remainingRefundable)}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-white/40">Latest operation</dt>
                              <dd>
                                {report.latestRefundOperation?.operationState ?? "none"} · audit{" "}
                                {report.latestRefundOperation?.auditId ?? "—"}
                              </dd>
                            </div>
                          </dl>
                        ) : null}

                        {open && !fullyRefunded ? (
                          <div
                            className="mt-4 space-y-3 rounded-xl border border-red-400/25 bg-red-500/10 p-3"
                            data-refund-test-form="single-submit"
                          >
                            <p className="text-sm font-semibold text-red-100">
                              Confirm live SumUp refund (original payment method only)
                            </p>

                            <div className="rounded-lg border border-white/10 bg-navy/40 px-3 py-2 text-sm text-white/85">
                              <p>Paid {money(booking.amountPaid)}</p>
                              <p>Already refunded {money(booking.amountRefunded)}</p>
                              <p>Remaining refundable {money(booking.remainingRefundable)}</p>
                            </div>

                            <label className="block text-xs text-white/70">
                              Amount (GBP)
                              <input
                                type="number"
                                min="0.01"
                                step="0.01"
                                max={booking.remainingRefundable}
                                value={refundAmount}
                                onChange={(event) => setRefundAmount(event.target.value)}
                                className="mt-1 w-full rounded-lg border border-white/15 bg-navy px-3 py-2 text-white"
                                inputMode="decimal"
                                placeholder="e.g. 0.50"
                                data-refund-test-amount="true"
                              />
                            </label>

                            <button
                              type="button"
                              disabled={busy || booking.remainingRefundable < 0.01}
                              onClick={() =>
                                setRefundAmount(
                                  remainingBalanceFillValue(booking.remainingRefundable),
                                )
                              }
                              className="min-h-9 rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/85 disabled:opacity-60"
                              data-refund-test-fill-remaining="true"
                            >
                              Use remaining balance ({money(booking.remainingRefundable)})
                            </button>
                            <p className="text-[11px] text-white/50">
                              Fills the Amount field only — does not submit a refund.
                            </p>

                            {parsedAmount != null ? (
                              <p className="rounded-lg border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-50">
                                You are about to refund {money(parsedAmount)} to the original
                                payment method.
                              </p>
                            ) : (
                              <p className="text-xs text-white/55">
                                Enter an amount greater than £0 and not more than remaining
                                refundable.
                              </p>
                            )}

                            <label className="block text-xs text-white/70">
                              Re-enter OWNER_ACCESS_KEY
                              <input
                                type="password"
                                value={confirmKey}
                                onChange={(event) => setConfirmKey(event.target.value)}
                                className="mt-1 w-full rounded-lg border border-white/15 bg-navy px-3 py-2 text-white"
                                autoComplete="off"
                              />
                            </label>

                            <label className="flex items-start gap-2 text-xs text-white/80">
                              <input
                                type="checkbox"
                                checked={finalConfirm}
                                onChange={(event) => setFinalConfirm(event.target.checked)}
                                className="mt-0.5"
                              />
                              I confirm a LIVE SumUp refund of{" "}
                              {parsedAmount != null ? money(parsedAmount) : "the entered amount"}{" "}
                              to the original payment method for this REFUND TEST booking only.
                            </label>

                            {/* Exactly one refund submit control */}
                            <button
                              type="button"
                              data-refund-test-submit="true"
                              disabled={!submitGate.ok}
                              onClick={() => void submitRefund(booking)}
                              className="min-h-11 w-full rounded-xl bg-red-500 px-3 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
                            >
                              {submitLabel}
                            </button>
                          </div>
                        ) : null}
                      </article>
                    );
                  })
                )}
              </section>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
