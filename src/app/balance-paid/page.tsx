import type { Metadata } from "next";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import { SITE } from "@/lib/data";
import BalancePaidClient from "./BalancePaidClient";

export const metadata: Metadata = {
  title: `Balance payment | ${SITE.name}`,
  description: "Paying the remaining balance on your My Airport Taxi NI booking.",
  alternates: { canonical: "/balance-paid/" },
  robots: { index: false, follow: false },
};

export default function BalancePaidPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen overflow-x-clip bg-navy pb-16 pt-36 md:pt-28">
        <div className="mx-auto max-w-lg px-4 sm:px-6 lg:px-8">
          <BalancePaidClient />
        </div>
      </main>
      <Footer />
    </>
  );
}
