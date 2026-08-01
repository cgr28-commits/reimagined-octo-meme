"use client";

import { prefillQuoteAirport } from "@/lib/quote-prefill";

type AirportBookNowLinkProps = {
  airportCode: string;
  className?: string;
};

export default function AirportBookNowLink({
  airportCode,
  className = "mt-5 inline-flex items-center gap-1 text-sm font-semibold text-emerald transition-colors hover:text-emerald-light",
}: AirportBookNowLinkProps) {
  return (
    <a
      href="#quote"
      onClick={(event) => {
        event.preventDefault();
        prefillQuoteAirport(airportCode);
      }}
      className={className}
    >
      Book now
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
      </svg>
    </a>
  );
}
