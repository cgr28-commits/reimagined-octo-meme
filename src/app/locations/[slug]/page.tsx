import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import LandingBreadcrumbs from "@/components/LandingBreadcrumbs";
import LandingCtaRow from "@/components/LandingCtaRow";
import LandingHeroMedia from "@/components/LandingHeroMedia";
import GoogleReviewsBadge from "@/components/GoogleReviewsBadge";
import HeroSlideshow from "@/components/HeroSlideshow";
import { SITE } from "@/lib/data";
import { LANDING_PAGE_MAIN_WITH_QUOTE_HERO_CLASS } from "@/lib/landing-page-layout";
import {
  AIRPORT_PAGES,
  airportTaxiAnchor,
  getRoutesForTown,
  getTownHubPage,
  TOWN_HUB_PAGES,
} from "@/lib/location-pages";
import { withBasePath } from "@/lib/paths";
import { getBreadcrumbJsonLd, getServiceAreaJsonLd } from "@/lib/structured-data";

type Props = { params: Promise<{ slug: string }> };

const INTERNATIONAL_GUIDE_CONTEXT: Record<string, string> = {
  newtownabbey: "Flying from Aldergrove? Plan your Newtownabbey pickup and read the arrival collection guidance in our ",
  antrim: "For an Antrim journey to Belfast International (BFS), check the airport meeting-point and booking guidance in our ",
  lisburn: "Travelling from Lisburn to Aldergrove? Read how airport access charges are included in your quote in our ",
};

export function generateStaticParams() {
  return TOWN_HUB_PAGES.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = getTownHubPage(slug);
  if (!page) {
    return { title: `Airport Taxi | ${SITE.name}` };
  }
  return {
    title: page.seoTitle ?? `${page.title} | ${SITE.name}`,
    description: page.metaDescription,
    alternates: { canonical: `/locations/${page.slug}/` },
    openGraph: {
      title: page.seoTitle ?? `${page.title} | ${SITE.name}`,
      description: page.metaDescription,
      url: `/locations/${page.slug}/`,
      images: page.heroBase
        ? [
            {
              url: withBasePath(`/images/hero/optimized/${page.heroBase}-1920.jpg`),
              width: 1920,
              height: 1080,
              alt: page.heroAlt ?? page.town.name,
            },
          ]
        : [
            {
              url: withBasePath("/og-image-square.png"),
              width: 1024,
              height: 1024,
              alt: SITE.name,
            },
          ],
    },
  };
}

/** Lede airport names link to that airport's own page, so each airport search points at one page. */
function airportLedeLink(code: "BFS" | "BHD" | "DUB", label: string) {
  const airport = AIRPORT_PAGES.find((entry) => entry.code === code);
  if (!airport) return label;
  return (
    <Link
      href={`/airports/${airport.slug}/`}
      className="underline decoration-white/40 underline-offset-4 hover:text-emerald"
      data-lede-airport-link
    >
      {label}
    </Link>
  );
}

export default async function TownHubPage({ params }: Props) {
  const { slug } = await params;
  const page = getTownHubPage(slug);
  if (!page) notFound();

  const routes = getRoutesForTown(page.town.slug);
  const crumbs = [
    { name: "Home", path: "/" },
    { name: "Locations", path: "/locations/" },
    { name: page.town.name, path: `/locations/${page.slug}/` },
  ];
  const breadcrumb = getBreadcrumbJsonLd(crumbs);
  const serviceLd = getServiceAreaJsonLd({
    name: `${SITE.name} — ${page.title}`,
    description: page.metaDescription,
    path: `/locations/${page.slug}/`,
    areaServed: [page.town.name, ...page.areas, "Northern Ireland"],
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
      <main className={LANDING_PAGE_MAIN_WITH_QUOTE_HERO_CLASS}>
        {/* Quote tool first: the same quote hero as the homepage, with this page's heading. */}
        <HeroSlideshow
          heading={page.h1}
          intro={`Door-to-door airport taxis from ${page.town.name} to Belfast International, Belfast City and Dublin Airport. Fixed price before you pay.`}
        />
        {/* Photo hidden on phones so the quote form is on the first screen. */}
        <div className="hidden sm:block">
          <LandingHeroMedia baseName={page.heroBase} alt={page.heroAlt} />
        </div>

        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <LandingBreadcrumbs
            items={[
              { name: "Home", href: "/" },
              { name: "Locations", href: "/locations/" },
              { name: page.town.name },
            ]}
          />

          <header className="mt-6">
            <p className="text-sm font-semibold uppercase tracking-widest text-emerald">
              {page.town.name} · Airport taxi
            </p>
            <p className="mt-4 text-lg leading-relaxed text-white/80">
              Door-to-door airport taxis from {page.town.name} to{" "}
              {airportLedeLink("BFS", "Belfast International")}, George Best{" "}
              {airportLedeLink("BHD", "Belfast City")} and {airportLedeLink("DUB", "Dublin Airport")}.
              Fixed price before you pay, with flight tracking on airport pickups.
            </p>
            <div className="mt-4">
              <GoogleReviewsBadge />
            </div>
          </header>
        </div>


        {/* Local detail sits below the quote form. */}
        <div className="mx-auto mb-10 max-w-3xl px-4 sm:px-6 lg:px-8">
            <p className="mt-6 text-lg leading-relaxed text-white/70">{page.intro}</p>
            {INTERNATIONAL_GUIDE_CONTEXT[page.town.slug] ? (
              <p className="mt-4 text-sm leading-relaxed text-white/70">
                {INTERNATIONAL_GUIDE_CONTEXT[page.town.slug]}
                <Link href="/airports/belfast-international/" className="text-emerald underline underline-offset-4">Belfast International Airport taxi guide</Link>.
              </p>
            ) : page.airportCodes.includes("BFS") ? (
              <p className="mt-4 text-sm leading-relaxed text-white/70">
                Flying from Aldergrove? Pickup points, airport charges and flight tracking are explained on our{" "}
                <Link href="/airports/belfast-international/" className="text-emerald underline underline-offset-4">Belfast International Airport taxi</Link>{" "}
                page.
              </p>
            ) : null}
            {["holywood", "bangor"].includes(page.town.slug) ? (
              <p className="mt-4 text-sm leading-relaxed text-white/70">
                {page.town.slug === "holywood"
                  ? "For a flight from nearby George Best Belfast City Airport (BHD), check the collection guidance and fare inclusions in our "
                  : "Planning a Bangor journey to George Best Belfast City Airport (BHD)? Read the arrival pickup and booking guidance in our "}
                <Link href="/airports/belfast-city/" className="text-emerald underline underline-offset-4">Belfast City Airport taxi guide</Link>.
              </p>
            ) : null}
            <LandingCtaRow
              quoteLabel="Get Your Fixed Quote"
              whatsappMessage={`Hi, I'd like an airport taxi from ${page.town.name}.`}
            />
        </div>

        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <section>
            <h2 className="text-lg font-bold text-white">Airport transfers from {page.town.name}</h2>
            <ul className="mt-4 grid gap-3">
              {routes.map((route) => (
                <li key={route.slug}>
                  <Link
                    href={`/transfers/${route.slug}/`}
                    className="block rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 transition-colors hover:border-emerald/40"
                  >
                    <p className="text-sm font-semibold text-emerald">{route.airport.code}</p>
                    <p className="mt-1 text-base font-bold text-white">
                      {page.town.name} to {route.airport.name}
                    </p>
                    <p className="mt-1 text-sm text-white/55">{route.airport.shortName} transfers</p>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-white/50">
              See all{" "}
              <Link href="/airports/" className="text-emerald hover:text-emerald-light">
                airport transfers
              </Link>
              {AIRPORT_PAGES.filter((airport) => page.airportCodes.includes(airport.code)).map(
                (airport) => (
                  <span key={airport.slug}>
                    {" "}
                    ·{" "}
                    <Link
                      href={`/airports/${airport.slug}/`}
                      className="text-emerald hover:text-emerald-light"
                    >
                      {airportTaxiAnchor(airport)}
                    </Link>
                  </span>
                ),
              )}
              .
            </p>
            <p className="mt-3 text-sm text-white/50">
              Catching a train or coach? Book a{" "}
              <Link href="/belfast-grand-central-station-taxi/" className="text-emerald hover:text-emerald-light">
                Belfast Grand Central Station taxi
              </Link>{" "}
              to or from {page.town.name}.
            </p>
          </section>

          <section className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
            <h2 className="text-lg font-bold text-white">Areas around {page.town.name} we cover</h2>
            <ul className="mt-4 flex flex-wrap gap-2">
              {page.areas.map((area) => {
                const linkedHub = TOWN_HUB_PAGES.find(
                  (hub) => hub.town.name === area && hub.slug !== page.slug,
                );
                const chipClass =
                  "rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/75";
                return (
                  <li key={area}>
                    {linkedHub ? (
                      <Link
                        href={`/locations/${linkedHub.slug}/`}
                        className={`${chipClass} transition-colors hover:border-emerald/40 hover:text-emerald`}
                      >
                        {area}
                      </Link>
                    ) : (
                      <span className={chipClass}>{area}</span>
                    )}
                  </li>
                );
              })}
            </ul>
            <ul className="mt-5 space-y-3 text-sm leading-relaxed text-white/65">
              {page.localNotes.map((note) => (
                <li key={note} className="flex gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald" aria-hidden />
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </section>

          {page.relatedTownSlugs.some((townSlug) => {
            const related = TOWN_HUB_PAGES.find((hub) => hub.town.slug === townSlug);
            return related && related.slug !== page.slug && !page.areas.includes(related.town.name);
          }) ? (
            <section className="mt-8">
              <h2 className="text-lg font-bold text-white">Nearby airport taxi pages</h2>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {page.relatedTownSlugs.map((townSlug) => {
                  const related = TOWN_HUB_PAGES.find((hub) => hub.town.slug === townSlug);
                  if (!related || related.slug === page.slug || page.areas.includes(related.town.name)) return null;
                  return (
                    <li key={related.slug}>
                      <Link
                        href={`/locations/${related.slug}/`}
                        className="block rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/75 transition-colors hover:border-emerald/40 hover:text-emerald"
                      >
                        {related.town.name} airport taxis
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
            <h2 className="text-lg font-bold text-white">Which airport from {page.town.name}?</h2>
            <p className="mt-3 text-sm leading-relaxed text-white/65">
              Compare the three airports from {page.town.name}. The quote box at the top of this
              page gives you a fixed price for any of them, or open an airport above for more
              journey details.
            </p>
            <ul className="mt-5 space-y-4">
              {page.whichAirport.map((item) => (
                <li key={item.code}>
                  <p className="text-sm font-semibold text-white">{item.label}</p>
                  <p className="mt-1 text-sm leading-relaxed text-white/65">{item.text}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-8 rounded-2xl border border-emerald/30 bg-emerald/10 px-6 py-8 text-center sm:px-10">
            <h2 className="text-lg font-bold text-white">Book your {page.town.name} airport taxi</h2>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-white/75">
              Use the quote box on this page for a live fixed price, or message us on WhatsApp.
            </p>
            <div className="flex justify-center">
              <LandingCtaRow
                quoteLabel="Get Your Fixed Quote"
                whatsappMessage={`Hi, I'd like an airport taxi from ${page.town.name}.`}
              />
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
