import type { Metadata } from "next";
import PreviewQuoteCapacityClient from "@/components/PreviewQuoteCapacityClient";
import { SITE } from "@/lib/data";

export const metadata: Metadata = {
  title: `Quote selectors OFF | ${SITE.name}`,
  description: "Preview-only public quote selectors with 7 Seater Minibus OFF.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function PreviewQuoteOffPage() {
  return <PreviewQuoteCapacityClient publicMinibusEnabled={false} />;
}
