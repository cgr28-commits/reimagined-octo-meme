import type { Metadata } from "next";
import Link from "next/link";
import Logo from "@/components/Logo";
import StandaloneBrandBar from "@/components/StandaloneBrandBar";
import { SITE } from "@/lib/data";
import EmailContactClient from "./EmailContactClient";

/**
 * Email contact page (owner, 17 Nov 2026): a short form that sends a message to the bookings
 * inbox, linked from the Contact page. No telephone number is shown here or on the Contact page.
 */
export const metadata: Metadata = {
  title: "Email My Airport Taxi NI | Contact",
  description: `Send ${SITE.name} a message and we'll reply by email. For a price, get your fixed quote online in seconds.`,
  alternates: {
    canonical: "/contact/email/",
  },
  // A form, not a landing page: keep it out of search results (it is not in the sitemap either).
  robots: { index: false, follow: true },
};

export default function EmailContactPage() {
  return (
    <>
      <StandaloneBrandBar showCall={false} />
      <main data-customer-standalone data-brand-green className="relative min-h-dvh w-full max-w-full overflow-x-clip bg-navy">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden bg-[radial-gradient(ellipse_at_top,_rgba(47,191,74,0.14),_transparent_55%),radial-gradient(ellipse_at_bottom,_rgba(12,42,82,0.9),_transparent_60%)]"
        />

        <div className="relative mx-auto flex w-full max-w-lg flex-col px-4 pb-12 pt-6 sm:px-6 sm:pt-8">
          {/* Phones and tablets: the logo, linking home. 1200px+: it sits in the brand bar above. */}
          <Link href="/" aria-label={`${SITE.name} home`} className="mb-3 self-start min-[75rem]:hidden">
            <Logo wide className="h-9 max-w-[70vw] sm:h-11" />
          </Link>
          <Link
            href="/contact/"
            className="inline-flex min-h-11 items-center self-start text-sm font-semibold text-emerald transition-colors hover:text-emerald-light"
          >
            <span aria-hidden="true" className="mr-1.5">
              ←
            </span>
            Contact
          </Link>

          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">Email My Airport Taxi NI</h1>
          <p className="mt-2 text-sm leading-relaxed text-white/70 sm:text-base">
            Send us a message and we&apos;ll reply by email.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-white/70 sm:text-base">
            Looking for a price?{" "}
            <Link href="/#quote" className="font-semibold text-emerald underline underline-offset-2">
              Get your fixed price online
            </Link>{" "}
            in seconds.
          </p>

          <EmailContactClient />

          <p className="mt-6 text-center text-sm leading-relaxed text-white/70">
            Prefer your own email?{" "}
            <a href={`mailto:${SITE.email}`} className="break-all font-semibold text-emerald underline underline-offset-2">
              {SITE.email}
            </a>
          </p>
        </div>
      </main>
    </>
  );
}
