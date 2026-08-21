"use client";

import { useState } from "react";
import Link from "next/link";
import QuoteCard from "@/components/QuoteCard";
import {
  EMERGE_BELFAST_DESTINATION,
  EMERGE_BOOKING_STEPS,
  EMERGE_DISCLAIMER,
  EMERGE_FAQS,
  EMERGE_HERO_TRUST,
  EMERGE_OFFICIAL_INFO_URL,
  EMERGE_TRANSFER_CARDS,
  EMERGE_TRUST_POINTS,
  emergeWhatsAppHref,
} from "@/lib/emerge-belfast";
import { SITE } from "@/lib/data";

function QuoteCta({
  label,
  className = "",
}: {
  label: string;
  className?: string;
}) {
  return (
    <a
      href="#quote"
      className={`inline-flex items-center justify-center rounded-full bg-emerald px-7 py-3.5 text-sm font-bold text-navy transition-colors hover:bg-emerald-light ${className}`}
    >
      {label}
    </a>
  );
}

function WhatsAppCta({
  label,
  className = "",
}: {
  label: string;
  className?: string;
}) {
  return (
    <a
      href={emergeWhatsAppHref()}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center justify-center rounded-full border border-white/25 bg-white/5 px-7 py-3.5 text-sm font-bold text-white transition-colors hover:border-emerald/50 hover:bg-emerald/10 ${className}`}
    >
      {label}
    </a>
  );
}

export default function EmergeBelfastPageClient() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div className="emerge-page">
      {/* Hero */}
      <section className="emerge-hero relative overflow-hidden pb-16 pt-36 md:pt-32">
        <div className="emerge-hero-beams" aria-hidden="true" />
        <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald">
            29–30 August 2026 · Boucher Playing Fields
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-[3.25rem] lg:leading-[1.1]">
            Pre-Book Your Taxi to EMERGE Belfast 2026
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-white/75">
            Travel to and from EMERGE Belfast with a private, pre-booked transfer. Get a clear fixed
            quote before booking, pay securely online and arrange your pickup in advance.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <QuoteCta label="Get a Fixed Quote" />
            <WhatsAppCta label="Book Through WhatsApp" />
          </div>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {EMERGE_HERO_TRUST.map((item) => (
              <li
                key={item}
                className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-white/80"
              >
                <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-emerald align-middle" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Intro */}
      <section className="relative py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-white sm:text-4xl">
            Your Pre-Booked Transfer to EMERGE Belfast
          </h2>
          <p className="mt-5 text-base leading-relaxed text-white/70 sm:text-lg">
            EMERGE Belfast takes place at Boucher Playing Fields on Saturday 29 and Sunday 30 August
            2026. With large crowds leaving at similar times, arranging your journey in advance can
            make travelling considerably easier.
          </p>
          <p className="mt-4 text-base leading-relaxed text-white/70 sm:text-lg">
            {SITE.name} provides pre-booked transfers from Belfast International Airport, Belfast
            City Airport, City of Derry Airport, Dublin Airport, Belfast hotels and home addresses.
            One-way and return journeys are available, subject to booking availability.
          </p>
        </div>
      </section>

      {/* Transfer options */}
      <section className="relative py-16 sm:py-20">
        <div className="absolute inset-0 bg-gradient-to-b from-navy via-navy-light/20 to-navy" />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-3xl font-bold text-white sm:text-4xl">Transfer options</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-white/60">
            Airport, hotel and home pickups for EMERGE Belfast — for up to 4 passengers.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {EMERGE_TRANSFER_CARDS.map((card) => (
              <article
                key={card.title}
                className="emerge-card rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-lg shadow-black/20"
              >
                <h3 className="text-xl font-bold text-white">{card.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-white/65">{card.body}</p>
                {card.href.startsWith("#") ? (
                  <a
                    href={card.href}
                    className="mt-5 inline-flex text-sm font-semibold text-emerald hover:text-emerald-light"
                  >
                    Get a Fixed Quote
                  </a>
                ) : (
                  <Link
                    href={card.href}
                    className="mt-5 inline-flex text-sm font-semibold text-emerald hover:text-emerald-light"
                  >
                    Learn more
                  </Link>
                )}
              </article>
            ))}
          </div>
          <div className="mt-10 flex justify-center">
            <QuoteCta label="Get a Fixed Quote" />
          </div>
        </div>
      </section>

      {/* How booking works */}
      <section className="relative py-16 sm:py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-3xl font-bold text-white sm:text-4xl">
            Book Your Journey in Four Steps
          </h2>
          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {EMERGE_BOOKING_STEPS.map((step, index) => (
              <li
                key={step.title}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald/15 text-sm font-bold text-emerald">
                  {index + 1}
                </span>
                <h3 className="mt-4 text-lg font-bold text-white">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/65">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Quote tool */}
      <section id="quote" className="relative scroll-mt-36 py-16 sm:py-20 xl:scroll-mt-28">
        <div className="absolute inset-0 bg-gradient-to-b from-navy via-navy-light/25 to-navy" />
        <div className="relative mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-emerald">
              Fixed quote
            </p>
            <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
              Get your EMERGE Belfast quote
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-white/60 sm:text-base">
              Destination is prefilled as {EMERGE_BELFAST_DESTINATION}. Enter your pickup, choose
              the matching address suggestion, then continue to see your fixed quote.
            </p>
          </div>
          <QuoteCard
            initialDropoffHint={EMERGE_BELFAST_DESTINATION}
            pageType="emerge_belfast"
            maxPassengers={4}
          />
        </div>
      </section>

      {/* Return transfers */}
      <section id="return" className="relative scroll-mt-28 py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-white sm:text-4xl">
            Arrange Your Return Before the Festival
          </h2>
          <p className="mt-5 text-base leading-relaxed text-white/70 sm:text-lg">
            Festival transport will be busy when the event finishes. Pre-booking means your return
            journey and meeting arrangements can be agreed before the day.
          </p>
          <p className="mt-4 text-base leading-relaxed text-white/70 sm:text-lg">
            The event’s approximate curfew is 10:45pm. Collection times and meeting points must allow
            for crowd movement, traffic restrictions and safe legal stopping locations. The final
            collection point will be confirmed as part of the booking.
          </p>
          <div className="mt-8">
            <QuoteCta label="Request a Return Quote" />
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="relative py-16 sm:py-20">
        <div className="absolute inset-0 bg-navy-dark/60" />
        <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-3xl font-bold text-white sm:text-4xl">
            Airport Transfer Experience You Can Rely On
          </h2>
          <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {EMERGE_TRUST_POINTS.map((item) => (
              <li
                key={item}
                className="flex items-start gap-3 rounded-2xl border border-emerald/20 bg-emerald/5 px-4 py-4 text-sm font-medium text-white/85"
              >
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Festival info */}
      <section className="relative py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="emerge-card rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
            <h2 className="text-2xl font-bold text-white sm:text-3xl">
              EMERGE Belfast 2026 Information
            </h2>
            <ul className="mt-5 space-y-2 text-sm leading-relaxed text-white/70 sm:text-base">
              <li>
                <span className="font-semibold text-white">Dates:</span> Saturday 29 and Sunday 30
                August 2026
              </li>
              <li>
                <span className="font-semibold text-white">Venue:</span> Boucher Playing Fields,
                Belfast
              </li>
              <li>
                <span className="font-semibold text-white">Gates:</span> 4:00pm
              </li>
              <li>
                <span className="font-semibold text-white">Approximate curfew:</span> 10:45pm
              </li>
              <li>
                <span className="font-semibold text-white">Age restriction:</span> 17+ with acceptable
                identification required
              </li>
            </ul>
            <p className="mt-5 text-sm leading-relaxed text-white/60">
              Festival details may change. Customers should check the official EMERGE Belfast website
              before travelling.
            </p>
            <a
              href={EMERGE_OFFICIAL_INFO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex text-sm font-semibold text-emerald hover:text-emerald-light"
            >
              Official EMERGE Belfast information
            </a>
          </div>
        </div>
      </section>

      {/* FAQs */}
      <section className="relative py-16 sm:py-20">
        <div className="absolute inset-0 bg-navy-dark" />
        <div className="relative mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-3xl font-bold text-white sm:text-4xl">
            EMERGE Belfast Taxi FAQs
          </h2>
          <div className="mt-10 space-y-3">
            {EMERGE_FAQS.map((faq, index) => {
              const isOpen = openFaq === index;
              return (
                <div
                  key={faq.question}
                  className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] transition-colors hover:border-emerald/20"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : index)}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left sm:px-6 sm:py-5"
                    aria-expanded={isOpen}
                  >
                    <span className="text-sm font-semibold text-white sm:text-base">
                      {faq.question}
                    </span>
                    <span className="text-emerald" aria-hidden>
                      {isOpen ? "−" : "+"}
                    </span>
                  </button>
                  {isOpen ? (
                    <div className="border-t border-white/10 px-5 py-4 text-sm leading-relaxed text-white/65 sm:px-6">
                      {faq.answer}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative py-16 sm:py-20">
        <div className="emerge-final-cta relative mx-auto max-w-3xl overflow-hidden rounded-3xl border border-emerald/25 px-6 py-12 text-center sm:px-10">
          <div className="emerge-final-glow" aria-hidden="true" />
          <h2 className="relative text-3xl font-bold text-white sm:text-4xl">
            Secure Your EMERGE Transfer in Advance
          </h2>
          <p className="relative mx-auto mt-4 max-w-xl text-base leading-relaxed text-white/70">
            Request your fixed quote now for an airport, hotel, home or return transfer.
          </p>
          <div className="relative mt-8 flex flex-wrap items-center justify-center gap-3">
            <QuoteCta label="Get My Fixed Quote" />
            <WhatsAppCta label="Message on WhatsApp" />
          </div>
          <p className="relative mt-6 text-sm text-white/50">
            Call {SITE.landlineDisplay} · {SITE.email}
          </p>
        </div>
      </section>

      {/* Disclaimer */}
      <section className="relative pb-24 pt-4">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <p className="text-xs leading-relaxed text-white/45 sm:text-sm">{EMERGE_DISCLAIMER}</p>
        </div>
      </section>

      {/* Sticky mobile CTA */}
      <a href="#quote" className="emerge-sticky-quote" aria-label="Get an EMERGE Quote">
        Get an EMERGE Quote
      </a>
    </div>
  );
}
