import type { Metadata } from "next";
import DriverPageClient from "../driver/DriverPageClient";
import { SITE } from "@/lib/data";

export const metadata: Metadata = {
  title: `Owner dashboard | ${SITE.name}`,
  description:
    "Owner bookings dashboard — assign drivers, issue refunds, and track live jobs.",
  robots: {
    index: false,
    follow: false,
  },
  alternates: {
    canonical: "/owner/",
  },
};

export default function OwnerPage() {
  return <DriverPageClient portal="owner" />;
}
