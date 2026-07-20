import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import TourCard from "@/components/TourCard";
import TourBookingForm from "@/components/TourBookingForm";
import WhatsAppButton from "@/components/WhatsAppButton";
import { SITE } from "@/lib/data";
import { getBreadcrumbJsonLd } from "@/lib/structured-data";
import { getTourBySlug, TOURS } from "@/lib/tours";

type TourPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return TOURS.map((tour) => ({ slug: tour.slug }));
}

export async function generateMetadata({ params }: TourPageProps): Promise<Metadata> {
  const { slug } = await params;
  const tour = getTourBySlug(slug);

  if (!tour) {
    return { title: `Day Trip Not Found | ${SITE.name}` };
  }

  return {
    title: `${tour.title} Private Day Trip | ${SITE.name}`,
    description: `${tour.shortDescription} ${tour.duration}. ${tour.price}. Book your private chauffeur trip via WhatsApp.`,
    alternates: {
      canonical: `/tours/${tour.slug}/`,
    },
    keywords: [
      tour.title,
      "private day trip Northern Ireland",
      tour.eyebrow,
      SITE.name,
    ],
  };
}

export default async function TourDetailPage({ params }: TourPageProps) {
  const { slug } = await params;
  const tour = getTourBySlug(slug);

  if (!tour) {
    notFound();
  }

  const otherTours = TOURS.filter((item) => item.slug !== tour.slug);
  const structuredData = getBreadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Day Trips", path: "/tours/" },
    { name: tour.title, path: `/tours/${tour.slug}/` },
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <Header />
      <main className="min-h-screen bg-navy pb-16">
        <div className="relative h-64 overflow-hidden sm:h-80 lg:h-96">
          <Image
            src={tour.image}
            alt={tour.imageAlt}
            fill
            priority
            className="object-cover"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/50 to-navy/20" />
          <div className="absolute inset-0 bg-gradient-to-r from-navy/60 via-transparent to-navy/40" />
        </div>

        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <Link
            href="/tours/"
            className="-mt-12 relative z-10 inline-flex items-center gap-2 text-sm text-white/70 transition-colors hover:text-emerald"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            All day trips
          </Link>

          <header className="mt-6">
            <p className="text-sm font-semibold uppercase tracking-widest text-emerald">{tour.eyebrow}</p>
            <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">{tour.title}</h1>
            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
              <span className="rounded-lg bg-emerald/15 px-3 py-1 font-semibold text-emerald">
                {tour.price}
              </span>
              <span className="text-white/50">{tour.duration}</span>
            </div>
            <p className="mt-6 text-lg leading-relaxed text-white/70">{tour.description}</p>
          </header>

          <section className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
            <h2 className="text-lg font-bold text-white">Places we take you</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-white/65">
              {tour.highlights.map((highlight) => (
                <li key={highlight}>{highlight}</li>
              ))}
            </ul>
            <p className="mt-6 text-sm text-white/45">{tour.priceNote}</p>
          </section>

          <div className="mt-10">
            <TourBookingForm
              id="book"
              tourTitle={tour.title}
              description={`Tell us your travel dates, group size, and pickup location for ${tour.title}. We'll confirm availability and send a personalised quote.`}
            />
          </div>
        </div>

        <section className="mx-auto mt-20 max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-white">Other day trips</h2>
          <p className="mt-2 text-sm text-white/50">Explore more private chauffeur trip options across Northern Ireland.</p>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {otherTours.slice(0, 3).map((otherTour) => (
              <TourCard key={otherTour.slug} tour={otherTour} />
            ))}
          </div>
        </section>
      </main>
      <Footer />
      <WhatsAppButton />
    </>
  );
}
