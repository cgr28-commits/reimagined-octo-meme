import type { Metadata } from "next";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import { SITE } from "@/lib/data";
import BookingConfirmedClient from "./BookingConfirmedClient";

export const metadata: Metadata = {
  title: `Booking confirmed | ${SITE.name}`,
  description: "Thank you — your airport transfer payment is complete and your booking is confirmed.",
  alternates: {
    canonical: "/booking-confirmed/",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function BookingConfirmedPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen overflow-x-clip bg-navy pb-16 pt-44 md:pt-28">
        <div className="mx-auto max-w-lg px-4 sm:px-6 lg:px-8">
          <BookingConfirmedClient />
        </div>
      </main>
      <Footer />
    </>
  );
}
