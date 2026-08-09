"use client";

import QuoteCard from "@/components/QuoteCard";

type Props = {
  airportCode: string;
  direction?: "to-airport" | "from-airport";
  addressHint?: string;
  heading?: string;
};

export default function LocationQuoteSection({
  airportCode,
  direction = "to-airport",
  addressHint = "",
  heading = "Get your fixed quote",
}: Props) {
  return (
    <section id="quote" className="relative scroll-mt-28 py-16 sm:py-20">
      <div className="absolute inset-0 bg-gradient-to-b from-navy via-navy-light/25 to-navy" />
      <div className="relative mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-emerald">Instant quote</p>
          <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">{heading}</h2>
          <p className="mt-3 text-sm leading-relaxed text-white/60 sm:text-base">
            Fixed prices. No surge pricing. Complimentary waiting time included for flight landings.
          </p>
        </div>
        <QuoteCard
          initialAirportCode={airportCode}
          initialDirection={direction}
          initialAddressHint={addressHint}
        />
      </div>
    </section>
  );
}
