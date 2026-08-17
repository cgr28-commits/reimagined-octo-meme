/** Google Business Profile "Write a review" link — override with GOOGLE_REVIEW_URL worker secret. */
export const DEFAULT_GOOGLE_REVIEW_URL = "https://g.page/r/CbzkRdTv-0hNEBM/review";

export function resolveGoogleReviewUrl(configuredUrl?: string): string | null {
  const url = (configuredUrl?.trim() || DEFAULT_GOOGLE_REVIEW_URL).trim();
  if (!url || url.includes("ChIJXXXXXXXX")) {
    return null;
  }
  return url;
}
