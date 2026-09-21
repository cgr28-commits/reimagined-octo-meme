/**
 * Shared public landing-page shell.
 * Mobile: clear the fixed header (~4rem) plus ~24–40px before content.
 * Desktop/tablet: keep the existing md:pt-28 clearance.
 * Homepage uses its own HeroSlideshow padding and must not import this.
 */
export const LANDING_PAGE_MAIN_CLASS =
  "min-h-screen overflow-x-clip bg-navy pb-16 pt-20 md:pt-28";
