import { TOURS as PRIVATE_TOURS, guidePrice, tourPhoto } from "@/lib/private-tours";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import SectionHeading from "@/components/SectionHeading";
import TourBookingForm from "@/components/TourBookingForm";
import { SERVICE_FLAGS, SITE } from "@/lib/data";
import { TOUR_BENEFITS } from "@/lib/tours";
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

            <div className="mt-8 max-w-3xl">
              <p className="flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.2em] text-emerald">
                <span className="h-px w-8 bg-emerald" aria-hidden="true" />
                Private Tours
              </p>
              <h1 className="mt-4 text-4xl font-bold leading-tight text-white sm:text-5xl">
                Private Northern Ireland Tours from Dublin &amp; Belfast
              </h1>
              <p className="mt-6 text-lg leading-relaxed text-white/80">
                Discover Northern Ireland at your own pace with a private driver and a personalised itinerary.
              </p>
              <p className="mt-4 leading-relaxed text-white/70">
                Whether you&rsquo;re staying in Dublin or Belfast, arriving on a cruise ship or visiting Northern Ireland on holiday, enjoy comfortable, door-to-door travel without the crowds or restrictions of a coach tour.
              </p>
              <ul className="mt-6 space-y-2 text-white/80">
                {[
                  "Private tours for up to 4 passengers",
                  "Dublin and Belfast hotel collection",
                  "Flexible itineraries",
                  "Return transport included",
                  "Exclusive vehicle for your group",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <svg className="mt-1 h-4 w-4 shrink-0 text-emerald" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                href="/private-tours/plan/"
                className="mt-8 inline-flex min-h-12 items-center justify-center rounded-full bg-emerald px-8 text-base font-bold text-navy transition-colors hover:bg-emerald-light"
              >
                Get Your Private Tour Quote
              </Link>
            </div>

            <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {PRIVATE_TOURS.map((tour: { id: string; slug: string; name: string; kicker: string; tagline: string; photo: string }) => (
                <Link
                  key={tour.id}
                  href={`/private-tours/${tour.slug}/`}
                  className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition-colors hover:border-emerald/60"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={tourPhoto(tour.photo)} alt="" loading="lazy" className="aspect-[3/2] w-full object-cover" />
                  <div className="p-5">
                    <p className="text-xs font-semibold uppercase tracking-widest text-emerald">{tour.kicker}</p>
                    <h2 className="mt-2 text-xl font-bold text-white">{tour.name}</h2>
                    <p className="mt-2 text-sm leading-relaxed text-white/70">{tour.tagline}</p>
                    <p className="mt-4 text-sm font-semibold text-white">
                      {guidePrice(tour.id).label}
                      <span className="ml-2 font-normal text-emerald group-hover:underline">View tour &rarr;</span>
                    </p>
                  </div>
                </Link>
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
