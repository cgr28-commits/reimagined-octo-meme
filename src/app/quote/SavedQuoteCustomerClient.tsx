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
    const token = new URLSearchParams(location.hash.slice(1)).get("t") || new URLSearchParams(location.search).get("t") || "";
    if (location.search) history.replaceState(null,"",`${location.pathname}#t=${encodeURIComponent(token)}`);
    let cancelled = false;
    fetchSavedQuoteByToken(token).then(result => {
      if (cancelled) return;
      if (result.ok) setQuote(result.quote);
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
  const summary = <div data-saved-quote-summary className="mx-auto mt-4 max-w-xl rounded-2xl border border-white/20 bg-white/[0.06] p-4 text-left text-white sm:p-5">
    {quote.heldPrice ? <>
      <p className="break-words text-sm text-white/80">{quote.reference}</p>
      <p className="mt-1 text-lg font-bold">Fixed price {quote.heldPrice.amountLabel}</p>
      <p className="mt-1 text-sm text-white/85">Your price is held until {quote.heldPrice.heldUntilLabel}. Your journey is not booked yet.</p>
      <a className="btn-primary mt-4 block w-full text-center" href={quote.heldPrice.bookingUrl} referrerPolicy="no-referrer">Book at {quote.heldPrice.amountLabel}</a>
      <p className="mt-3 text-xs text-white/70">Need to change the date, time or other details? Edit your journey below. A changed journey is priced again.</p>
    </> : <>
      <p className="break-words text-sm text-white/80">{quote.reference}</p>
      <p className="mt-1 text-lg font-bold">Original fare {quote.amountLabel}</p>
      <p className="mt-1 text-sm text-white/85">{savedQuoteHasSchedule(j)
        ? `Retrieve until ${quote.expiresAtLabel}. Your fare is recalculated using current prices. Your journey is not booked yet.`
        : `Retrieve until ${quote.expiresAtLabel}. ${SAVED_QUOTE_ADD_SCHEDULE_COPY} Your journey is not booked yet.`}</p>
    </>}
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
