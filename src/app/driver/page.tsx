import type { Metadata } from "next";
import DriverPageClient from "./DriverPageClient";
import { SITE } from "@/lib/data";

export const metadata: Metadata = {
  title: `Driver dashboard | ${SITE.name}`,
  description: "Driver bookings dashboard — accept jobs and share live location.",
  robots: {
    index: false,
    follow: false,
  },
  alternates: {
    canonical: "/driver/",
  },
};

export default function DriverPage() {
  return <DriverPageClient portal="driver" />;
}
