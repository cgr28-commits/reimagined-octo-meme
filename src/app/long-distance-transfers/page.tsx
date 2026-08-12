import type { Metadata } from "next";
import Link from "next/link";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import SectionHeading from "@/components/SectionHeading";
import { SERVICE_FLAGS, SITE } from "@/lib/data";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: `Long-Distance & Republic of Ireland Transfers | ${SITE.name}`,
  description:
    "Door-to-door transfers across Northern Ireland and the Republic of Ireland. Airport, hotel, home and business pickups. Up to four passengers. Request a fixed-price quote for cross-border journeys.",
  alternates: {
    canonical: "/long-distance-transfers/",
  },
};

const HIGHLIGHTS = [
  {
    title: "Door to door",
    description:
      "Enter your pickup and destination — home, hotel, business address, or airport — and we collect you at the agreed time.",
  },
  {
    title: "Fixed prices in Northern Ireland",
    description:
      "Many NI routes show an instant online price. Cross-border and Republic of Ireland journeys are quoted individually.",
  },
  {
    title: "Cross-border experience",
    description:
      "Experienced drivers for Belfast–Dublin and other cross-border routes, with tolls included in your quoted fare.",
  },
  {
    title: "24/7 availability",
    description:
      "Early-morning departures, late-night arrivals, and bank holidays — pre-booked private transfers when you need them.",
  },
] as const;

const EXAMPLE_ROUTES = [
  "Belfast city centre to Dublin Airport",
  "Bangor to Belfast International Airport",
  "Lisburn to Cork city",
  "Newry to Dublin city centre",
  "Belfast to Galway",
  "Derry / Londonderry to Belfast",
] as const;

export default function LongDistanceTransfersPage() {
  if (!SERVICE_FLAGS.addressToAddress) {
    notFound();
  }

  return (
    <>
      <Header />
      <main className="min-h-screen overflow-x-clip bg-navy pb-16 pt-44 md:pt-28">
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
              <SectionHeading
                align="left"
                eyebrow="Long-distance & Republic of Ireland"
                title="Long-Distance & Republic of Ireland Transfers"
                description="My Airport Taxi NI provides pre-booked, door-to-door transfers between addresses, hotels, businesses and airports throughout Northern Ireland and the Republic of Ireland. Destinations such as Dublin, Cork, Galway and Donegal are examples — you can request any supported address. Republic of Ireland journeys are quoted as a fixed price after you submit your request (no online payment until the fare is confirmed)."
              />
            </div>

            <div className="mt-14 grid gap-6 sm:grid-cols-2">
              {HIGHLIGHTS.map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-6"
                >
                  <h2 className="text-lg font-semibold text-white">{item.title}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-white/65">{item.description}</p>
                </div>
              ))}
            </div>

            <section className="mt-16">
              <h2 className="text-xl font-bold text-white sm:text-2xl">Example routes</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/60">
                These are examples only — enter your exact pickup and destination on the quote form
                for your personal price.
              </p>
              <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                {EXAMPLE_ROUTES.map((route) => (
                  <li
                    key={route}
                    className="rounded-xl border border-white/10 bg-navy-light/50 px-4 py-3 text-sm text-white/80"
                  >
                    {route}
                  </li>
                ))}
              </ul>
            </section>

            <div className="mt-14 rounded-2xl border border-emerald/30 bg-emerald/10 px-6 py-8 text-center sm:px-10">
              <p className="text-sm font-medium uppercase tracking-wider text-emerald">Get a quote</p>
              <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-white/75">
                Use our live quote tool for your pickup and destination. Republic of Ireland and
                cross-border routes use Request Fixed Quote — we&apos;ll email your personal price.
              </p>
              <Link
                href="/#quote"
                className="mt-6 inline-flex rounded-full bg-emerald px-8 py-3.5 text-sm font-bold text-navy shadow-lg shadow-emerald/25 transition-all hover:bg-emerald-light"
              >
                Get a live quote
              </Link>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
