import type { Metadata } from "next";
import Link from "next/link";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import SectionHeading from "@/components/SectionHeading";
import { SERVICE_FLAGS, SITE } from "@/lib/data";
import {
  LONG_DISTANCE_EXAMPLE_ROUTES,
  LONG_DISTANCE_HIGHLIGHTS,
  LONG_DISTANCE_INTRO,
  LONG_DISTANCE_PAGE_TITLE,
  LONG_DISTANCE_SEO_TITLE,
  LONG_DISTANCE_SERVICE_NOTES,
} from "@/lib/long-distance-content";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: `${LONG_DISTANCE_SEO_TITLE} | ${SITE.name}`,
  description: LONG_DISTANCE_INTRO,
  alternates: {
    canonical: "/long-distance-transfers/",
  },
};

export default function LongDistanceTransfersPage() {
  if (!SERVICE_FLAGS.addressToAddress) {
    notFound();
  }

  return (
    <>
      <Header />
      <main className="min-h-screen overflow-x-clip bg-navy pb-16 pt-36 md:pt-28">
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
                title={LONG_DISTANCE_PAGE_TITLE}
                description={LONG_DISTANCE_INTRO}
              />
            </div>

            <div className="mt-14 grid gap-6 sm:grid-cols-2">
              {LONG_DISTANCE_HIGHLIGHTS.map((item) => (
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
                These are examples only — enter your exact pickup and destination on the quote form.{" "}
                {LONG_DISTANCE_SERVICE_NOTES[0]}
              </p>
              <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                {LONG_DISTANCE_EXAMPLE_ROUTES.map((route) => (
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
                Use our live quote tool for Greater Belfast pickups, airport collections, and
                Northern Ireland pickups into Greater Belfast. Online prices apply where available;
                other out-of-area requests use Request Fixed Quote for manual approval.
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
