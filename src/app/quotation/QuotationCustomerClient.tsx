"use client";

import { useEffect, useState } from "react";
import type { BespokeQuotePublicView } from "../../../shared/bespoke-quote";
import { formatUkDate, formatUkInstant } from "../../../shared/uk-time";
import { declineBespokeQuotation, fetchBespokeQuotation } from "@/lib/bespoke-quote-api";
import { whatsAppChatUrl } from "@/lib/contact-card";
import { SITE } from "@/lib/data";

const STORAGE_KEY = "matni-bespoke-quotation-token";

/** Read the token from #t=… once, keep it for this tab only, and strip it from the address bar. */
function takeToken(): string {
  if (typeof window === "undefined") return "";
  const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("t")?.trim() ?? "";
  if (fromHash) {
    try {
      sessionStorage.setItem(STORAGE_KEY, fromHash);
    } catch {
      // Private mode: the token still works for this page view.
    }
    window.history.replaceState(null, "", window.location.pathname);
    return fromHash;
  }
  try {
    return sessionStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export default function QuotationCustomerClient() {
  const [token, setToken] = useState("");
  const [quote, setQuote] = useState<BespokeQuotePublicView | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "invalid" | "error">("loading");
  const [declining, setDeclining] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const t = takeToken();
    setToken(t);
    if (!t) {
      setState("invalid");
      return;
    }
    fetchBespokeQuotation(t)
      .then((data) => {
        setQuote(data.quote);
        setState("ready");
      })
      .catch((e: { status?: number }) => setState(e?.status === 404 ? "invalid" : "error"));
  }, []);

  const contact = (
    <p className="mt-4 text-sm text-white/70">
      Call {SITE.officeLandlineDisplay} or{" "}
      <a className="text-emerald underline" href={whatsAppChatUrl()} rel="noreferrer">
        WhatsApp us
      </a>
      {quote ? ` quoting ${quote.reference}.` : "."}
    </p>
  );

  if (state === "loading") return <p className="mx-auto max-w-lg text-center text-white/70">Loading your quotation…</p>;
  if (state !== "ready" || !quote) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-white">
        <h1 className="text-xl font-bold">
          {state === "invalid" ? "This quotation link is not available" : "We couldn't load your quotation"}
        </h1>
        <p className="mt-2 text-sm text-white/75">
          {state === "invalid"
            ? "The link may have been replaced by a newer one, or it may have expired. Please use the most recent email from us."
            : "Please try again in a moment."}
        </p>
        {contact}
      </div>
    );
  }

  const j = quote.journey;
  return (
    <div className="mx-auto max-w-lg space-y-4 text-white">
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald">{quote.categoryLabel}</p>
        <h1 className="mt-1 text-2xl font-bold">Hi {quote.customerFirstName}, here is your quotation</h1>
        <p className="mt-1 text-sm text-white/70">{quote.statusLabel}</p>
        {quote.quote ? (
          <div className="mt-4 rounded-xl border border-emerald/30 bg-emerald/10 p-4">
            <p className="text-3xl font-bold">£{quote.quote.amountGbp.toFixed(2)}</p>
            <p className="mt-1 text-sm text-white/80">Valid until {formatUkInstant(quote.quote.expiresAt)}</p>
            {quote.quote.customerMessage ? <p className="mt-3 whitespace-pre-line text-sm">{quote.quote.customerMessage}</p> : null}
          </div>
        ) : null}
      </div>

      <dl className="space-y-1 rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-sm">
        {quote.event ? <Row label="Event" value={`${quote.event.title}, ${quote.event.venue} (${formatUkDate(quote.event.date)})`} /> : null}
        {quote.serviceTypeLabel ? <Row label="Service" value={quote.serviceTypeLabel} /> : null}
        <Row label="Pickup" value={j.pickupAddress} />
        <Row label="Destination" value={j.destinationAddress} />
        <Row label="Date and time" value={`${formatUkDate(j.date)} at ${j.time}`} />
        {j.returnJourney ? <Row label="Return" value={`${formatUkDate(j.returnDate ?? "")} at ${j.returnTime ?? ""}`} /> : null}
        {j.additionalStops.length ? <Row label="Stops" value={j.additionalStops.join("; ")} /> : null}
        <Row label="Passengers" value={String(j.passengers)} />
        <Row label="Reference" value={quote.reference} />
      </dl>

      {quote.quote?.payable ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-sm">
          <p className="font-semibold">To accept this quotation, please contact us.</p>
          <p className="mt-1 text-white/70">Your booking is only confirmed once payment has been completed and we have confirmed it.</p>
          {contact}
          <button
            type="button"
            disabled={declining}
            className="mt-4 min-h-11 w-full rounded-xl border border-white/20 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
            onClick={async () => {
              if (!window.confirm("Decline this quotation?")) return;
              setDeclining(true);
              try {
                const data = await declineBespokeQuotation(token);
                setQuote(data.quote);
                setNotice("Thank you — we've recorded that you don't need this quotation.");
              } catch (e) {
                setNotice(e instanceof Error ? e.message : "Something went wrong.");
              } finally {
                setDeclining(false);
              }
            }}
          >
            No thanks, decline this quotation
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-sm">{contact}</div>
      )}
      {notice ? (
        <p role="status" className="text-sm text-white/80">
          {notice}
        </p>
      ) : null}
      <p className="text-xs text-white/50">This page is private to you. Please don&apos;t share the link.</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2">
      <dt className="text-white/55">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </div>
  );
}
