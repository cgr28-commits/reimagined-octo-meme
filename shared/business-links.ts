import { BUSINESS_WEBSITE } from "./business-email";

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

/** Canonical public vCard path on the production website (not the Worker hostname). */
export const CONTACT_VCARD_PUBLIC_PATH = "/My-Airport-Taxi-NI.vcf";

/** Absolute production URL for “Save to Contacts” links in customer emails. */
export function contactVCardPublicUrl(siteUrl = BUSINESS_WEBSITE): string {
  return `${siteUrl.replace(/\/$/, "")}${CONTACT_VCARD_PUBLIC_PATH}`;
}
