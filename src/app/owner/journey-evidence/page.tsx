import type { Metadata } from "next";
import OwnerJourneyEvidenceClient from "@/components/OwnerJourneyEvidenceClient";
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
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<
    string,
    string | string[] | undefined
  >;
};

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0]?.trim() ?? "";
  return value?.trim() ?? "";
}

export default async function OwnerJourneyEvidencePage({ searchParams }: PageProps) {
  const params = searchParams instanceof Promise ? await searchParams : searchParams ?? {};
  const paymentReference = firstParam(params.ref) || firstParam(params.paymentReference);
  const token = firstParam(params.token);

  return (
    <div className="min-h-screen bg-navy">
      <OwnerJourneyEvidenceClient paymentReference={paymentReference} token={token} />
    </div>
  );
}
