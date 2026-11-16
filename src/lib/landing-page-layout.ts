/**
 * Shared public landing-page shell.
 * Mobile: clear the fixed header (~4rem) plus ~24–40px before content.
 * Desktop/tablet: keep the existing md:pt-28 clearance.
 * Homepage uses its own HeroSlideshow padding and must not import this.
 */
export const LANDING_PAGE_MAIN_CLASS =
  "min-h-screen overflow-x-clip bg-navy pb-16 pt-20 md:pt-28";

/**
 * Landing pages that open with the homepage quote hero (QuoteHero / HeroSlideshow):
 * the hero clears the fixed header itself, so the main element adds no top padding.
 */
export const LANDING_PAGE_MAIN_WITH_QUOTE_HERO_CLASS = "min-h-screen overflow-x-clip bg-navy pb-16";

/** First sentence of a longer introduction, for the short line under a quote-hero heading. */
export function firstSentence(text: string): string {
  const match = text.trim().match(/^.*?[.!?](?=\s|$)/);
  return match ? match[0] : text.trim();
}
