"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSelection } from "@/lib/private-tours-selection";

/** Floating "My Itinerary" button with the number of selected attractions. Hidden on the planner itself. */
export default function FloatingItinerary() {
  const ids = useSelection();
  const path = usePathname() || "";
  if (/\/private-tours\/(plan|owner)\/?$/.test(path)) return null;
  return (
    <Link href="/private-tours/plan/" className="pt-fab" aria-label={`My Itinerary, ${ids.length} attraction${ids.length === 1 ? "" : "s"} selected`}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></svg>
      <span>My Itinerary</span>
      <b className={ids.length ? "on" : ""} aria-hidden="true">{ids.length}</b>
    </Link>
  );
}
