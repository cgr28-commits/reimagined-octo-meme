import Link from "next/link";
import QuoteNavLink from "./QuoteNavLink";
import Logo from "./Logo";
import { SITE } from "@/lib/data";

/**
 * Slim navy brand bar for focused customer screens (payment links, saved quotes, Manage Booking,
 * tracking, tips). Desktop 1200px+ only: logo and a Contact link, no site navigation,
 * so it never pulls customers away from the task. Below 1200px the pages keep their own layout.
 *
 * The telephone number appears on the Contact page only (owner, 17 Nov 2026), so this bar links to
 * Contact instead of showing a call button. `showCall={false}` (the Contact pages) hides that link.
 */
export default function StandaloneBrandBar({
  quoteLink = false,
  showCall = true,
}: { quoteLink?: boolean; showCall?: boolean } = {}) {
  return (
    <div data-standalone-brand-bar className="hidden border-b border-white/10 bg-[#071c38] min-[75rem]:block">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-6 px-10 py-3 xl:px-12">
        <Link href="/" aria-label={`${SITE.name} home`} className="shrink-0">
          <Logo wide className="h-12 w-auto" />
        </Link>
        <div className="flex items-center gap-3">
          {showCall ? (
            <Link
              href="/contact/"
              data-brand-bar-contact-link
              className="inline-flex min-h-11 items-center rounded-full border border-white/20 px-5 py-2 text-sm font-semibold text-white/90 transition-colors hover:border-emerald hover:text-emerald"
            >
              Contact
            </Link>
          ) : null}
          {quoteLink ? (
            <QuoteNavLink
              href="/#quote"
              className="inline-flex min-h-11 items-center rounded-full bg-emerald px-5 py-2 text-sm font-bold text-navy"
            >
              Get a Quote
            </QuoteNavLink>
          ) : null}
        </div>
      </div>
    </div>
  );
}
