import type { Metadata } from "next";
import { notFound } from "next/navigation";
import DriverPageClient from "./DriverPageClient";
import { SERVICE_FLAGS, SITE } from "@/lib/data";

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
  // Soft-hidden via SERVICE_FLAGS.driverDashboard — drivers confirm by email for now
  if (!SERVICE_FLAGS.driverDashboard) {
    notFound();
  }

  return <DriverPageClient portal="driver" />;
}
