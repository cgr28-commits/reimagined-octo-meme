/** Google Business Profile links. Tiny on purpose: safe to import in client components. */

/** "Write a review" link (also used by the post-journey review request email). */
export const DEFAULT_GOOGLE_REVIEW_URL = "https://g.page/r/CbzkRdTv-0hNEBM/review";

/** Opens the Business Profile with its reviews. Used for schema sameAs and site links. */
export const GOOGLE_BUSINESS_PROFILE_URL = "https://g.page/r/CbzkRdTv-0hNEBM";

/**
 * Shown on the site as "5.0 from N Google reviews". Update when the profile changes.
 * Visible text only: not marked up as aggregateRating (Google ignores self-served
 * LocalBusiness ratings and disallows re-marking reviews collected elsewhere).
 */
export const GOOGLE_REVIEW_RATING = "5.0";
export const GOOGLE_REVIEW_COUNT = 15;
