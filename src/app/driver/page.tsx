import type { Metadata } from "next";
import Header from "@/components/Header";
import DriverPageClient from "./DriverPageClient";
import { SERVICE_FLAGS, SITE } from "@/lib/data";

export const metadata: Metadata = {
  title: SERVICE_FLAGS.driverDashboard
    ? `Driver dashboard | ${SITE.name}`
    : `Driver jobs | ${SITE.name}`,
  description: SERVICE_FLAGS.driverDashboard
    ? "Driver bookings dashboard — accept jobs and share live location."
    : "Drivers receive job details by email — no dashboard login required.",
  robots: {
    index: false,
    follow: false,
  },
  alternates: {
    canonical: "/driver/",
  },
};

export default function DriverPage() {
  // Soft-hidden via SERVICE_FLAGS.driverDashboard — drivers get jobs by email only
  if (!SERVICE_FLAGS.driverDashboard) {
    return (
      <>
        <Header />
        <main className="min-h-screen overflow-x-clip bg-navy pb-16 pt-44 md:pt-28">
          <div className="mx-auto max-w-xl px-4 sm:px-6 lg:px-8">
            <p className="text-sm font-semibold uppercase tracking-widest text-emerald">Drivers</p>
            <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Jobs by email</h1>
            <p className="mt-4 text-white/70">
              There is no driver login or access key. When you are assigned a job,{" "}
              <strong className="font-semibold text-white">
                {SITE.name}
              </strong>{" "}
              emails you the trip details, your pay for that journey, and a link to confirm you can
              take it.
            </p>
            <p className="mt-4 text-white/55">
              Check your inbox (and spam) for messages from{" "}
              <span className="text-white/75">{SITE.email}</span>. Owners manage bookings at{" "}
              <a href="/owner/" className="text-emerald underline-offset-2 hover:underline">
                /owner/
              </a>
              .
            </p>
          </div>
        </main>
      </>
    );
  }

  return <DriverPageClient portal="driver" />;
}
