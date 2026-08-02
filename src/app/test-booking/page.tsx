import type { Metadata } from "next";
import TestBookingPageClient from "./TestBookingPageClient";
import { SITE } from "@/lib/data";

export const metadata: Metadata = {
  title: `Test booking | ${SITE.name}`,
  robots: {
    index: false,
    follow: false,
  },
};

export default function TestBookingPage() {
  return <TestBookingPageClient />;
}
