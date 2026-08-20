import type { Metadata } from "next";
import Link from "next/link";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import { SITE } from "@/lib/data";
import { PRIVACY_LAST_UPDATED, PRIVACY_SECTIONS } from "@/lib/privacy";

export const metadata: Metadata = {
  title: `Privacy Policy | ${SITE.name}`,
  description: `How ${SITE.name} collects, uses and protects your personal data.`,
  alternates: {
    canonical: "/privacy/",
  },
};

export default function PrivacyPage() {
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
            <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Privacy Policy</h1>
            <p className="mt-3 text-lg text-white/70">{SITE.name}</p>
            <p className="mt-1 text-sm text-white/40">Last updated: {PRIVACY_LAST_UPDATED}</p>
          </header>

          <div className="mt-12 space-y-10">
            {PRIVACY_SECTIONS.map((section, index) => (
              <section
                key={section.title}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8"
              >
                <h2 className="text-lg font-bold text-white">
                  {index + 1}. {section.title}
                </h2>

                {section.content.map((paragraph) => (
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

                {"footer" in section && section.footer && (
                  <p className="mt-4 text-sm leading-relaxed text-white/65">{section.footer}</p>
                )}
              </section>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
