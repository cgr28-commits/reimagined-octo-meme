import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import TourCard from "@/components/TourCard";
import WhatsAppButton from "@/components/WhatsAppButton";
import { SITE } from "@/lib/data";
import { getBreadcrumbJsonLd } from "@/lib/structured-data";
import { getTourBySlug, getTourWhatsAppUrl, TOURS } from "@/lib/tours";

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

          <div className="mt-10 glass-card rounded-2xl p-6 sm:p-8">
            <h2 className="text-lg font-bold text-white">Book this day trip</h2>
            <p className="mt-3 text-sm leading-relaxed text-white/65">
              Send us a WhatsApp message with your travel dates, group size, and pickup location.
              We&apos;ll confirm availability and send a personalised quote.
            </p>
            <a
              href={getTourWhatsAppUrl(tour.whatsappMessage)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald px-8 py-3.5 text-sm font-semibold text-navy transition-all hover:bg-emerald-light hover:shadow-lg hover:shadow-emerald/25 sm:w-auto"
            >
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.884 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              Enquire on WhatsApp
            </a>
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
