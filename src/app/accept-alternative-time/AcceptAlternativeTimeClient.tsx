"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  acceptAlternativeShortNoticeTime,
  fetchPublicAlternativeOffer,
  type PublicAlternativeOfferSummary,
} from "@/lib/short-notice-api";
import { isSumUpPaymentEnabled } from "@/lib/create-payment";

function readTokenFromLocation(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("token")?.trim() ?? "";
}

function AcceptAlternativeInner() {
  const searchParams = useSearchParams();
  const [token, setToken] = useState(() => searchParams.get("token")?.trim() ?? "");
  const [offer, setOffer] = useState<PublicAlternativeOfferSummary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [acceptedPayUrl, setAcceptedPayUrl] = useState("");
  const [alreadyAccepted, setAlreadyAccepted] = useState(false);
  const [paymentEmailSent, setPaymentEmailSent] = useState(false);

  useEffect(() => {
    const fromUrl = searchParams.get("token")?.trim() ?? readTokenFromLocation();
    setToken(fromUrl);
  }, [searchParams]);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setOffer(null);
      setError("This page needs a secure acceptance link from your email.");
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
          if (next.alreadyAccepted) {
            setAlreadyAccepted(true);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "This acceptance link is no longer valid.",
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
    setAccepting(true);
    setError("");
    try {
      const result = await acceptAlternativeShortNoticeTime(token);
      setAcceptedPayUrl(result.payUrl);
      setAlreadyAccepted(Boolean(result.alreadyAccepted));
      setPaymentEmailSent(result.paymentEmailSent);
      setOffer((current) =>
        current
          ? {
              ...current,
              status: "SHORT_NOTICE_APPROVED",
              acceptPending: false,
              alreadyAccepted: true,
            }
          : current,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not accept alternative time");
    } finally {
      setAccepting(false);
    }
  }

  const sumUpLive = isSumUpPaymentEnabled();
  const confirmed = Boolean(acceptedPayUrl || alreadyAccepted || offer?.alreadyAccepted);

  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-navy-light/80 p-6 sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-wider text-amber-200">
        Alternative pickup time
      </p>
      <h1 className="mt-2 text-2xl font-bold text-white">Confirm your new pickup time</h1>

      {loading ? (
        <p className="mt-6 text-sm text-white/60">Loading offer…</p>
      ) : error && !offer ? (
        <div className="mt-6 space-y-3">
          <p className="text-sm text-red-300" role="alert">
            {error}
          </p>
          <p className="text-sm text-white/60">
            If you still need a pickup, reply to your email or contact us on WhatsApp. Do not use an
            old acceptance link after an offer has been withdrawn or replaced.
          </p>
        </div>
      ) : offer ? (
        <div className="mt-6 space-y-4 text-sm text-white/75">
          <p>
            <span className="text-white/45">Booking reference</span>
            <br />
            <span className="font-semibold text-white">{offer.reference}</span>
          </p>
          <p>
            <span className="text-white/45">Journey</span>
            <br />
            <span className="font-semibold text-white">
              {offer.pickupLabel} → {offer.dropoffLabel}
            </span>
          </p>
          <p>
            <span className="text-white/45">Originally requested</span>
            <br />
            {offer.requestedDate} · {offer.requestedTime}
          </p>
          <p>
            <span className="text-white/45">Offered alternative</span>
            <br />
            <span className="font-semibold text-emerald">
              {offer.offeredDate} · {offer.offeredTime}
            </span>
          </p>
          <p>
            <span className="text-white/45">Amount due (unchanged)</span>
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

          {error ? (
            <p className="text-sm text-red-300" role="alert">
              {error}
            </p>
          ) : null}

          {!offer.acceptPending && !confirmed ? (
            <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-amber-100">
              This alternative-time offer is no longer open for acceptance. It may have been
              withdrawn or replaced. Please wait for a new email from us, or contact us on WhatsApp.
            </p>
          ) : null}

          {offer.acceptPending ? (
            <button
              type="button"
              disabled={accepting}
              onClick={() => void handleAccept()}
              className="mt-2 flex min-h-12 w-full items-center justify-center rounded-xl bg-emerald px-5 py-3 text-base font-bold text-navy disabled:opacity-60"
            >
              {accepting ? "Confirming…" : "Accept new pickup time"}
            </button>
          ) : null}

          {confirmed ? (
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
                    Pay securely now
                  </a>
                ) : (
                  <p className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-amber-100">
                    Preview/test environment: online card payment (SumUp) is not fully available
                    here. Your acceptance was recorded and the payment-link email uses the secure
                    pay page URL for this preview. Use that link once payment is configured, or
                    contact us on WhatsApp.
                  </p>
                )
              ) : (
                <p className="mt-3 text-xs text-white/55">
                  Check your email for the payment link, or contact us on WhatsApp if you need help.
                </p>
              )}
            </div>
          ) : null}

          <p className="text-xs text-white/45">
            Payment is not taken until after you accept. Accepting again will not create a duplicate
            booking or payment.
          </p>
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
