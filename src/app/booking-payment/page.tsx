import type { Metadata } from "next";
import BookingPaymentClient from "./BookingPaymentClient";
import { SITE } from "@/lib/data";

export const metadata: Metadata = {
  title: `Complete payment | ${SITE.name}`,
  description: "Confirm your airport transfer payment after SumUp checkout.",
  robots: { index: false, follow: false },
};

export default function BookingPaymentPage() {
  return <BookingPaymentClient />;
}
