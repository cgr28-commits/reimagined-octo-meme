/**
 * Homepage Google Reviews — config-driven only.
 * Never invent ratings, counts, excerpts, or a profile URL.
 * Do not fetch Google reviews in the browser.
 */

export type GoogleReviewExcerpt = {
  author: string;
  text: string;
  date?: string;
};

export type GoogleReviewsConfig = {
  enabled: boolean;
  /** Public Google Business reviews / profile URL (not a write-a-review link). */
  profileUrl: string;
  rating: number | null;
  reviewCount: number | null;
  reviews: GoogleReviewExcerpt[];
};

/**
 * Known ops write-a-review URL from shared/business-links.ts.
 * This is NOT a “read all reviews” profile URL and must not be shown as one.
 */
export const KNOWN_GOOGLE_WRITE_REVIEW_URL =
  "https://g.page/r/CbzkRdTv-0hNEBM/review";

export const GOOGLE_REVIEWS_HEADING = "Trusted by airport-transfer customers";

export const GOOGLE_REVIEWS_ENABLEMENT_REQUIREMENTS = [
  "A genuine public Google Business Profile / reviews list URL (not the write-a-review g.page link).",
  "The genuine overall Google rating.",
  "The genuine Google review count.",
  "Three genuine customer-review excerpts with author, text, and optional date.",
] as const;

/**
 * Disabled until genuine Google Business review data is supplied.
 * Existing write-a-review URL is recorded for ops only.
 */
export const GOOGLE_REVIEWS: GoogleReviewsConfig = {
  enabled: false,
  profileUrl: "",
  rating: null,
  reviewCount: null,
  reviews: [],
};

export function googleReviewsCanRender(config: GoogleReviewsConfig = GOOGLE_REVIEWS): boolean {
  if (!config.enabled) return false;
  if (!config.profileUrl.trim()) return false;
  if (config.profileUrl.trim() === KNOWN_GOOGLE_WRITE_REVIEW_URL) return false;
  if (typeof config.rating !== "number" || !Number.isFinite(config.rating)) return false;
  if (typeof config.reviewCount !== "number" || config.reviewCount < 1) return false;
  if (config.reviews.length < 3) return false;
  return config.reviews.every(
    (review) => Boolean(review.author.trim()) && Boolean(review.text.trim()),
  );
}
