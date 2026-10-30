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
export default function GoogleReviewsBadge({ className = "" }: { className?: string }) {
  const [rating, setRating] = useState(GOOGLE_REVIEW_RATING);
  const [count, setCount] = useState(GOOGLE_REVIEW_COUNT);

  useEffect(() => {
    let cancelled = false;
    fetch(`${WORKER_BASE}/google-reviews/summary`, { headers: { Accept: "application/json" } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { rating?: number; count?: number } | null) => {
        if (cancelled || !data) return;
        if (typeof data.rating === "number" && data.rating >= 1 && data.rating <= 5) setRating(data.rating.toFixed(1));
        if (Number.isInteger(data.count) && (data.count as number) > 0) setCount(data.count as number);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <a
      href={GOOGLE_BUSINESS_PROFILE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-white/85 transition-colors hover:border-emerald/40 hover:text-white ${className}`}
      aria-label={`Rated ${rating} out of 5 from ${count} Google reviews — read them on Google`}
    >
      <span className="tracking-tight text-amber-300" aria-hidden="true">
        ★★★★★
      </span>
      <span>
        <strong className="font-semibold text-white">{rating}</strong> from {count} Google reviews
      </span>
    </a>
  );
}
