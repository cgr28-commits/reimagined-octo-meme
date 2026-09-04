"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import QuoteCard from "@/components/QuoteCard";
import { fetchReturnOfferByToken } from "@/lib/return-offer-api";
import type { ReturnOfferPublicSnapshot } from "../../../shared/return-offer";

type TripDirection = "to-airport" | "from-airport";

function readTokenFromLocation(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("returnOffer")?.trim() ?? "";
}

function ReturnOfferInner() {
  const searchParams = useSearchParams();
  const [token, setToken] = useState(
    () => searchParams.get("returnOffer")?.trim() ?? "",
  );
  const [quote, setQuote] = useState<ReturnOfferPublicSnapshot | null>(null);
  const [error, setError] = useState("");
  const [state, setState] = useState<"loading" | "ok" | "invalid">("loading");

  useEffect(() => {
    setToken(searchParams.get("returnOffer")?.trim() ?? readTokenFromLocation());
  }, [searchParams]);

  useEffect(() => {
    if (!token) {
      setState("invalid");
      setError("This return offer link is invalid or no longer available.");
      return;
    }
    let cancelled = false;
    (async () => {
      setState("loading");
      const loaded = await fetchReturnOfferByToken(token);
      if (cancelled) return;
      if (!loaded.ok) {
        setState("invalid");
        setError(loaded.error);
        setQuote(null);
        return;
      }
      setQuote(loaded.quote);
      setState("ok");
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state === "loading") {
    return (
      <p className="text-center text-sm text-white/70">Loading your return journey…</p>
    );
  }

  if (state === "invalid" || !quote) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-navy/60 p-6 text-center">
        <p className="text-sm font-semibold text-white">Return offer unavailable</p>
        <p className="mt-2 text-sm text-white/70">{error}</p>
        <Link href="/#quote" className="btn-primary mt-5 inline-flex">
          Get a live quote
        </Link>
      </div>
    );
  }

  const direction: TripDirection =
    quote.direction === "airport_to_local" ? "to-airport" : "from-airport";
  const localAddress = quote.localAddressLabel;

  return (
    <QuoteCard
      initialAirportCode={quote.airportCode}
      initialDirection={direction}
      initialAddressHint={localAddress}
      returnOfferToken={token}
    />
  );
}

export default function ReturnOfferBookClient() {
  return (
    <Suspense
      fallback={
        <p className="text-center text-sm text-white/70">Loading your return journey…</p>
      }
    >
      <ReturnOfferInner />
    </Suspense>
  );
}
