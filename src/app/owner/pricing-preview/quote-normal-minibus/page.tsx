import type { Metadata } from "next";
import PreviewQuoteCapacityClient from "@/components/PreviewQuoteCapacityClient";
import { SITE } from "@/lib/data";

export const metadata: Metadata = {
  title: `Normal Minibus preview | ${SITE.name}`,
  description: "Preview-only 5 passengers + modest luggage Minibus booking flow.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function PreviewQuoteNormalMinibusPage() {
  return (
    <PreviewQuoteCapacityClient
      publicMinibusEnabled={true}
      initialPassengers={5}
      initialSuitcases={2}
      exampleLabel="Normal Minibus 5+2"
    />
  );
}
