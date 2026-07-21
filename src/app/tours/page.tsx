import type { Metadata } from "next";
import Link from "next/link";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import SectionHeading from "@/components/SectionHeading";
import TourCard from "@/components/TourCard";
import TourBookingForm from "@/components/TourBookingForm";
import WhatsAppButton from "@/components/WhatsAppButton";
import { SITE } from "@/lib/data";
import { TOUR_BENEFITS, TOURS } from "@/lib/tours";
import { getTourItemListJsonLd } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: `Private Day Trips Northern Ireland | ${SITE.name}`,
  description:
    "Private chauffeur day trips across Northern Ireland. We take you door-to-door to the Giant's Causeway, Belfast, Game of Thrones locations, Antrim Coast, Mournes, and Derry. Book via WhatsApp.",
  alternates: {
    canonical: "/tours/",
  },
  keywords: [
    "Northern Ireland private day trips",
    "Giant's Causeway chauffeur trip",
    "Belfast private hire day trip",
    "Game of Thrones locations transport NI",
    "Causeway Coast private hire",
  ],
};

export default function ToursPage() {
  const structuredData = getTourItemListJsonLd();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <Header />
      <main className="min-h-screen bg-navy pt-24 pb-16 md:pt-28">
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-navy-light/40 via-navy to-navy" />
          <div className="relative mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm text-white/50 transition-colors hover:text-emerald"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to home
            </Link>

            <div className="mt-8">
              <SectionHeading
                align="left"
                eyebrow="Private Day Trips"
                title="Discover Northern Ireland"
                description="We take you to the best of Northern Ireland in your own private vehicle. Flexible itineraries, door-to-door transport, and a dedicated driver — whether you're visiting for a day or planning a full day trip."
              />
            </div>

            <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {TOURS.map((tour) => (
                <TourCard key={tour.slug} tour={tour} />
              ))}
            </div>
          </div>
        </div>

        <section className="relative py-20 sm:py-28">
          <div className="absolute inset-0 bg-gradient-to-b from-navy via-navy-light/20 to-navy" />
          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeading
              eyebrow="Why book with us"
              title="Day Trips, Your Way"
              description="The same professional chauffeur service you expect from our airport transfers — applied to private hire trips across Northern Ireland."
            />

            <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {TOUR_BENEFITS.map((benefit) => (
                <article
                  key={benefit.title}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-6"
                >
                  <h3 className="text-lg font-bold text-white">{benefit.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-white/70">{benefit.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="relative pb-8">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <TourBookingForm
              id="book"
              tourTitle="Private day trip in Northern Ireland"
              heading="Ready to plan your day trip?"
              centered
            />
          </div>
        </section>
      </main>
      <Footer />
      <WhatsAppButton />
    </>
  );
}
