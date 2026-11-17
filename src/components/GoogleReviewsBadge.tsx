"use client";

import { useEffect, useState } from "react";
import { resolveWorkerBaseUrl } from "@/lib/worker-api";
import { withBasePath } from "@/lib/paths";
import {
  GOOGLE_BUSINESS_PROFILE_URL,
  GOOGLE_REVIEW_COUNT,
  GOOGLE_REVIEW_RATING,
} from "../../shared/google-business-profile";

const WORKER_BASE = resolveWorkerBaseUrl();

/**
 * "★★★★★ 5.0 from N Google reviews" — links to the Business Profile.
 * Renders the saved fallback first, then the live rating and count from Google.
 */
export default function GoogleReviewsBadge({
  className = "",
  variant = "pill",
}: {
  className?: string;
  /** "panel": the desktop navy panel's larger strip. Same live numbers and link. */
  variant?: "pill" | "panel" | "compact" | "confidence";
}) {
  const [rating, setRating] = useState<string>(GOOGLE_REVIEW_RATING);
  const [count, setCount] = useState<number>(GOOGLE_REVIEW_COUNT);

  useEffect(() => {
    let cancelled = false;
    fetch(`${WORKER_BASE}/google-reviews/summary`, { headers: { Accept: "application/json" } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { rating?: number; count?: number } | null) => {
        if (cancelled || !data) return;
        if (typeof data.rating === "number" && data.rating >= 1 && data.rating <= 5) setRating(data.rating.toFixed(1));
        // Google's feed can lag a day or two behind new reviews: never show fewer than
        // the saved count, but let a higher live count take over.
        if (Number.isInteger(data.count) && (data.count as number) > 0) {
          setCount(Math.max(GOOGLE_REVIEW_COUNT, data.count as number));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (variant === "compact") {
    return (
      <a
        href={GOOGLE_BUSINESS_PROFILE_URL}
        target="_blank"
        rel="noopener noreferrer"
        data-reviews-compact
        className={className}
        aria-label={`Rated ${rating} out of 5 on Google from ${count} reviews`}
      >
        {/* Phones (owner, 17 Nov 2026): multicolour Google "G" (Icons8 flat-color-icons, MIT) before the stars,
            and "5.0 · 19 Google reviews". Hidden by default; mobile-home-mockup.css shows the G up to 1199px
            (phones and tablets) and the shorter text on phones. */}
        <img data-reviews-google-g src={withBasePath("/images/google-g.svg")} alt="" width={18} height={18} hidden aria-hidden="true" />
        <span data-reviews-stars aria-hidden="true">★★★★★</span>
        <span data-reviews-text-phone hidden aria-hidden="true">
          <strong>{rating}</strong> · {count} Google reviews
        </span>
        <span data-reviews-text aria-hidden="true">
          <strong>{rating}</strong> on Google · {count} reviews
        </span>
      </a>
    );
  }

  if (variant === "confidence") {
    // "Book with confidence" line on phones (owner, 17 Nov 2026): Google G, gold stars, live rating and count.
    return (
      <a
        href={GOOGLE_BUSINESS_PROFILE_URL}
        target="_blank"
        rel="noopener noreferrer"
        data-reviews-confidence
        className={className}
        aria-label={`Rated ${rating} out of 5 on Google from ${count} reviews`}
      >
        <img data-reviews-google-g src={withBasePath("/images/google-g.svg")} alt="" width={18} height={18} aria-hidden="true" />
        <span data-reviews-stars aria-hidden="true">★★★★★</span>
        <span aria-hidden="true">
          <strong>{rating}</strong> · {count} Google reviews
        </span>
      </a>
    );
  }

  if (variant === "panel") {
    return (
      <a
        href={GOOGLE_BUSINESS_PROFILE_URL}
        target="_blank"
        rel="noopener noreferrer"
        data-reviews-panel
        className={className}
        aria-label={`Rated ${rating} out of 5 from ${count} Google reviews — read them on Google`}
      >
        {/* Desktop homepage (owner, 17 Nov 2026): multicolour Google "G" before the score; hidden unless desktop-home-premium.css shows it. */}
        <img data-reviews-google-g src={withBasePath("/images/google-g.svg")} alt="" width={20} height={20} hidden aria-hidden="true" />
        <span data-reviews-score aria-hidden="true">
          <strong>{rating}</strong>
          <span data-reviews-stars>★★★★★</span>
        </span>
        <span data-reviews-meta aria-hidden="true">
          <span>{count} Google reviews</span>
          <span data-reviews-source>Read on Google ↗</span>
        </span>
      </a>
    );
  }

  return (
    <a
      href={GOOGLE_BUSINESS_PROFILE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex min-h-11 items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-sm lg:min-h-0 text-white/85 transition-colors hover:border-emerald/40 hover:text-white ${className}`}
      aria-label={`Rated ${rating} out of 5 from ${count} Google reviews — read them on Google`}
    >
      {/* Owner, 17 Nov 2026: multicolour Google "G" immediately before the gold stars, on every page that shows this badge. */}
      <img data-reviews-google-g src={withBasePath("/images/google-g.svg")} alt="" width={16} height={16} className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span data-reviews-stars className="-ml-1 tracking-tight text-amber-300" aria-hidden="true">
        ★★★★★
      </span>
      <span>
        <strong className="font-semibold text-white">{rating}</strong> from {count} Google reviews
      </span>
    </a>
  );
}
