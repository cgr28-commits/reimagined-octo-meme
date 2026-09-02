import type { Metadata } from "next";
import AdFraudPageClient from "./AdFraudPageClient";
import { SITE } from "@/lib/data";

export const metadata: Metadata = {
  title: `Ad Fraud monitoring | ${SITE.name}`,
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdFraudPage() {
  return <AdFraudPageClient />;
}
