import type { Metadata } from "next";
import DriverPageClient from "./DriverPageClient";
import { SITE } from "@/lib/data";

export const metadata: Metadata = {
  title: `Bookings dashboard | ${SITE.name}`,
  description: "Manage airport transfer bookings, assign drivers, and share live location.",
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
