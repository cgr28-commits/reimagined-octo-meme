import type { Metadata } from "next";
import Link from "next/link";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import LandingBreadcrumbs from "@/components/LandingBreadcrumbs";
import LandingCtaRow from "@/components/LandingCtaRow";
import { LandingPageStickyQuoteCta } from "@/components/LandingPageQuoteCta";
import { SITE } from "@/lib/data";
import { LANDING_PAGE_MAIN_CLASS } from "@/lib/landing-page-layout";
import {
  CRUISE_TERMINAL_BOOKING_DETAILS,
  CRUISE_TERMINAL_FAQS,
  CRUISE_TERMINAL_H1,
  CRUISE_TERMINAL_INTRO,
  CRUISE_TERMINAL_JOURNEYS,
  CRUISE_TERMINAL_NOTES,
  CRUISE_TERMINAL_PATH,
  CRUISE_TERMINAL_SEO_DESCRIPTION,
  CRUISE_TERMINAL_SEO_TITLE,
  CRUISE_TERMINAL_WHATSAPP_MESSAGE,
} from "@/lib/cruise-terminal-content";
import { getBreadcrumbJsonLd, getFaqPageJsonLd, getServiceAreaJsonLd } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: `${CRUISE_TERMINAL_SEO_TITLE} | ${SITE.name}`,
  description: CRUISE_TERMINAL_SEO_DESCRIPTION,
  alternates: {
    canonical: CRUISE_TERMINAL_PATH,
  },
};

export default function BelfastCruiseTerminalTransfersPage() {
  const breadcrumb = getBreadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: CRUISE_TERMINAL_H1, path: CRUISE_TERMINAL_PATH },
  ]);
  const serviceLd = getServiceAreaJsonLd({
    name: `${SITE.name} — ${CRUISE_TERMINAL_H1}`,
    description: CRUISE_TERMINAL_SEO_DESCRIPTION,
    path: CRUISE_TERMINAL_PATH,
    areaServed: [
      "Belfast Cruise Terminal",
      "Belfast",
      "Belfast International Airport",
      "George Best Belfast City Airport",
      "Dublin Airport",
    ],
    serviceType: "Private transfer",
  });
  const faqLd = getFaqPageJsonLd(CRUISE_TERMINAL_FAQS);

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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />
      <Header />
      <main className={LANDING_PAGE_MAIN_CLASS}>
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <LandingBreadcrumbs
            items={[{ name: "Home", href: "/" }, { name: CRUISE_TERMINAL_H1 }]}
          />

          <header className="mt-6">
            <p className="text-sm font-semibold uppercase tracking-widest text-emerald">
              Cruise transfers
            </p>
            <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">{CRUISE_TERMINAL_H1}</h1>
            <p className="mt-6 text-lg leading-relaxed text-white/70">{CRUISE_TERMINAL_INTRO}</p>
            <LandingCtaRow whatsappMessage={CRUISE_TERMINAL_WHATSAPP_MESSAGE} />
            <p className="mt-4 text-sm text-white/55">
              Cruise-terminal collections are confirmed by message so the meeting point can be
              agreed. The quote tool is the existing airport-transfer calculator — use it for
              standard airport journeys, or{" "}
              <Link href="/contact/" className="text-emerald hover:text-emerald-light">
                contact us
              </Link>{" "}
              to book your transfer.
            </p>
          </header>

          <section className="mt-12">
            <h2 className="text-xl font-bold text-white">Journeys we arrange</h2>
            <p className="mt-3 text-sm leading-relaxed text-white/60">
              Typical Belfast Cruise Terminal transfer requests are airport connections, hotel
              drop-offs after you leave the ship, and hotel collections on departure morning.
            </p>
            <ul className="mt-6 grid gap-3">
              {CRUISE_TERMINAL_JOURNEYS.map((journey) => (
                <li
                  key={journey.title}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4"
                >
                  <p className="text-base font-bold text-white">{journey.title}</p>
                  <p className="mt-2 text-sm leading-relaxed text-white/60">{journey.description}</p>
                  {"href" in journey && journey.href ? (
                    <p className="mt-3 text-sm">
                      <Link
                        href={journey.href}
                        className="text-emerald hover:text-emerald-light"
                      >
                        {journey.linkLabel}
                      </Link>
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-12 rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
            <h2 className="text-lg font-bold text-white">What to send when you enquire</h2>
            <p className="mt-3 text-sm leading-relaxed text-white/60">
              A short WhatsApp or email with the details below is enough for us to confirm whether
              we can cover the journey and where to meet.
            </p>
            <ul className="mt-5 space-y-3 text-sm leading-relaxed text-white/70">
              {CRUISE_TERMINAL_BOOKING_DETAILS.map((item) => (
                <li key={item} className="flex gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-8 grid gap-4">
            {CRUISE_TERMINAL_NOTES.map((note) => (
              <article
                key={note.title}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-6"
              >
                <h2 className="text-lg font-bold text-white">{note.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-white/65">{note.body}</p>
              </article>
            ))}
          </section>

          <section className="mt-12">
            <h2 className="text-lg font-bold text-white">Airport guides</h2>
            <p className="mt-3 text-sm leading-relaxed text-white/60">
              If the next part of the trip is a flight, these guides explain the airport transfer
              service we already run:
            </p>
            <p className="mt-4 text-sm text-white/55">
              <Link href="/airports/" className="text-emerald hover:text-emerald-light">
                All airport transfers
              </Link>
              {" · "}
              <Link
                href="/airports/belfast-international/"
                className="text-emerald hover:text-emerald-light"
              >
                Belfast International
              </Link>
              {" · "}
              <Link href="/airports/belfast-city/" className="text-emerald hover:text-emerald-light">
                Belfast City
              </Link>
              {" · "}
              <Link href="/airports/dublin/" className="text-emerald hover:text-emerald-light">
                Dublin Airport
              </Link>
            </p>
          </section>

          <section className="mt-12">
            <h2 className="text-lg font-bold text-white">Cruise transfer questions</h2>
            <dl className="mt-6 space-y-5">
              {CRUISE_TERMINAL_FAQS.map((faq) => (
                <div key={faq.question}>
                  <dt className="text-sm font-semibold text-white">{faq.question}</dt>
                  <dd className="mt-2 text-sm leading-relaxed text-white/65">{faq.answer}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="mt-12 rounded-2xl border border-emerald/30 bg-emerald/10 px-6 py-8 text-center sm:px-10">
            <h2 className="text-lg font-bold text-white">Book your Belfast cruise transfer</h2>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-white/75">
              Message us with the ship, date and destination to book your transfer. Use Get a Quote
              only for a standard airport journey on the existing calculator — we do not publish
              cruise-terminal fares here.
            </p>
            <div className="flex justify-center">
              <LandingCtaRow whatsappMessage={CRUISE_TERMINAL_WHATSAPP_MESSAGE} />
            </div>
            <p className="mt-4 text-sm">
              <Link href="/contact/" className="text-emerald hover:text-emerald-light">
                Contact and WhatsApp details
              </Link>
            </p>
          </section>
        </div>
        <LandingPageStickyQuoteCta />
      </main>
      <Footer />
    </>
  );
}
