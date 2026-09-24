import type { Metadata } from "next";
import PreviewQuoteCapacityClient from "@/components/PreviewQuoteCapacityClient";
import { SITE } from "@/lib/data";

export const metadata: Metadata = {
  title: `High-load 7+7 preview | ${SITE.name}`,
  description: "Preview-only 7 passengers + 7 large bags luggage capacity confirmation.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function PreviewQuoteHighLoadPage() {
  return (
    <PreviewQuoteCapacityClient
      publicMinibusEnabled={true}
      initialPassengers={7}
      initialSuitcases={7}
      exampleLabel="High-load 7+7"
    />
  );
}
