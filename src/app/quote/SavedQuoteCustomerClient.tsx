"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import HeroSlideshow from "@/components/HeroSlideshow";
import { fetchSavedQuoteByToken, type SavedQuotePublicSummary } from "@/lib/saved-quote-api";
import type { SelectedPlace } from "@/lib/selected-place";
import { SAVED_QUOTE_ADD_SCHEDULE_COPY, savedQuoteHasSchedule } from "../../../shared/saved-quote";
export default function SavedQuoteCustomerClient() {
  const [quote,setQuote] = useState<SavedQuotePublicSummary | null>(null);
  const [error,setError] = useState("");
  useEffect(() => {
    // Fragment tokens never reach static hosting logs or referrer headers. Old query links still work.
    const hash = new URLSearchParams(location.hash.slice(1));
    const token = hash.get("t") || new URLSearchParams(location.search).get("t") || "";
    // "Change my journey" from the payment page comes back with edit=1: show the editable quote.
    const editing = hash.get("edit") === "1";
    if (location.search) history.replaceState(null,"",`${location.pathname}#t=${encodeURIComponent(token)}`);
    let cancelled = false;
    fetchSavedQuoteByToken(token).then(result => {
      if (cancelled) return;
      if (result.ok) {
        // A price still held: go straight to the payment page (owner, 13 Nov 2026), keeping a way back.
        const held = result.quote.heldPrice;
        if (held?.bookingUrl && !editing) {
          try {
            const target = new URL(held.bookingUrl, location.origin);
            const sameSite = target.origin === location.origin || /(^|\.)myairporttaxini\.co\.uk$/.test(target.hostname);
            if (sameSite) {
              location.replace(`${location.origin}${target.pathname}${target.search}#change=${encodeURIComponent(token)}`);
              return;
            }
          } catch { /* fall through to the quote page */ }
        }
        setQuote(result.quote);
      }
      else setError(result.error === "expired" ? "Your saved quote has expired. Please get a new quote." : result.message || "This saved quote is unavailable. Please get a new quote.");
    }).catch(() => { if (!cancelled) setError("We couldn’t retrieve your quote. Please try again."); });
    return () => { cancelled = true; };
  }, []);
  if (error) return <div className="mx-auto max-w-lg px-4 pb-16 pt-36 text-center text-white md:pt-40"><p role="alert">{error}</p><Link className="btn-primary mt-4 inline-block" href="/#quote">Get a new quote</Link></div>;
  if (!quote) return <p role="status" className="px-4 pb-16 pt-36 text-center text-white md:pt-40">Retrieving your quote…</p>;
  const j = quote.journey;
  const place = (pickup: boolean): SelectedPlace => ({
    placeId: (pickup ? j.pickupPlaceId : j.dropoffPlaceId) || "",
    formattedAddress: pickup ? j.pickupLabel : j.dropoffLabel,
    lat: (pickup ? j.pickupLat : j.dropoffLat) ?? null,
    lng: (pickup ? j.pickupLng : j.dropoffLng) ?? null,
    countryCode: (pickup ? j.pickupCountryCode : j.dropoffCountryCode) || null,
    postalCode: (pickup ? j.pickupPostalCode : j.dropoffPostalCode) || null,
    placeName: (pickup ? j.pickupPlaceName : j.dropoffPlaceName) || null,
    streetNumber: (pickup ? j.pickupStreetNumber : j.dropoffStreetNumber) || null,
  });
  const summary = <div data-saved-quote-summary className="mx-auto flex max-w-[1400px] flex-col gap-3 rounded-2xl border border-emerald/40 bg-[#0b2a52] p-4 text-left text-white sm:flex-row sm:items-center sm:justify-between sm:gap-5 sm:p-5">
    {quote.heldPrice ? <>
      <div className="min-w-0">
        <p className="text-base font-bold">Your saved quote · {quote.heldPrice.amountLabel}</p>
        <p className="mt-1 text-sm text-white/85">Ref {quote.reference}. Price held until {quote.heldPrice.heldUntilLabel}. Not booked yet.</p>
        <p className="mt-1 text-xs text-white/70">Want to change something? Edit your journey below; a changed journey is priced again.</p>
      </div>
      <a className="btn-primary block shrink-0 text-center sm:inline-block" href={quote.heldPrice.bookingUrl} referrerPolicy="no-referrer">Book at {quote.heldPrice.amountLabel}</a>
    </> : <div className="min-w-0">
      <p className="text-base font-bold">Your saved quote · original fare {quote.amountLabel}</p>
      <p className="mt-1 text-sm text-white/85">Ref {quote.reference}. {savedQuoteHasSchedule(j)
        ? `Retrieve until ${quote.expiresAtLabel}. Your fare is recalculated using current prices. Not booked yet.`
        : `Retrieve until ${quote.expiresAtLabel}. ${SAVED_QUOTE_ADD_SCHEDULE_COPY} Not booked yet.`}</p>
    </div>}
  </div>;
  return <HeroSlideshow
    heading="Your saved quote"
    intro="Your journey details are filled in below."
    belowIntro={summary}
    journey={{
      airportCode: j.airportCode || "",
      direction: j.isFromAirport ? "from-airport" : "to-airport",
      addressHint: j.isFromAirport ? j.dropoffLabel : j.pickupLabel,
    }}
    restore={{
      quote,
      journeyIntent: j.isAirportTrip ? j.isFromAirport ? "from-airport" : "to-airport" : "address-to-address",
      pickupPlace: place(true),
      dropoffPlace: place(false),
      dropoffHint: j.dropoffLabel,
    }}
  />;
}
