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
  // Lets the dashboard be added to the iPhone Home Screen (needed for phone notifications).
  manifest: "/owner.webmanifest",
  appleWebApp: { capable: true, title: "MATNI Owner", statusBarStyle: "black-translucent" },
  icons: { apple: "/owner-apple-touch-icon.png" },
};

export default function OwnerPage() {
  return <DriverPageClient portal="owner" />;
}
