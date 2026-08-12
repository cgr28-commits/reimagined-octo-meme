import type { Metadata } from "next";
import Link from "next/link";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import SectionHeading from "@/components/SectionHeading";
import { SERVICE_FLAGS, SITE } from "@/lib/data";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: `Long-Distance Transfers from Greater Belfast Across Ireland | ${SITE.name}`,
  description:
    "Pre-booked, door-to-door private transfers from anywhere in Greater Belfast to destinations throughout Northern Ireland and the Republic of Ireland. Airport pickups are also available from Belfast International Airport, Belfast City Airport and Dublin Airport.",
  alternates: {
    canonical: "/long-distance-transfers/",
  },
};

const HIGHLIGHTS = [
  {
    title: "Greater Belfast pickups",
    description:
      "Standard pickups are from anywhere in Greater Belfast — home, hotel or business address.",
  },
  {
    title: "Destinations across Ireland",
    description:
      "Travel to destinations throughout Northern Ireland and the Republic of Ireland. Enter any supported address on the quote form.",
  },
  {
    title: "Airport pickups",
    description:
      "Pre-booked pickups are also available from Belfast International Airport, Belfast City Airport and Dublin Airport.",
  },
  {
    title: "Fixed quotes where needed",
    description:
      "Dublin Airport and many Greater Belfast routes show an online price where available. Out-of-area pickups and other Republic of Ireland city destinations use Request Fixed Quote.",
  },
] as const;

const EXAMPLE_ROUTES = [
  "Belfast city centre to Dublin Airport",
  "Bangor to Cork city",
  "Lisburn to Galway",
  "Newtownabbey to Dublin city centre",
  "Holywood to Donegal",
  "Belfast International Airport to Dublin city",
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
                as="h1"
                align="left"
                eyebrow="Long-distance transfers"
                title="Private Long-Distance Transfers from Anywhere in Greater Belfast"
                description="Pre-booked, door-to-door private transfers from anywhere in Greater Belfast to destinations throughout Northern Ireland and the Republic of Ireland. Airport pickups are also available from Belfast International Airport, Belfast City Airport and Dublin Airport."
              />
            </div>

            <div className="mt-14 grid gap-6 sm:grid-cols-2">
              {HIGHLIGHTS.map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-6"
                >
                  <h3 className="text-lg font-semibold text-white">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/65">{item.description}</p>
                </div>
              ))}
            </div>

            <section className="mt-16">
              <h2 className="text-xl font-bold text-white sm:text-2xl">Example routes</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/60">
                These are examples only — enter your exact pickup and destination on the quote form.
                We do not offer general pickups throughout Ireland; standard pickups are from Greater
                Belfast (plus the airports listed above).
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
                Use our live quote tool for Greater Belfast pickups and airport collections. Online
                prices apply where available; out-of-area pickups need Request Fixed Quote for manual
                approval.
              </p>
              <Link
                href="/#quote"
                className="mt-6 inline-flex rounded-full bg-emerald px-8 py-3.5 text-sm font-bold text-navy shadow-lg shadow-emerald/25 transition-all hover:bg-emerald-light"
              >
                Request a Fixed Quote
              </Link>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
