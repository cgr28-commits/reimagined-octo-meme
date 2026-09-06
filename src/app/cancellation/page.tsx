import type { Metadata } from "next";
import Link from "next/link";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import { BUSINESS_LEGAL } from "@/lib/business-legal";
import { SITE } from "@/lib/data";
import { CANCELLATION_POLICY_VERSION } from "../../../shared/refund-ops";
import {
  CANCELLATION_POLICY_PAGE_INTRO,
  CANCELLATION_POLICY_SECTIONS,
  CHECKOUT_CANCELLATION_HEADING,
  CHECKOUT_CANCELLATION_SUMMARY,
} from "../../../shared/cancellation-policy";

export const metadata: Metadata = {
  title: `Cancellation Policy | ${SITE.name}`,
  description: `Cancellation and refund policy for airport transfer bookings with ${SITE.name}.`,
  alternates: {
    canonical: "/cancellation/",
  },
};

export default function CancellationPolicyPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen overflow-x-clip bg-navy pb-16 pt-36 md:pt-28">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-white/50 transition-colors hover:text-emerald"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back to home
          </Link>

          <header className="mt-8">
            <p className="text-sm font-semibold uppercase tracking-widest text-emerald">Legal</p>
            <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">
              {CHECKOUT_CANCELLATION_HEADING}
            </h1>
            <p className="mt-3 text-lg text-white/70">{SITE.name}</p>
            <p className="mt-1 text-sm text-white/40">Last updated: {CANCELLATION_POLICY_VERSION}</p>
            <div className="mt-6 rounded-2xl border border-amber-300/35 bg-amber-500/10 p-5 text-sm leading-relaxed text-white/85">
              <p className="font-semibold text-white">{CHECKOUT_CANCELLATION_HEADING}</p>
              <p className="mt-2">{CHECKOUT_CANCELLATION_SUMMARY}</p>
              <p className="mt-3 text-white/70">{CANCELLATION_POLICY_PAGE_INTRO}</p>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-white/55">
              {BUSINESS_LEGAL.tradingName}. Questions:{" "}
              <a href={`mailto:${BUSINESS_LEGAL.email}`} className="text-emerald hover:underline">
                {BUSINESS_LEGAL.email}
              </a>
              . This page sits alongside our{" "}
              <Link href="/terms/" className="text-emerald hover:underline">
                Terms &amp; Conditions
              </Link>
              .
            </p>
          </header>

          <div className="mt-12 space-y-10">
            {CANCELLATION_POLICY_SECTIONS.map((section) => (
              <section
                key={section.title}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8"
              >
                <h2 className="text-lg font-bold text-white">{section.title}</h2>
                {section.content.map((paragraph) => (
                  <p key={paragraph} className="mt-4 text-sm leading-relaxed text-white/65">
                    {paragraph}
                  </p>
                ))}
              </section>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
