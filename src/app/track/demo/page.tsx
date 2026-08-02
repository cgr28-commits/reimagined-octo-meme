import Link from "next/link";
import type { Metadata } from "next";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import { SITE } from "@/lib/data";
import { DEMO_DRIVER_KEY, DEMO_SCENARIOS } from "@/lib/tracking-demo";

export const metadata: Metadata = {
  title: `Tracking demo | ${SITE.name}`,
  description: "Preview what customers see at each stage of live driver tracking.",
  robots: {
    index: false,
    follow: false,
  },
  alternates: {
    canonical: "/track/demo/",
  },
};

export default function TrackDemoPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen overflow-x-clip bg-navy pb-16 pt-44 md:pt-28">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <header className="mb-8">
            <p className="text-sm font-semibold uppercase tracking-widest text-emerald">
              Preview
            </p>
            <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">
              Live tracking demo
            </h1>
            <p className="mt-3 text-white/70">
              These examples show what a customer sees at each stage. No real booking or driver
              location is used.
            </p>
          </header>

          <div className="space-y-4">
            {DEMO_SCENARIOS.map((scenario) => (
              <Link
                key={scenario.token}
                href={`/track/?id=${scenario.token}`}
                className="block rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-colors hover:border-emerald/40 hover:bg-white/[0.05]"
              >
                <h2 className="text-lg font-bold text-white">{scenario.title}</h2>
                <p className="mt-2 text-sm text-white/65">{scenario.description}</p>
                <p className="mt-3 text-sm font-medium text-emerald">Open customer view →</p>
              </Link>
            ))}
          </div>

          <section className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
            <h2 className="text-lg font-bold text-white">Driver dashboard demo</h2>
            <p className="mt-2 text-sm text-white/65">
              Open the driver page and use access key{" "}
              <code className="rounded bg-white/10 px-2 py-0.5 text-emerald">{DEMO_DRIVER_KEY}</code>{" "}
              to preview today&apos;s demo jobs.
            </p>
            <Link
              href="/driver/"
              className="mt-4 inline-flex rounded-xl bg-emerald px-5 py-3 text-sm font-semibold text-navy transition-colors hover:bg-emerald/90"
            >
              Open driver dashboard
            </Link>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
