import Link from "next/link";
import { EVENTS_HUB_PATH, EVENTS_HUB_PUBLIC_ENABLED } from "@/lib/bespoke-public";
import GoogleReviewsBadge from "./GoogleReviewsBadge";
import HubHeadingText from "./HubHeadingText";
import FromAirportText from "./FromAirportText";
import DesktopQuoteBenefits from "./DesktopQuoteBenefits";
import HeroBenefitsRow from "./HeroBenefitsRow";
import HomepageHeroSideRails from "./HomepageHeroSideRails";
import AirportPageHeroPhoto from "./AirportPageHeroPhoto";
import OptimizedHeroPicture from "./OptimizedHeroPicture";
import QuoteCard from "./QuoteCard";
import QuoteHelpContact from "./QuoteHelpContact";
import type { ReactNode } from "react";
import type { AirportPageHero } from "@/lib/airport-page-hero";
import type { SelectedPlace, TownGuidePickup } from "@/lib/selected-place";
import type { SavedQuotePublicSummary } from "@/lib/saved-quote-api";

/** Journey details a landing page hands to the quote tool (the homepage passes none). */
export type QuoteHeroJourney = {
  eventTransfer?: boolean;
  event?: { title: string; date: string };
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
  /** Exact place or service to accent in a plain text landing-page heading. */
  headingSubject?: string;
  /** Landing pages: the page's own short introduction. Omit for the homepage wording. */
  intro?: string;
  /** Town-to-airport landing pages: intro shown instead when opened with ?from=airport. */
  introFromAirport?: string;
  /** The ?from= value that switches to introFromAirport (default "airport"). */
  introFromValue?: string;
  journey?: QuoteHeroJourney;
  eventChoices?: ReactNode;
  /** Marks the H1 as the menu's scroll/focus target for this page. */
  navId?: string;
  /** Saved-quote link: the quote to restore into the tool. */
  restore?: {
    quote: SavedQuotePublicSummary;
    journeyIntent: "to-airport" | "from-airport" | "address-to-address";
    pickupPlace: SelectedPlace;
    dropoffPlace: SelectedPlace;
    dropoffHint?: string;
  };
  /** Landing pages: this page's own hero background photo (768px+). Default: Belfast International. */
  heroBackground?: { baseName: string; widths: readonly number[] };
  /**
   * Airport guide pages (Design 3, up to 1199px): the homepage phone hero with this airport's
   * photo, airport quick picks in the quote card, and the tablet photo hero. Replaces the
   * background photo above, which is hidden at every width and would only waste a download.
   */
  airportPhoto?: AirportPageHero;
  /**
   * The rotating image cards under the quote tool (laptops 1200px+). Off by default, and no
   * page turns them on since the owner removed them from the homepage (17 Nov 2026).
   */
  showRotatingCards?: boolean;
  /**
   * Homepage only, laptops 1200px+ (owner, 17 Nov 2026): more room for the heading and intro,
   * with the quote tool lower and bigger. Styling only — see [data-desktop-roomy] in globals.css.
   */
  desktopRoomy?: boolean;
  /** Saved-quote summary and Book button, shown above the quote tool at every step. */
  belowIntro?: ReactNode;
  /** Homepage only: neutral quote tool with airport quick picks and "More journeys" links. */
  homepageQuickPicks?: boolean;
  /** Page-specific quote card title (e.g. "Events & Concerts"). */
  quoteCardTitle?: string;
};

/** Homepage only: other journey types, linking to their own pages (owner, 14 Nov 2026). */
const MORE_JOURNEYS = [
  { href: "/transfers/belfast-to-dublin-airport/", label: "Belfast ↔ Dublin" },
  { href: "/belfast-cruise-terminal-transfers/", label: "Cruise port" },
  { href: "/belfast-grand-central-station-taxi/", label: "Train station" },
  // Only while the Events pages are switched on; otherwise this link would 404.
  ...(EVENTS_HUB_PUBLIC_ENABLED ? [{ href: EVENTS_HUB_PATH, label: "Events & concerts" }] : []),
];

function HomepageMoreJourneys() {
  return (
    <nav aria-label="More journeys" data-more-journeys className="mx-auto mt-3 flex max-w-xl flex-wrap items-center justify-center gap-x-1.5 gap-y-2 text-[13px]">
      <span data-more-journeys-label className="font-semibold">Popular:</span>
      {MORE_JOURNEYS.map((j) => (
        <Link key={j.href} href={j.href} className="inline-flex min-h-9 items-center rounded-full border border-white/25 bg-white/10 px-3 font-semibold text-white hover:border-emerald hover:bg-white/15">
          {j.label}
        </Link>
      ))}
    </nav>
  );
}

const HOMEPAGE_INTRO =
  "Professional, pre-booked airport transfers and private travel across Northern Ireland and beyond. Whether you’re travelling to the airport, attending an event or planning a longer journey, enjoy comfortable, reliable transport at a fixed price.";

/**
 * Server component: static H1/copy stay outside the QuoteCard client boundary.
 * Tablet keeps the Belfast International photograph. Desktop uses a static navy
 * gradient; phones retain their existing navy background.
 */
export default function HeroSlideshow({ heading, headingSubject, intro, introFromAirport, introFromValue, journey, eventChoices, navId, restore, belowIntro, homepageQuickPicks = false, heroBackground, airportPhoto, showRotatingCards = false, desktopRoomy = false, quoteCardTitle }: Props = {}) {
  const introText = intro ?? HOMEPAGE_INTRO;
  // Homepage and airport pages: split after the first sentence so phones can show the short version.
  const introSplit = intro ? null : /^([\s\S]+?[.!?])\s+([\s\S]+)$/.exec(introText);
  const leadSplit = introSplit ?? (airportPhoto && !introFromAirport ? /^([\s\S]+?[.!?])\s+([\s\S]+)$/.exec(introText) : null);
  const introLead = leadSplit ? leadSplit[1] : introText;
  const introMore = leadSplit ? leadSplit[2] : "";
  return (
    <section data-desktop-roomy={desktopRoomy ? "" : undefined} data-airport-page={airportPhoto ? "" : undefined} className="homepage-hero relative max-w-full overflow-x-clip overflow-y-hidden bg-navy pt-16 md:pt-28">
      {airportPhoto ? (
        <AirportPageHeroPhoto {...airportPhoto} />
      ) : (
        <div className="homepage-hero-media absolute inset-0 overflow-hidden bg-navy" aria-hidden="true">
          <OptimizedHeroPicture
            baseName={heroBackground?.baseName ?? "belfast-international-homepage"}
            alt=""
            priority
            widths={heroBackground?.widths ?? [960, 1280]}
            width={1280}
            height={720}
            loadFromMinWidth={768}
            className="homepage-hero-photo hero-photo absolute inset-0 h-full w-full object-cover"
          />
          <div className="homepage-hero-scrim absolute inset-0" />
        </div>
      )}

      {belowIntro ? (
        <div data-saved-quote-banner className="relative z-10 mx-auto w-full max-w-7xl px-4 pt-3 sm:px-6 md:pt-0 lg:max-w-[1400px] lg:px-10 xl:px-12">{belowIntro}</div>
      ) : null}

      {/* Mobile: short heading, then the benefit icons, then the quote form.
          Tablet (md): quote first, then the heading.
          Desktop (lg+): heading, then benefits above a centred quote form. */}
      <div className="homepage-hero-layout desktop-shell relative mx-auto grid w-full min-w-0 max-w-7xl grid-cols-1 gap-1.5 px-4 py-1.5 sm:px-6 md:gap-12 md:px-6 md:py-16 lg:max-w-[1400px] lg:items-start lg:gap-14 lg:px-10 lg:py-14 xl:gap-16 xl:px-12 xl:py-16">
        {showRotatingCards ? <HomepageHeroSideRails /> : null}
        <div id="homepage-booking-intro" className="homepage-hero-copy order-1 min-w-0 text-center md:order-2 lg:order-1 lg:pt-2">
          <h1 {...(navId ? { "data-site-nav-heading": navId, tabIndex: -1 } : {})} className="font-sans text-balance text-[1.5625rem] font-semibold leading-[1.15] tracking-tight text-white md:text-[2.7rem] md:leading-[1.08] lg:text-[2.9rem] xl:text-[3.15rem] xl:leading-[1.06]">
            {heading ? (
              <span className="text-white">
                {typeof heading === "string" && headingSubject
                  ? <HubHeadingText text={heading} subject={headingSubject} />
                  : heading}
              </span>
            ) : (
              <>
                <span className="text-white">Belfast &amp; Dublin <span data-hero-green className="text-emerald">Airport Transfers</span></span>{" "}
                
              </>
            )}
          </h1>

          <p data-homepage-intro={intro ? undefined : true} className="mx-auto mt-1.5 max-w-xl text-pretty text-[0.9rem] leading-snug text-white/90 md:mt-5 md:text-lg md:leading-relaxed lg:mt-6 lg:text-[1.125rem]">
            <span data-intro-default>
              <FromAirportText text={introText} fromAirportText={introFromAirport} fromValue={introFromValue} />
            </span>
            {/* Desktop homepage (owner, 17 Nov 2026): the shorter wording; shown by desktop-home-premium.css from 1200px. */}
            {introSplit ? (
              <span data-intro-desktop hidden>
                Professional, pre-booked airport transfers across Northern Ireland and the Republic of Ireland.
              </span>
            ) : null}
          </p>
          {/* Mobile Design 2 only (hidden elsewhere by CSS). */}
          <p className="hidden" data-d2-intro-sub>Pre-booked taxis at a fixed price, across all of Ireland.</p>
          {/* Mobile Design 3 only (hidden elsewhere by CSS). */}
          {/* Phones show only the first sentence (data-d3-intro-more is hidden by CSS below 768px). */}
          <p className="hidden" data-d3-intro-sub>
            <span data-d3-intro-lead>
              <FromAirportText text={introLead} fromAirportText={introSplit ? undefined : introFromAirport} fromValue={introFromValue} />
            </span>
            {introMore ? <span data-d3-intro-more> {introMore}</span> : null}
            {/* Homepage on phones only (owner, 17 Nov 2026); mobile-home-mockup.css shows it up to 767px.
                Tablet and desktop keep the wording above. */}
            {introSplit ? (
              <span data-d3-intro-phone hidden>
                Professional, pre-booked airport transfers across Northern Ireland and the Republic of Ireland.
              </span>
            ) : null}
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
            homepageQuickPicks={homepageQuickPicks ? true : airportPhoto ? "phone-tablet" : false}
            quoteCardTitle={quoteCardTitle}
            bookingIntroduction={journey?.bookingIntroduction}
            initialEventTransfer={journey?.eventTransfer}
            initialEvent={journey?.event}
            eventChoices={eventChoices}
            initialAirportCode={journey?.airportCode ?? ""}
            initialDirection={journey?.direction ?? "to-airport"}
            initialAddressHint={journey?.addressHint ?? ""}
            initialGuidePickup={journey?.guidePickup ?? null}
            preferMinibus={journey?.preferMinibus ?? false}
            businessClassAnyRoute={journey?.businessClassAnyRoute ?? false}
            {...(restore ? {
              restoredQuote: restore.quote,
              initialJourneyIntent: restore.journeyIntent,
              initialPickupPlace: restore.pickupPlace,
              initialDropoffPlace: restore.dropoffPlace,
              initialDropoffHint: restore.dropoffHint,
            } : {})}
          />
          {homepageQuickPicks ? <HomepageMoreJourneys /> : null}
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
