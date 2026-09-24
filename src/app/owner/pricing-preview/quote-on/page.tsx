import type { Metadata } from "next";
import PreviewQuoteCapacityClient from "@/components/PreviewQuoteCapacityClient";
import { SITE } from "@/lib/data";

export const metadata: Metadata = {
  title: `Quote selectors ON | ${SITE.name}`,
  description: "Preview-only public quote selectors with 7 Seater Minibus ON.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function PreviewQuoteOnPage() {
  return <PreviewQuoteCapacityClient publicMinibusEnabled={true} />;
}
