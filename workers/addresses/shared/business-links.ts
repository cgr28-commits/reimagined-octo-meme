import { BUSINESS_WEBSITE } from "./business-email";

/**
 * Google Business Profile "Write a review" link.
 * Prefer GOOGLE_REVIEW_URL worker secret in production; this is the fallback default.
 */
export const DEFAULT_GOOGLE_REVIEW_URL = "https://g.page/r/CbzkRdTv-0hNEBM/review";

export function resolveGoogleReviewUrl(configuredUrl?: string): string | null {
  const url = (configuredUrl?.trim() || DEFAULT_GOOGLE_REVIEW_URL).trim();
  if (!url || url.includes("ChIJXXXXXXXX")) {
    return null;
  }
  return url;
}

/** Canonical public vCard path on the production website (not the Worker hostname). */
export const CONTACT_VCARD_PUBLIC_PATH = "/My-Airport-Taxi-NI.vcf";

/** Absolute production URL for “Save to Contacts” links in customer emails. */
export function contactVCardPublicUrl(siteUrl = BUSINESS_WEBSITE): string {
  return `${siteUrl.replace(/\/$/, "")}${CONTACT_VCARD_PUBLIC_PATH}`;
}
