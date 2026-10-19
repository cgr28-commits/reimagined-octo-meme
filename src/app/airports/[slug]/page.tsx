import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import EmergeDiscoveryPromo from "@/components/EmergeDiscoveryPromo";
import LocationQuoteSection from "@/components/LocationQuoteSection";
import LandingHeroMedia from "@/components/LandingHeroMedia";
import { LandingPageQuoteCta } from "@/components/LandingPageQuoteCta";
import { SITE } from "@/lib/data";
import { LANDING_PAGE_MAIN_CLASS } from "@/lib/landing-page-layout";
import {
  AIRPORT_PAGES,
  getAirportPage,
  TOWN_HUB_PAGES,
  TRANSFER_ROUTE_PAGES,
} from "@/lib/location-pages";
import { getBreadcrumbJsonLd, getServiceAreaJsonLd } from "@/lib/structured-data";
import { withBasePath } from "@/lib/paths";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return AIRPORT_PAGES.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = getAirportPage(slug);
  if (!page) {
    return { title: `Airport Transfer | ${SITE.name}` };
  }
  return {
    title: page.seoTitle ?? `${page.title} | ${SITE.name}`,
    description: page.metaDescription,
    alternates: { canonical: `/airports/${page.slug}/` },
    openGraph: {
      title: page.seoTitle ?? `${page.title} | ${SITE.name}`,
      description: page.metaDescription,
      url: `/airports/${page.slug}/`,
      images: [
        {
          url: withBasePath(`/images/hero/optimized/${page.heroBase}-1920.jpg`),
          width: 1920,
          height: 1080,
          alt: page.heroAlt,
        },
      ],
    },
  };
}

export default async function AirportTransferPage({ params }: Props) {
  const { slug } = await params;
  const page = getAirportPage(slug);
  if (!page) notFound();

  const relatedRoutes = TRANSFER_ROUTE_PAGES.filter((route) => route.airport.slug === page.slug);
  const orderedRoutes = [
    ...relatedRoutes.filter((route) => route.town.slug === "belfast"),
    ...relatedRoutes.filter((route) => route.town.slug !== "belfast"),
  ];
  const relatedHubs = TOWN_HUB_PAGES.filter((hub) => hub.airportCodes.includes(page.code));
  const breadcrumb = getBreadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Airports", path: "/airports/" },
    { name: page.shortName, path: `/airports/${page.slug}/` },
  ]);
  const serviceLd = getServiceAreaJsonLd({
    name: `${SITE.name} — ${page.title}`,
    description: page.metaDescription,
    path: `/airports/${page.slug}/`,
    areaServed: page.areaServed,
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceLd) }}
      />
      <Header />
      <main className={LANDING_PAGE_MAIN_CLASS}>
        <LandingHeroMedia baseName={page.heroBase} alt={page.heroAlt} variant="airport" />

        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <Link
            href="/airports/"
            className="relative z-10 -mt-10 inline-flex min-h-11 items-center gap-2 text-sm text-white/70 transition-colors hover:text-emerald"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            All airports
          </Link>

          <header className="mt-6">
            <p className="text-sm font-semibold uppercase tracking-widest text-emerald">
              {page.code} · Airport transfers
            </p>
            <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">{page.title}</h1>
            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
              <span className="rounded-lg bg-emerald/15 px-3 py-1 font-semibold text-emerald">
                {page.fromPriceLabel}
              </span>
              <span className="text-white/50">{page.durationNote}</span>
            </div>
            <p className="mt-6 text-lg leading-relaxed text-white/70">{page.intro}</p>
            <div className="mt-6">
              <LandingPageQuoteCta />
            </div>
          </header>

          {page.code === "BFS" ? (
            <section className="mt-8 space-y-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
              <div>
                <h2 className="text-lg font-bold text-white">Taxi to Belfast International Airport</h2>
                <p className="mt-3 text-sm leading-relaxed text-white/70">
                  Check that your flight leaves from Belfast International at Aldergrove (BFS), rather than
                  Belfast City Airport (BHD). Use your home, hotel or business address as the pickup and BFS
                  as the destination. Allow around 30 minutes from Belfast city centre in normal traffic,
                  plus extra road time at busy periods and the check-in time recommended by your airline.
                  Your booking needs the time you want to be collected, not your flight departure time.
                </p>
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Pre-booked pickups at Aldergrove</h2>
                <p className="mt-3 text-sm leading-relaxed text-white/70">
                  For an arrival, put Belfast International Airport in Pickup location and enter your destination
                  address. Add your flight number when completing the booking so we can monitor your flight.
                  Follow the collection instructions confirmed by your driver after you have collected your luggage.
                  Business Class airport pickups include Meet &amp; Greet with a name board; check the details
                  for the vehicle and collection service you book.
                </p>
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Fixed-price quotes and airport access charges</h2>
                <p className="mt-3 text-sm leading-relaxed text-white/70">
                  Enter both addresses, passengers and suitcases, then choose “Get My Fixed Price”. Review the
                  available vehicles and quote before adding your date, pickup time and contact details to book.
                  Vehicle supplements form part of the journey fare. Applicable airport terminal access charges
                  are separate from that fare in the price breakdown and included in the total you see.
                  The 5% return-booking discount applies to the journey fare, not the airport access charges.
                </p>
              </div>
              <p className="text-sm leading-relaxed text-white/70">
                Choose the route for your pickup area: <Link href="/transfers/belfast-to-belfast-international/" className="text-emerald underline underline-offset-4">Belfast</Link>,{" "}
                <Link href="/transfers/newtownabbey-to-belfast-international/" className="text-emerald underline underline-offset-4">Newtownabbey</Link>,{" "}
                <Link href="/transfers/antrim-to-belfast-international/" className="text-emerald underline underline-offset-4">Antrim</Link> or{" "}
                <Link href="/transfers/lisburn-to-belfast-international/" className="text-emerald underline underline-offset-4">Lisburn to Belfast International Airport</Link>.
              </p>
            </section>
          ) : null}

          {page.code === "BHD" ? (
            <section className="mt-8 space-y-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
              <div>
                <h2 className="text-lg font-bold text-white">Belfast City Airport pickups</h2>
                <p className="mt-3 text-sm leading-relaxed text-white/70">
                  George Best Belfast City Airport (BHD) is separate from Belfast International Airport (BFS).
                  Check your flight confirmation before choosing your airport. For a City Airport taxi after landing,
                  enter BHD as your pickup and your home or hotel as the destination. Add your flight number when
                  completing the booking and follow the collection instructions for your booked pickup option.
                  The Express Pick-Up &amp; Drop-Off area and other car parks have different meeting points.
                </p>
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Belfast city-centre transfers</h2>
                <p className="mt-3 text-sm leading-relaxed text-white/70">
                  Travelling between the airport and a Belfast hotel or city-centre address? Allow around 15 minutes
                  in normal traffic and extra time at busy periods. Enter the full address for your journey quote.
                  See the <Link href="/transfers/belfast-to-belfast-city/" className="text-emerald underline underline-offset-4">Belfast to Belfast City Airport transfer</Link> page
                  for the city route, or choose a <Link href="/transfers/holywood-to-belfast-city-airport/" className="text-emerald underline underline-offset-4">Holywood airport transfer</Link> or a{" "}
                  <Link href="/transfers/bangor-to-belfast-city-airport/" className="text-emerald underline underline-offset-4">Bangor airport transfer</Link>.
                </p>
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Book your fixed-price airport taxi</h2>
                <p className="mt-3 text-sm leading-relaxed text-white/70">
                  Enter your pickup and drop-off addresses, travel details, passengers and suitcases, then choose
                  “Get My Fixed Price”. For an arrival, use “Swap pickup and drop-off” to put the airport first.
                  Review the available vehicle and fare before proceeding to booking. Applicable airport access
                  charges are included in the quote; check your selected collection option before confirming.
                </p>
              </div>
            </section>
          ) : null}

          <section className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
            <h2 className="text-lg font-bold text-white">What&apos;s included</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-white/65">
              {page.highlights.map((item) => (
                <li key={item}>{item}</li>
              ))}
              {page.slug === "dublin" ? (
                <li>
                  <Link
                    href="/transfers/business-class-dublin-airport/"
                    className="text-emerald hover:text-emerald-light"
                  >
                    Business Class
                  </Link>{" "}
                  airport pickups include Meet &amp; Greet with a name board
                </li>
              ) : null}
            </ul>
          </section>

          <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
            <h2 className="text-lg font-bold text-white">Local tips for {page.shortName}</h2>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-white/65">
              {page.localTips.map((tip) => (
                <li key={tip} className="flex gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald" aria-hidden />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </section>

          {["belfast-international", "belfast-city", "dublin"].includes(page.slug) && (
            <section className="mt-8 rounded-2xl border border-white/10 p-6">
              <h2 className="text-lg font-bold text-white">Connecting with a train or coach?</h2>
              <p className="mt-3 text-sm text-white/70">Arrange a pre-booked transfer between {page.shortName} and <Link href="/belfast-grand-central-station-taxi/" className="text-emerald underline underline-offset-4">Belfast Grand Central Station</Link>, in either direction. Read the station collection guidance and get a quote before booking.</p>
            </section>
          )}

          {relatedHubs.length > 0 ? (
            <section className="mt-8">
              <h2 className="text-lg font-bold text-white">Towns we serve for {page.shortName}</h2>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {relatedHubs.map((hub) => (
                  <li key={hub.slug}>
                    <Link
                      href={`/locations/${hub.slug}/`}
                      className="block rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/75 transition-colors hover:border-emerald/40 hover:text-emerald"
                    >
                      {hub.town.name} airport taxis
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {relatedRoutes.length > 0 ? (
            <section className="mt-8">
              <h2 className="text-lg font-bold text-white">Popular routes to {page.shortName}</h2>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {orderedRoutes.map((route) => (
                  <li key={route.slug}>
                    <Link
                      href={`/transfers/${route.slug}/`}
                      className="block rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/75 transition-colors hover:border-emerald/40 hover:text-emerald"
                    >
                      {route.direction === "from-airport"
                        ? `${page.shortName} to ${route.town.name}`
                        : `${route.town.name} to ${page.shortName}`}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {page.slug === "belfast-international" ||
          page.slug === "belfast-city" ||
          page.slug === "dublin" ? (
            <EmergeDiscoveryPromo />
          ) : null}
        </div>

        <LocationQuoteSection
          airportCode={page.code}
          direction="to-airport"
          heading={`Quote a ${page.shortName} transfer`}
        />
      </main>
      <Footer />
    </>
  );
}
