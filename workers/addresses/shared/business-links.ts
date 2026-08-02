/** Google Business Profile "Write a review" link — set GOOGLE_REVIEW_URL worker secret to override. */
export const DEFAULT_GOOGLE_REVIEW_URL =
  "https://search.google.com/local/writereview?placeid=ChIJXXXXXXXXXXXXXXXX";

export function resolveGoogleReviewUrl(configuredUrl?: string): string | null {
  const url = configuredUrl?.trim() || DEFAULT_GOOGLE_REVIEW_URL;
  if (!url || url.includes("ChIJXXXXXXXX")) {
    return configuredUrl?.trim() || null;
  }
  return url;
}
