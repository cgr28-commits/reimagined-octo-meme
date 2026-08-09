import type { Metadata } from "next";
import Link from "next/link";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import { SITE } from "@/lib/data";
import { AIRPORT_PAGES } from "@/lib/location-pages";
import { getBreadcrumbJsonLd } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: `Airport Transfers | ${SITE.name}`,
  description:
    "Private airport taxi transfers for Belfast International, Belfast City, Dublin, and City of Derry airports. Fixed prices, flight tracking, and 24/7 licensed drivers.",
  alternates: { canonical: "/airports/" },
};

export default function AirportsIndexPage() {
  const breadcrumb = getBreadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Airports", path: "/airports/" },
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
      <Header />
      <main className="min-h-screen overflow-x-clip bg-navy pb-16 pt-44 md:pt-28">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <p className="text-sm font-semibold uppercase tracking-widest text-emerald">Destinations</p>
          <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Airport transfers</h1>
          <p className="mt-4 text-lg leading-relaxed text-white/65">
            Dedicated transfer pages for each airport we serve — with local tips and a quote tool
            preselected for that destination.
          </p>

          <ul className="mt-10 space-y-4">
            {AIRPORT_PAGES.map((page) => (
              <li key={page.slug}>
                <Link
                  href={`/airports/${page.slug}/`}
                  className="block rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-colors hover:border-emerald/40"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="rounded-lg bg-emerald/15 px-2.5 py-1 text-xs font-bold tracking-wider text-emerald">
                      {page.code}
                    </span>
                    <span className="text-sm font-semibold text-emerald">{page.fromPriceLabel}</span>
                  </div>
                  <h2 className="mt-3 text-xl font-bold text-white">{page.title}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-white/60">{page.intro}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </main>
      <Footer />
    </>
  );
}
