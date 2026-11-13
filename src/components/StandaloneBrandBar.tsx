import Link from "next/link";
import CallUsButton from "./CallUsButton";
import QuoteNavLink from "./QuoteNavLink";
import Logo from "./Logo";
import { SITE } from "@/lib/data";

/**
 * Slim navy brand bar for focused customer screens (payment links, saved quotes, Manage Booking,
 * tracking, tips). Desktop 1200px+ only: logo and the shared Call Us button, no site navigation,
 * so it never pulls customers away from the task. Below 1200px the pages keep their own layout.
 */
export default function StandaloneBrandBar({ quoteLink = false }: { quoteLink?: boolean } = {}) {
  return (
    <div data-standalone-brand-bar className="hidden border-b border-white/10 bg-[#071c38] min-[75rem]:block">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-6 px-10 py-3 xl:px-12">
        <Link href="/" aria-label={`${SITE.name} home`} className="shrink-0">
          <Logo wide className="h-12 w-auto" />
        </Link>
        <div className="flex items-center gap-3">
          <CallUsButton variant="header" />
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
