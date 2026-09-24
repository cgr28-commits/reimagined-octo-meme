import type { Metadata } from "next";
import OwnerPricingPreviewClient from "@/components/OwnerPricingPreviewClient";
import { SITE } from "@/lib/data";

export const metadata: Metadata = {
  title: `Pricing preview | ${SITE.name}`,
  description: "Isolated Owner Pricing preview. Does not change live customer pricing.",
  robots: {
    index: false,
    follow: false,
  },
  alternates: {
    canonical: "/owner/pricing-preview/",
  },
};

export default function OwnerPricingPreviewPage() {
  return <OwnerPricingPreviewClient />;
}
