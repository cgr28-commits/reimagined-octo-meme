import type { Metadata } from "next";
import { Suspense } from "react";
import OwnerJourneyEvidenceClient from "@/components/OwnerJourneyEvidenceClient";
import OwnerPortalHeader from "@/components/OwnerPortalHeader";
import { SITE } from "@/lib/data";

export const metadata: Metadata = {
  title: `Journey Evidence | ${SITE.name}`,
  description: "Owner-only historical journey evidence for completed tracked bookings.",
  robots: {
    index: false,
    follow: false,
  },
  alternates: {
    canonical: "/owner/journey-evidence/",
  },
};

/**
 * Static-export friendly (GitHub Pages): do not await searchParams on the server.
 * Query (?ref= / optional legacy ?token=) is read client-side.
 */
export default function OwnerJourneyEvidencePage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-navy">
      <OwnerPortalHeader title="Journey Evidence" variant="owner" />
      <div className="pt-[calc(4.75rem+env(safe-area-inset-top))] md:pt-[calc(4.5rem+env(safe-area-inset-top))]">
        <Suspense
          fallback={
            <main className="mx-auto max-w-6xl px-4 py-10 text-sm text-white/60">
              Loading journey evidence…
            </main>
          }
        >
          <OwnerJourneyEvidenceClient />
        </Suspense>
      </div>
    </div>
  );
}
