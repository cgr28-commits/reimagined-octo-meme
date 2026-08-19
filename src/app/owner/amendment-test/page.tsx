import type { Metadata } from "next";
import OwnerAmendmentTestClient from "@/components/OwnerAmendmentTestClient";
import { SITE } from "@/lib/data";

export const metadata: Metadata = {
  title: `Same-fare amendment test | ${SITE.name}`,
  description:
    "Owner-only Manage Booking same-fare amendment fixture. No SumUp charge. Not for customers.",
  robots: {
    index: false,
    follow: false,
  },
  alternates: {
    canonical: "/owner/amendment-test/",
  },
};

export default function OwnerAmendmentTestPage() {
  return <OwnerAmendmentTestClient />;
}
