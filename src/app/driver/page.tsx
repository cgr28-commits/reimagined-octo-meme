import type { Metadata } from "next";
import DriverPageClient from "./DriverPageClient";
import { SITE } from "@/lib/data";

export const metadata: Metadata = {
  title: `Driver dashboard | ${SITE.name}`,
  description: "Share live location with customers on the day of their airport transfer.",
  robots: {
    index: false,
    follow: false,
  },
  alternates: {
    canonical: "/driver/",
  },
};

export default function DriverPage() {
  return <DriverPageClient />;
}
