"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  acceptAlternativeShortNoticeTime,
  declineAlternativeShortNoticeTime,
  fetchPublicAlternativeOffer,
  type PublicAlternativeOfferSummary,
} from "@/lib/short-notice-api";
import { isSumUpPaymentEnabled } from "@/lib/create-payment";
import { SITE } from "@/lib/data";

function readTokenFromLocation(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("token")?.trim() ?? "";
}

function AcceptAlternativeInner() {
  const searchParams = useSearchParams();
  const [token, setToken] = useState(() => searchParams.get("token")?.trim() ?? "");
  const [offer, setOffer] = useState<PublicAlternativeOfferSummary | null>(null);
  const [customerNote, setCustomerNote] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<"accept" | "decline" | "">("");
  const [outcome, setOutcome] = useState<"accepted" | "declined" | "">("");
  const [acceptedPayUrl, setAcceptedPayUrl] = useState("");
  const [alreadyAccepted, setAlreadyAccepted] = useState(false);
  const [alreadyDeclined, setAlreadyDeclined] = useState(false);
  const [paymentEmailSent, setPaymentEmailSent] = useState(false);
  const [submittedNote, setSubmittedNote] = useState("");

  useEffect(() => {
    const fromUrl = searchParams.get("token")?.trim() ?? readTokenFromLocation();
    setToken(fromUrl);
  }, [searchParams]);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setOffer(null);
      setError("This page needs a secure link from your email.");
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const next = await fetchPublicAlternativeOffer(token);
        if (!cancelled) {
          setOffer(next);
          if (next.alreadyPaid) {
            setOutcome("accepted");
            setAlreadyAccepted(true);
          } else if (next.alreadyAccepted) {
            setAlreadyAccepted(true);
            setOutcome("accepted");
          } else if (next.alreadyDeclined) {
            setAlreadyDeclined(true);
            setOutcome("declined");
            if (next.customerResponseNote) setSubmittedNote(next.customerResponseNote);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "This link is no longer valid.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleAccept() {
    if (!token || !offer?.acceptPending) return;
    setSubmitting("accept");
    setError("");
    try {
      const result = await acceptAlternativeShortNoticeTime(token, customerNote);
      setAcceptedPayUrl(result.payUrl);
      setAlreadyAccepted(Boolean(result.alreadyAccepted));
      setPaymentEmailSent(result.paymentEmailSent);
      setSubmittedNote(customerNote.trim());
      setOutcome("accepted");
      setOffer((current) =>
        current
          ? {
              ...current,
              status: "SHORT_NOTICE_APPROVED",
              acceptPending: false,
              alreadyAccepted: true,
              alreadyDeclined: false,
            }
          : current,
      );
      if (result.payUrl && isSumUpPaymentEnabled()) {
        window.location.assign(result.payUrl);
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not accept alternative time");
    } finally {
      setSubmitting("");
    }
  }

  async function handleDecline() {
    if (!token || !offer?.acceptPending) return;
    setSubmitting("decline");
    setError("");
    try {
      const result = await declineAlternativeShortNoticeTime(token, customerNote);
      setAlreadyDeclined(Boolean(result.alreadyDeclined));
      setSubmittedNote(customerNote.trim());
      setOutcome("declined");
      setOffer((current) =>
        current
          ? {
              ...current,
              status: "SHORT_NOTICE_ALTERNATIVE_DECLINED",
              acceptPending: false,
              alreadyDeclined: true,
              alreadyAccepted: false,
            }
          : current,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not decline alternative time");
    } finally {
      setSubmitting("");
    }
  }

  const sumUpLive = isSumUpPaymentEnabled();
  const showActions = Boolean(offer?.acceptPending && !outcome);
  const quoteUrl = `${SITE.url.replace(/\/$/, "")}/#get-quote`;

  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-navy-light/80 p-6 sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-wider text-amber-200">
        Alternative pickup time
      </p>
      <h1 className="mt-2 text-2xl font-bold text-white">Respond to your new pickup time</h1>

      {loading ? (
        <p className="mt-6 text-sm text-white/60">Loading offer…</p>
      ) : error && !offer ? (
        <div className="mt-6 space-y-3">
          <p className="text-sm text-red-300" role="alert">
            {error}
          </p>
          <p className="text-sm text-white/60">
            If you still need a pickup, reply to your email or contact us on WhatsApp. Do not use an
            old link after an offer has been withdrawn or replaced.
          </p>
          <a
            href={quoteUrl}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-white"
          >
            Request another journey/time
          </a>
        </div>
      ) : offer ? (
        <div className="mt-6 space-y-4 text-sm text-white/75">
          {offer.alreadyPaid ||
          (error && /already been paid/i.test(error)) ? (
            <div className="rounded-xl border border-emerald/30 bg-emerald/10 p-4">
              <p className="font-semibold text-emerald">
                This booking has already been paid and confirmed.
              </p>
            </div>
          ) : null}

          <p>
            <span className="text-white/45">Original requested pickup</span>
            <br />
            <span className="font-semibold text-white">
              {offer.requestedDate} · {offer.requestedTime}
            </span>
          </p>
          <p>
            <span className="text-white/45">New pickup time offered</span>
            <br />
            <span className="font-semibold text-emerald">
              {offer.offeredDate ?? "—"} · {offer.offeredTime ?? "—"}
            </span>
          </p>
          <p>
            <span className="text-white/45">Journey</span>
            <br />
            <span className="font-semibold text-white">
              {offer.pickupLabel} → {offer.dropoffLabel}
            </span>
          </p>
          <p>
            <span className="text-white/45">Price</span>
            <br />
            <span className="text-xl font-bold text-white">{offer.amountLabel}</span>
          </p>
          {offer.offeredNote ? (
            <p className="rounded-xl border border-white/10 bg-navy/50 p-3 text-white/70">
              <span className="text-white/45">Note from us</span>
              <br />
              {offer.offeredNote}
            </p>
          ) : null}

          {error && !/already been paid/i.test(error) ? (
            <p className="text-sm text-red-300" role="alert">
              {error}
            </p>
          ) : null}

          {showActions ? (
            <>
              <label className="block text-sm text-white/70">
                Message for your driver (optional)
                <textarea
                  value={customerNote}
                  onChange={(event) => setCustomerNote(event.target.value.slice(0, 500))}
                  rows={3}
                  maxLength={500}
                  placeholder="e.g. This time works for me, or I could travel after 10:30am instead."
                  className="mt-1 block w-full rounded-xl border border-white/20 bg-navy px-3 py-2 text-base text-white outline-none placeholder:text-white/35 focus:border-emerald"
                />
              </label>
              <button
                type="button"
                disabled={Boolean(submitting)}
                onClick={() => void handleAccept()}
                className="mt-2 flex min-h-12 w-full items-center justify-center rounded-xl bg-emerald px-5 py-3 text-base font-bold text-navy disabled:opacity-60"
              >
                {submitting === "accept" ? "Confirming…" : "Accept new pickup time & pay"}
              </button>
              <button
                type="button"
                disabled={Boolean(submitting)}
                onClick={() => void handleDecline()}
                className="flex min-h-12 w-full items-center justify-center rounded-xl border border-white/25 bg-transparent px-5 py-3 text-base font-semibold text-white disabled:opacity-60"
              >
                {submitting === "decline" ? "Sending…" : "Decline new pickup time"}
              </button>
              <p className="text-xs text-white/45">
                No payment will be taken unless you accept and complete payment. Opening this page
                does not accept or decline the offer.
              </p>
            </>
          ) : null}

          {!offer.acceptPending && !outcome ? (
            <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-amber-100">
              This alternative-time offer is no longer open. It may have been withdrawn or replaced.
              Please wait for a new email from us, or contact us on WhatsApp.
            </p>
          ) : null}

          {outcome === "accepted" && !offer.alreadyPaid ? (
            <div className="rounded-xl border border-emerald/30 bg-emerald/10 p-4">
              <p className="font-semibold text-emerald">
                {alreadyAccepted && !acceptedPayUrl
                  ? "This offer was already accepted."
                  : "Thanks — your new pickup time is confirmed."}
              </p>
              <p className="mt-2 text-white/70">
                {paymentEmailSent
                  ? "A secure payment link has been emailed to you."
                  : "Your booking is now approved and awaiting payment."}
              </p>
              {acceptedPayUrl ? (
                sumUpLive ? (
                  <a
                    href={acceptedPayUrl}
                    className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald px-4 py-2 text-sm font-bold text-navy"
                  >
                    Continue to secure payment
                  </a>
                ) : (
                  <p className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-amber-100">
                    Preview/test environment: online card payment (SumUp) is not fully available
                    here. Your acceptance was recorded and the payment-link email uses the secure
                    pay page URL for this preview.
                  </p>
                )
              ) : (
                <p className="mt-3 text-xs text-white/55">
                  Check your email for the payment link, or contact us on WhatsApp if you need help.
                </p>
              )}
            </div>
          ) : null}

          {outcome === "declined" ? (
            <div className="rounded-xl border border-white/15 bg-navy/50 p-4">
              <p className="font-semibold text-white">
                {alreadyDeclined
                  ? "Thanks — we already have your decline."
                  : "Thanks for letting us know."}
              </p>
              <p className="mt-2 text-white/70">
                We won’t proceed with the alternative pickup time and no payment has been taken.
              </p>
              {submittedNote ? (
                <p className="mt-3 text-white/70">
                  If you suggested another suitable time, we’ll review your message and contact you
                  if we can accommodate it.
                </p>
              ) : null}
              <a
                href={quoteUrl}
                className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald px-4 py-2 text-sm font-bold text-navy"
              >
                Request another journey/time
              </a>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function AcceptAlternativeTimeClient() {
  return (
    <Suspense
      fallback={
        <p className="mx-auto max-w-lg text-center text-sm text-white/60">Loading…</p>
      }
    >
      <AcceptAlternativeInner />
    </Suspense>
  );
}
