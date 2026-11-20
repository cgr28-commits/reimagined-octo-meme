import type { Metadata } from "next";
import Link from "next/link";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import QuoteNavLink from "@/components/QuoteNavLink";
import { FAQS, SITE } from "@/lib/data";
import { AIRPORT_PAGES } from "@/lib/location-pages";
import { CHECKOUT_CANCELLATION_SUMMARY } from "../../../shared/cancellation-policy";

const PATH = "/airport-transfer-prices/";

export const metadata: Metadata = {
  title: `How Airport Transfer Prices Work | ${SITE.name}`,
  description:
    "How fixed airport taxi prices work, including airport charges, tolls, waiting time, flight delays, cancellation and the return booking discount.",
  alternates: { canonical: PATH },
};

function siteFaq(question: string): string {
  const answer = FAQS.find((item) => item.question === question)?.answer;
  if (!answer) throw new Error(`Missing FAQ: ${question}`);
  return answer;
}

function airportFaq(code: string, question: string): string {
  const answer = AIRPORT_PAGES.find((page) => page.code === code)?.faqs?.find(
    (item) => item.question === question,
  )?.answer;
  if (!answer) throw new Error(`Missing ${code} FAQ: ${question}`);
  return answer;
}

const SECTIONS: Array<{ title: string; paragraphs: string[] }> = [
  {
    title: "Fixed-price quotes",
    paragraphs: [
      "Enter your street, passengers and suitcases in the quote box for your fixed fare. The price you are shown is the price for that journey.",
      "Any applicable time-of-day or seasonal pricing is already included in the quoted total. Vehicle supplements form part of the journey fare.",
      airportFaq("DUB", "How much is a taxi from Belfast to Dublin Airport?"),
    ],
  },
  {
    title: "Airport access and pickup charges",
    paragraphs: [
      airportFaq("BFS", "Is the airport drop-off or pick-up charge included?"),
      airportFaq("BHD", "Is the Express Drop-Off or Pick-Up charge included?"),
    ],
  },
  {
    title: "Tolls",
    paragraphs: [siteFaq("Are tolls included?")],
  },
  {
    title: "Waiting time",
    paragraphs: [siteFaq("How much airport waiting time is included?")],
  },
  {
    title: "Flight delays",
    paragraphs: [siteFaq("Do you monitor flights?")],
  },
  {
    title: "Cancellation and refunds",
    paragraphs: [CHECKOUT_CANCELLATION_SUMMARY],
  },
  {
    title: "Return bookings",
    paragraphs: [
      siteFaq("Can I book a return journey?"),
      "The 5% return discount applies to the combined vehicle fare for both legs, including any night or weekend premium on that fare. Airport access charges and tolls are added in full and are not discounted. The quote shows the total before you pay.",
    ],
  },
];

export default function AirportTransferPricesPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen overflow-x-clip bg-navy pb-16 pt-36 md:pt-28">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-white/50 transition-colors hover:text-emerald"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to home
          </Link>

          <header className="mt-8">
            <p className="text-sm font-semibold uppercase tracking-widest text-emerald">Airport transfers</p>
            <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">How airport transfer prices work</h1>
            <p className="mt-4 text-sm leading-relaxed text-white/70">
              The price for your journey comes from the quote, using your addresses, date, time, passengers and
              suitcases. This page explains what that price includes.
            </p>
            <div className="mt-6">
              <QuoteNavLink
                href="/#quote"
                className="inline-flex min-h-11 items-center rounded-full bg-emerald px-6 py-3 text-sm font-bold text-navy shadow-lg shadow-emerald/25 transition-all hover:bg-emerald-light"
              >
                Get your fixed price
              </QuoteNavLink>
            </div>
          </header>

          <div className="mt-12 space-y-8">
            {SECTIONS.map((section) => (
              <section
                key={section.title}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8"
              >
                <h2 className="text-lg font-bold text-white">{section.title}</h2>
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph} className="mt-4 text-sm leading-relaxed text-white/65">
                    {paragraph}
                  </p>
                ))}
                {section.title === "Cancellation and refunds" ? (
                  <p className="mt-4 text-sm leading-relaxed text-white/65">
                    <Link href="/cancellation/" className="text-emerald underline underline-offset-4">
                      Read the cancellation policy
                    </Link>
                    .
                  </p>
                ) : null}
              </section>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
