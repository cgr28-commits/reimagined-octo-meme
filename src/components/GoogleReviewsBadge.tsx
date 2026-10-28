import {
  GOOGLE_BUSINESS_PROFILE_URL,
  GOOGLE_REVIEW_COUNT,
  GOOGLE_REVIEW_RATING,
} from "../../shared/google-business-profile";

/** "★★★★★ 5.0 from 15 Google reviews" — links to the Business Profile. */
export default function GoogleReviewsBadge({ className = "" }: { className?: string }) {
  return (
    <a
      href={GOOGLE_BUSINESS_PROFILE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-white/85 transition-colors hover:border-emerald/40 hover:text-white ${className}`}
      aria-label={`Rated ${GOOGLE_REVIEW_RATING} out of 5 from ${GOOGLE_REVIEW_COUNT} Google reviews — read them on Google`}
    >
      <span className="tracking-tight text-amber-300" aria-hidden="true">
        ★★★★★
      </span>
      <span>
        <strong className="font-semibold text-white">{GOOGLE_REVIEW_RATING}</strong> from{" "}
        {GOOGLE_REVIEW_COUNT} Google reviews
      </span>
    </a>
  );
}
