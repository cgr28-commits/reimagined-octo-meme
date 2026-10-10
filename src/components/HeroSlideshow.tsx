import HeroBenefitsRow from "./HeroBenefitsRow";
import OptimizedHeroPicture from "./OptimizedHeroPicture";
import QuoteCard from "./QuoteCard";
import QuoteHelpContact from "./QuoteHelpContact";

/**
 * Server component: static H1/copy stay outside the QuoteCard client boundary.
 * Desktop keeps the Belfast International photograph. Phones use the navy
 * background and do not request that file.
 */
export default function HeroSlideshow() {
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
        <div className="homepage-hero-copy order-1 min-w-0 md:order-2 lg:order-1 lg:pt-2">
          <p className="section-eyebrow mb-1.5 max-w-full md:mb-6 lg:mb-7">
            <span className="md:hidden">Private airport transfers • Northern Ireland</span>
            <span className="hidden md:inline">
              Private airport transfers • Belfast &amp; Northern Ireland
            </span>
          </p>

          <h1 className="font-display text-balance text-[1.5625rem] font-semibold leading-[1.15] tracking-tight text-white md:text-[2.7rem] md:leading-[1.08] lg:text-[3.35rem] xl:text-[3.7rem] xl:leading-[1.06]">
            Belfast &amp; Dublin Airport Transfers
          </h1>

          <p className="mt-1.5 max-w-xl text-pretty text-[0.9rem] leading-snug text-white/90 md:mt-5 md:text-lg md:leading-relaxed lg:mt-6 lg:text-[1.125rem]">
            Premium, fixed-price private transfers to and from Belfast International, Belfast City and Dublin Airport.
          </p>
        </div>

        <div
          className="homepage-hero-quote order-2 min-w-0 w-full scroll-mt-20 md:order-1 md:scroll-mt-28 lg:order-2 lg:justify-self-stretch"
          id="quote"
        >
          <HeroBenefitsRow />
          <QuoteCard presentation="homepage" />
          <QuoteHelpContact />
        </div>
      </div>
    </section>
  );
}
