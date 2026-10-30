/** Google Business Profile links. Tiny on purpose: safe to import in client components. */

/** "Write a review" link (also used by the post-journey review request email). */
export const DEFAULT_GOOGLE_REVIEW_URL = "https://g.page/r/CbzkRdTv-0hNEBM/review";

/** Opens the Business Profile with its reviews. Used for schema sameAs and site links. */
export const GOOGLE_BUSINESS_PROFILE_URL = "https://g.page/r/CbzkRdTv-0hNEBM";

/**
 * Fallback for "5.0 from N Google reviews". The badge replaces it with the live
 * numbers from the Worker (GET /google-reviews/summary, refreshed daily from Google).
 * Visible text only: not marked up as aggregateRating (Google ignores self-served
 * LocalBusiness ratings and disallows re-marking reviews collected elsewhere).
 */
export const GOOGLE_REVIEW_RATING = "5.0";
export const GOOGLE_REVIEW_COUNT = 16;
