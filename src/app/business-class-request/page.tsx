import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import LandingBreadcrumbs from "@/components/LandingBreadcrumbs";
import BespokeRequestForm from "@/components/BespokeRequestForm";
import { SITE } from "@/lib/data";
import { LANDING_PAGE_MAIN_CLASS } from "@/lib/landing-page-layout";
import { BESPOKE_PUBLIC_PAGES_ENABLED, BUSINESS_CLASS_REQUEST_PATH } from "@/lib/bespoke-public";
import {
  BUSINESS_CLASS_REQUEST_POINTS,
  BUSINESS_CLASS_REQUEST_SEO_DESCRIPTION,
  BUSINESS_CLASS_REQUEST_SEO_TITLE,
} from "@/lib/belfast-events-content";
import { getBreadcrumbJsonLd } from "@/lib/structured-data";

export function generateMetadata(): Metadata {
  if (!BESPOKE_PUBLIC_PAGES_ENABLED) return { title: "Page not found", robots: { index: false, follow: false } };
  return {
    title: { absolute: `${BUSINESS_CLASS_REQUEST_SEO_TITLE} | ${SITE.name}` },
    description: BUSINESS_CLASS_REQUEST_SEO_DESCRIPTION,
    alternates: { canonical: BUSINESS_CLASS_REQUEST_PATH },
  };
}

export default function BusinessClassRequestPage() {
  if (!BESPOKE_PUBLIC_PAGES_ENABLED) notFound();
  const breadcrumb = getBreadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Business Class request", path: BUSINESS_CLASS_REQUEST_PATH },
  ]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <Header />
      <main className={LANDING_PAGE_MAIN_CLASS} data-bespoke-request-page="business_class">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <LandingBreadcrumbs items={[{ name: "Home", href: "/" }, { name: "Business Class request" }]} />
          <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="min-w-0">
              <p className="text-sm font-semibold uppercase tracking-widest text-emerald">Business Class</p>
              <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Bespoke Business Class request</h1>
              <p className="mt-4 text-base leading-relaxed text-white/70">
                For journeys that need a personal touch, such as corporate travel, VIP guests or a special occasion. Tell us what you need and we&apos;ll email a personal fixed quotation.
              </p>
              <ul className="mt-5 space-y-2 text-sm text-white/75">
                {BUSINESS_CLASS_REQUEST_POINTS.map((p) => (
                  <li key={p} className="flex gap-2.5">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald" aria-hidden="true" />
                    {p}
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <BespokeRequestForm category="business_class" />
              </div>
            </div>
            <aside className="space-y-4 lg:pt-24" aria-label="About Business Class">
              <div className="rounded-2xl border border-emerald/30 bg-emerald/10 p-5">
                <h2 className="text-base font-bold text-white">Just need an airport transfer?</h2>
                <p className="mt-2 text-sm leading-relaxed text-white/75">
                  Standard airport journeys in Business Class have an instant fixed price, with no need to wait for a quotation.
                </p>
                <Link href="/#quote" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-emerald underline">
                  Get an instant airport quote
                </Link>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <h2 className="text-base font-bold text-white">Prefer to talk?</h2>
                <p className="mt-2 text-sm leading-relaxed text-white/70">
                  Call <a className="font-semibold text-emerald underline" href={`tel:${SITE.officeLandline}`}>{SITE.officeLandlineDisplay}</a>.
                </p>
              </div>
            </aside>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
