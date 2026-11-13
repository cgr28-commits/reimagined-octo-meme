import GoogleReviewsBadge from "./GoogleReviewsBadge";
import DesktopQuoteBenefits from "./DesktopQuoteBenefits";
import HeroBenefitsRow from "./HeroBenefitsRow";
import HomepageHeroSideRails from "./HomepageHeroSideRails";
import OptimizedHeroPicture from "./OptimizedHeroPicture";
import QuoteCard from "./QuoteCard";
import QuoteHelpContact from "./QuoteHelpContact";
import type { ReactNode } from "react";
import type { TownGuidePickup } from "@/lib/selected-place";

/** Journey details a landing page hands to the quote tool (the homepage passes none). */
export type QuoteHeroJourney = {
  airportCode?: string;
  direction?: "to-airport" | "from-airport";
  addressHint?: string;
  guidePickup?: TownGuidePickup | null;
  bookingIntroduction?: string;
  preferMinibus?: boolean;
  businessClassAnyRoute?: boolean;
};

type Props = {
  /** Landing pages: the page's own H1 text. Omit for the homepage heading. */
  heading?: ReactNode;
  /** Landing pages: the page's own short introduction. Omit for the homepage wording. */
  intro?: string;
  journey?: QuoteHeroJourney;
  /** Marks the H1 as the menu's scroll/focus target for this page. */
  navId?: string;
};

const HOMEPAGE_INTRO =
  "Professional, pre-booked airport transfers and private travel across Northern Ireland and beyond. Whether you’re travelling to the airport, attending an event or planning a longer journey, enjoy comfortable, reliable transport at a fixed price.";

/**
 * Server component: static H1/copy stay outside the QuoteCard client boundary.
 * Tablet keeps the Belfast International photograph. Desktop uses a static navy
 * gradient; phones retain their existing navy background.
 */
export default function HeroSlideshow({ heading, intro, journey, navId }: Props = {}) {
  const introText = intro ?? HOMEPAGE_INTRO;
  // Homepage only: split after the first sentence so phones can show the short version.
  const introSplit = intro ? null : /^([\s\S]+?[.!?])\s+([\s\S]+)$/.exec(introText);
  const introLead = introSplit ? introSplit[1] : introText;
  const introMore = introSplit ? introSplit[2] : "";
  return (
    <section className="homepage-hero relative max-w-full overflow-x-clip overflow-y-hidden bg-navy pt-16 md:pt-28">
      <div className="homepage-hero-media absolute inset-0 overflow-hidden bg-navy" aria-hidden="true">
        <OptimizedHeroPicture
          baseName="belfast-international-homepage"
          alt=""
          priority
          widths={[960, 1280]}
          width={1280}
          height={720}
          loadFromMinWidth={768}
          className="homepage-hero-photo hero-photo absolute inset-0 h-full w-full object-cover"
        />
        <div className="homepage-hero-scrim absolute inset-0" />
      </div>

      {/* Mobile: short heading, then the benefit icons, then the quote form.
          Tablet (md): quote first, then the heading.
          Desktop (lg+): heading, then benefits above a centred quote form. */}
      <div className="homepage-hero-layout desktop-shell relative mx-auto grid w-full min-w-0 max-w-7xl grid-cols-1 gap-1.5 px-4 py-1.5 sm:px-6 md:gap-12 md:px-6 md:py-16 lg:max-w-[1400px] lg:items-start lg:gap-14 lg:px-10 lg:py-14 xl:gap-16 xl:px-12 xl:py-16">
        <HomepageHeroSideRails />
        <div id="homepage-booking-intro" className="homepage-hero-copy order-1 min-w-0 text-center md:order-2 lg:order-1 lg:pt-2">
          <h1 {...(navId ? { "data-site-nav-heading": navId, tabIndex: -1 } : {})} className="font-sans text-balance text-[1.5625rem] font-semibold leading-[1.15] tracking-tight text-white md:text-[2.7rem] md:leading-[1.08] lg:text-[2.9rem] xl:text-[3.15rem] xl:leading-[1.06]">
            {heading ? (
              <span className="text-white">{heading}</span>
            ) : (
              <>
                <span className="text-white">Belfast &amp; Dublin Airport Transfers</span>{" "}
                <span className="text-emerald">&amp; Premium Private Travel</span>
              </>
            )}
          </h1>

          <p data-homepage-intro={intro ? undefined : true} className="mx-auto mt-1.5 max-w-xl text-pretty text-[0.9rem] leading-snug text-white/90 md:mt-5 md:text-lg md:leading-relaxed lg:mt-6 lg:text-[1.125rem]">
            {introText}
          </p>
          {/* Mobile Design 2 only (hidden elsewhere by CSS). */}
          <p className="hidden" data-d2-intro-sub>Pre-booked taxis at a fixed price, across all of Ireland.</p>
          {/* Mobile Design 3 only (hidden elsewhere by CSS). */}
          {/* Phones show only the first sentence (data-d3-intro-more is hidden by CSS below 768px). */}
          <p className="hidden" data-d3-intro-sub>
            {introLead}
            {introMore ? <span data-d3-intro-more> {introMore}</span> : null}
          </p>
          <div className="hidden" data-d2-rating>
            <GoogleReviewsBadge variant="compact" />
          </div>
        </div>

        <div
          className="homepage-hero-quote order-2 min-w-0 w-full scroll-mt-20 md:order-1 md:scroll-mt-28 lg:order-2 lg:justify-self-stretch"
          id="quote"
        >
          <HeroBenefitsRow />
          <QuoteCard
            presentation="homepage"
            homepagePolish
            bookingIntroduction={journey?.bookingIntroduction}
            initialAirportCode={journey?.airportCode ?? ""}
            initialDirection={journey?.direction ?? "to-airport"}
            initialAddressHint={journey?.addressHint ?? ""}
            initialGuidePickup={journey?.guidePickup ?? null}
            preferMinibus={journey?.preferMinibus ?? false}
            businessClassAnyRoute={journey?.businessClassAnyRoute ?? false}
          />
          <QuoteHelpContact />
          <div className="mt-4 flex justify-center" data-hero-reviews-badge>
            <GoogleReviewsBadge />
          </div>
          <DesktopQuoteBenefits />
        </div>
      </div>
    </section>
  );
}
