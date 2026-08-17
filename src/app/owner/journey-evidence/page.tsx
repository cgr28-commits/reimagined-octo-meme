import type { Metadata } from "next";
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

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0]?.trim() ?? "";
  return value?.trim() ?? "";
}

export default async function OwnerJourneyEvidencePage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  // Normal paid bookings: ?ref=PAYMENT_REF only (no customer tracking token in the URL).
  // Optional ?token= remains as a fallback for legacy/unlinked jobs without a payment reference.
  const paymentReference = firstParam(params.ref) || firstParam(params.paymentReference);
  const token = paymentReference ? "" : firstParam(params.token);

  return (
    <div className="min-h-screen overflow-x-clip bg-navy">
      <OwnerPortalHeader title="Journey Evidence" variant="owner" />
      <div className="pt-[calc(4.75rem+env(safe-area-inset-top))] md:pt-[calc(4.5rem+env(safe-area-inset-top))]">
        <OwnerJourneyEvidenceClient paymentReference={paymentReference} token={token} />
      </div>
    </div>
  );
}
