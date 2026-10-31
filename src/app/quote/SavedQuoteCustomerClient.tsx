"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import QuoteCard from "@/components/QuoteCard";
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
  if (error) return <div className="mx-auto max-w-lg text-white"><p role="alert">{error}</p><Link className="btn-primary mt-4 inline-block" href="/#quote">Get a new quote</Link></div>;
  if (!quote) return <p role="status" className="text-center text-white">Retrieving your quote…</p>;
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
  return <div className="mx-auto max-w-3xl">
    <div className="mb-4 rounded-xl border border-white/20 p-4 text-white">
      <h1 className="text-xl font-bold">Your saved quote</h1>
      {quote.heldPrice ? <>
        <p className="mt-2 break-words">{quote.reference} · Fixed price {quote.heldPrice.amountLabel}</p>
        <p className="mt-2 text-sm">Your price of {quote.heldPrice.amountLabel} is held until {quote.heldPrice.heldUntilLabel}. Your journey is not booked yet.</p>
        <a className="btn-primary mt-4 block w-full text-center sm:inline-block sm:w-auto" href={quote.heldPrice.bookingUrl} referrerPolicy="no-referrer">Book at {quote.heldPrice.amountLabel}</a>
        <p className="mt-3 text-xs text-white/70">Need to change the date, time or other details? Edit your journey below. A changed journey is priced again.</p>
      </> : <>
        <p className="mt-2 break-words">{quote.reference} · Original fare {quote.amountLabel}</p>
        <p className="mt-2 text-sm">{savedQuoteHasSchedule(j)
          ? `Retrieve until ${quote.expiresAtLabel}. Your fare is recalculated using current prices. Your journey is not booked yet.`
          : `Retrieve until ${quote.expiresAtLabel}. ${SAVED_QUOTE_ADD_SCHEDULE_COPY} Your journey is not booked yet.`}</p>
      </>}
    </div>
    <QuoteCard restoredQuote={quote} initialAirportCode={j.airportCode || ""}
      initialDirection={j.isFromAirport ? "from-airport" : "to-airport"}
      initialJourneyIntent={j.isAirportTrip ? j.isFromAirport ? "from-airport" : "to-airport" : "address-to-address"}
      initialPickupPlace={place(true)} initialDropoffPlace={place(false)}
      initialAddressHint={j.isFromAirport ? j.dropoffLabel : j.pickupLabel} initialDropoffHint={j.dropoffLabel}/>
  </div>;
}
