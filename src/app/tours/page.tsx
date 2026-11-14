import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import SectionHeading from "@/components/SectionHeading";
import TourCard from "@/components/TourCard";
import TourBookingForm from "@/components/TourBookingForm";
import { SERVICE_FLAGS, SITE } from "@/lib/data";
import { TOUR_BENEFITS, TOURS } from "@/lib/tours";
import { getBreadcrumbJsonLd, getFaqPageJsonLd, getTourItemListJsonLd } from "@/lib/structured-data";

const TITLE = "Private Tours from Belfast | Giant's Causeway from £395";
const DESCRIPTION =
  "Private day tours from Belfast with your own driver: Giant's Causeway, Game of Thrones, Antrim Coast and Belfast city. From £195 per car, up to 4 people.";

const HUB_FAQS = [
  {
    question: "How much is a private day tour from Belfast?",
    answer:
      "A half day (around 4 hours) is from £195 and a full day (around 8 hours) is from £395. That's the price per car, not per person, for up to 4 passengers. Attraction entry tickets are extra.",
  },
  {
    question: "Where do you pick up from?",
    answer:
      "We collect you from your Belfast hotel, B&B, home or Belfast Cruise Terminal and bring you back at the end of the day. Picking up outside Belfast? We'll confirm the price when you enquire.",
  },
  {
    question: "Can we choose our own stops?",
    answer:
      "Yes. Every tour is private, so you decide where to stop and for how long. You can combine the Giant's Causeway with Game of Thrones locations or the Antrim Coast on the same day.",
  },
  {
    question: "Are the tours suitable for cruise passengers?",
    answer:
      "Yes. Tell us your ship and all-aboard time and we'll plan the day so you're back at Belfast Cruise Terminal in good time.",
  },
] as const;

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    locale: "en_GB",
    siteName: SITE.name,
    url: "/tours/",
    images: [
      {
        url: "/images/tours/giants-causeway.jpg",
        width: 1400,
        height: 788,
        alt: "Hexagonal basalt columns at Giant's Causeway on the Causeway Coast at sunset",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/images/tours/giants-causeway.jpg"],
  },
  alternates: {
    canonical: "/tours/",
  },
  keywords: [
    "private tours from Belfast",
    "private Giant's Causeway tour from Belfast",
    "Northern Ireland private day trips",
    "Giant's Causeway chauffeur trip",
    "Belfast private hire day trip",
    "Game of Thrones locations transport NI",
    "Causeway Coast private hire",
  ],
};

export default function ToursPage() {
  // Soft-hidden via SERVICE_FLAGS.dayTrips — code retained for restore
  if (!SERVICE_FLAGS.dayTrips) {
    notFound();
  }

  const structuredData = getTourItemListJsonLd();
  const breadcrumbLd = getBreadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Day Trips", path: "/tours/" },
  ]);
  const faqLd = getFaqPageJsonLd(HUB_FAQS);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <Header />
      <main className="overflow-x-clip min-h-screen bg-navy pb-16 pt-36 md:pt-28">
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
                as="h1"
                align="left"
                eyebrow="Private Day Trips"
                title="Private Tours from Belfast"
                description="See the Giant's Causeway, the Antrim Coast, Game of Thrones locations or Belfast itself in your own car with a local driver. Half days from £195 and full days from £395 — per car, for up to 4 passengers."
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

        <section className="relative pb-16">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
              <h2 className="text-lg font-bold text-white">Private day tours from Belfast — questions</h2>
              <dl className="mt-6 space-y-5">
                {HUB_FAQS.map((faq) => (
                  <div key={faq.question}>
                    <dt className="text-sm font-semibold text-white">{faq.question}</dt>
                    <dd className="mt-2 text-sm leading-relaxed text-white/65">{faq.answer}</dd>
                  </div>
                ))}
              </dl>
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
    </>
  );
}
