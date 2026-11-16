import type { Metadata } from "next";
import { SITE } from "@/lib/data";
import OwnerDecisionClient from "./OwnerDecisionClient";

export const metadata: Metadata = {
  title: `Approve booking | ${SITE.name}`,
  description: "Owner approval for a pending booking.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/owner/decision/" },
  referrer: "no-referrer",
};

export default function OwnerDecisionPage() {
  return (
    <main className="min-h-screen bg-navy px-4 pb-16 pt-10 text-white">
      <div className="mx-auto max-w-md">
        <OwnerDecisionClient />
      </div>
    </main>
  );
}
