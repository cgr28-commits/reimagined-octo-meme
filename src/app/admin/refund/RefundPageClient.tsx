"use client";

import { FormEvent, useEffect, useState } from "react";
import Footer from "@/components/Footer";
import OwnerPortalHeader from "@/components/OwnerPortalHeader";
import { issueBookingRefund, type RefundIssueResponse } from "@/lib/refund-api";

const OWNER_KEY_STORAGE = "matni-owner-key";

export default function RefundPageClient() {
  const [ownerKey, setOwnerKey] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<RefundIssueResponse | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem(OWNER_KEY_STORAGE);
    if (stored) {
      setOwnerKey(stored);
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setResult(null);

    try {
      sessionStorage.setItem(OWNER_KEY_STORAGE, ownerKey.trim());
      const response = await issueBookingRefund({
        ownerKey: ownerKey.trim(),
        paymentReference: paymentReference.trim(),
      });

      if (!response.ok) {
        setError(response.error ?? "Refund could not be completed.");
        return;
      }

      setResult(response);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Refund could not be completed.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <OwnerPortalHeader variant="admin" title="Owner tools" />
      <main className="min-h-screen overflow-x-clip bg-navy pb-16 pt-[calc(4.75rem+env(safe-area-inset-top))] md:pt-[calc(4.5rem+env(safe-area-inset-top))]">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
          <header className="mb-8">
            <p className="text-sm font-semibold uppercase tracking-widest text-amber-300">
              Owner tools
            </p>
            <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Issue refund</h1>
            <p className="mt-3 text-sm leading-relaxed text-white/70">
              Refund a paid SumUp booking, email the customer a confirmation, remove the calendar
              entry, and cancel the driver tracking job.
            </p>
          </header>

          <form
            onSubmit={(event) => void handleSubmit(event)}
            className="space-y-5 rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8"
          >
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-white/80">Owner access key</span>
              <input
                type="password"
                required
                value={ownerKey}
                onChange={(event) => setOwnerKey(event.target.value)}
                placeholder="Same key as driver dashboard unless you set OWNER_ACCESS_KEY"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/30 outline-none transition-colors focus:border-emerald/50 focus:ring-1 focus:ring-emerald/30"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-white/80">
                Payment reference
              </span>
              <input
                type="text"
                required
                value={paymentReference}
                onChange={(event) => setPaymentReference(event.target.value)}
                placeholder="SumUp transaction code from invoice or driver dashboard"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/30 outline-none transition-colors focus:border-emerald/50 focus:ring-1 focus:ring-emerald/30"
              />
            </label>

            {error && (
              <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {error}
              </p>
            )}

            {result && (
              <div className="rounded-xl border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm text-white/85">
                {result.alreadyRefunded ? (
                  <p>This booking was already refunded ({result.refundAmount}).</p>
                ) : (
                  <>
                    <p className="font-semibold text-white">
                      Refund issued: {result.refundAmount}
                    </p>
                    <ul className="mt-2 space-y-1 text-white/75">
                      <li>Customer email: {result.customerEmailSent ? "sent" : "failed"}</li>
                      <li>Owner email: {result.ownerEmailSent ? "sent" : "failed"}</li>
                      <li>
                        Calendar events cancelled:{" "}
                        {result.calendarCancelled ?? result.calendarDeleted ?? 0}
                      </li>
                      <li>Tracking job removed: {result.trackingRemoved ? "yes" : "no"}</li>
                    </ul>
                  </>
                )}
                {result.warnings && result.warnings.length > 0 && (
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-amber-100">
                    {result.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-emerald px-6 py-4 text-sm font-bold text-navy transition-colors hover:bg-emerald-light disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitting ? "Processing refund…" : "Issue full refund"}
            </button>
          </form>

          <p className="mt-6 text-xs leading-relaxed text-white/45">
            Use the SumUp transaction code shown on the customer invoice or in your driver
            dashboard. Refunds return to the customer&apos;s original card via SumUp.
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
