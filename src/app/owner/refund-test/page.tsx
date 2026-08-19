import type { Metadata } from "next";
import OwnerRefundTestClient from "@/components/OwnerRefundTestClient";
import { SITE } from "@/lib/data";

export const metadata: Metadata = {
  title: `£1 SumUp refund test | ${SITE.name}`,
  description: "Owner-only live £1 SumUp refund smoke test. Not for customers.",
  robots: {
    index: false,
    follow: false,
  },
  alternates: {
    canonical: "/owner/refund-test/",
  },
};

export default function OwnerRefundTestPage() {
  return <OwnerRefundTestClient />;
}
