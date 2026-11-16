"use client";

import { useEffect, useState } from "react";

/**
 * Saved-quote links (WhatsApp "Book now") open the payment page directly. The saved quote's
 * token rides in the hash (#change=…) so the customer can still go back and edit the journey.
 */
export default function ChangeJourneyLink() {
  const [href, setHref] = useState("");
  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("change")?.trim() ?? "";
    if (/^[A-Za-z0-9_-]{16,128}$/.test(token)) setHref(`/quote/#t=${encodeURIComponent(token)}&edit=1`);
  }, []);
  if (!href) return null;
  return (
    <p className="mt-3 text-sm">
      <a href={href} className="font-semibold text-emerald underline underline-offset-4" data-change-journey>
        Change my journey
      </a>
    </p>
  );
}
