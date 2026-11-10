"use client";

import { useEffect, useState } from "react";
import { resolveWorkerBaseUrl } from "@/lib/worker-api";
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
  variant?: "pill" | "panel" | "compact";
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
        <span data-reviews-stars aria-hidden="true">★★★★★</span>
        <span aria-hidden="true">
          <strong>{rating}</strong> on Google · {count} reviews
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
      <span data-reviews-stars className="tracking-tight text-amber-300" aria-hidden="true">
        ★★★★★
      </span>
      <span>
        <strong className="font-semibold text-white">{rating}</strong> from {count} Google reviews
      </span>
    </a>
  );
}
