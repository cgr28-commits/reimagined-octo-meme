import type { Metadata } from "next";
import Link from "next/link";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import WhatsAppButton from "@/components/WhatsAppButton";
import { SITE } from "@/lib/data";
import { TERMS_LAST_UPDATED, TERMS_SECTIONS } from "@/lib/terms";

export const metadata: Metadata = {
  title: `Terms & Conditions | ${SITE.name}`,
  description: `Terms and conditions for booking airport transfers with ${SITE.name}.`,
};

export default function TermsPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen bg-navy pt-24 pb-16">
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
            <p className="text-sm font-semibold uppercase tracking-widest text-emerald">
              Legal
            </p>
            <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">
              Terms &amp; Conditions
            </h1>
            <p className="mt-3 text-lg text-white/70">{SITE.name}</p>
            <p className="mt-1 text-sm text-white/40">Last updated: {TERMS_LAST_UPDATED}</p>
          </header>

          <div className="mt-12 space-y-10">
            {TERMS_SECTIONS.map((section, index) => (
              <section
                key={section.title}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8"
              >
                <h2 className="text-lg font-bold text-white">
                  {index + 1}. {section.title}
                </h2>

                {"content" in section &&
                  section.content?.map((paragraph) => (
                    <p key={paragraph} className="mt-4 text-sm leading-relaxed text-white/65">
                      {paragraph}
                    </p>
                  ))}

                {"list" in section && section.list && (
                  <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-white/65">
                    {section.list.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}

                {"subsections" in section &&
                  section.subsections?.map((subsection) => (
                    <div key={subsection.subtitle} className="mt-5">
                      <h3 className="text-sm font-semibold text-emerald">
                        {subsection.subtitle}
                      </h3>
                      {subsection.content.map((paragraph) => (
                        <p
                          key={paragraph}
                          className="mt-2 text-sm leading-relaxed text-white/65"
                        >
                          {paragraph}
                        </p>
                      ))}
                    </div>
                  ))}

                {"footer" in section && section.footer && (
                  <p className="mt-4 text-sm leading-relaxed text-white/65">{section.footer}</p>
                )}
              </section>
            ))}
          </div>
        </div>
      </main>
      <Footer />
      <WhatsAppButton />
    </>
  );
}
