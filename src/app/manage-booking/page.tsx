import type { Metadata } from "next";
import ManageBookingClient from "./ManageBookingClient";

export const metadata: Metadata = {
  title: "Manage booking | My Airport Taxi NI",
  description: "Change your pickup date or time, subject to availability and our amendment policy.",
  robots: { index: false, follow: false },
};

export default function ManageBookingPage() {
  return (
    <main className="min-h-screen bg-navy px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto mb-6 max-w-lg text-center sm:mb-8">
        <p className="text-sm font-semibold uppercase tracking-wider text-emerald">
          My Airport Taxi NI
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-white">Manage your booking</h1>
      </div>
      <ManageBookingClient />
    </main>
  );
}
