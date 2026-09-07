import type { Metadata } from "next";
import Link from "next/link";
import Footer from "@/components/Footer";
import Header from "@/components/Header";

export const metadata: Metadata = {
  title: "Page not found",
  robots: {
    index: false,
    follow: true,
    googleBot: {
      index: false,
      follow: true,
    },
  },
};

export default function NotFound() {
  return (
    <>
      <Header />
      <main className="min-h-screen overflow-x-clip bg-navy pb-16 pt-36 md:pt-28">
        <div className="mx-auto max-w-lg px-4 sm:px-6 lg:px-8">
          <p className="text-sm font-semibold uppercase tracking-widest text-emerald">404</p>
          <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Page not found</h1>
          <p className="mt-4 text-sm leading-relaxed text-white/65">
            That address is not on this site. Use the home page to get a quote or find an airport
            transfer.
          </p>
          <Link
            href="/"
            className="mt-8 inline-flex min-h-11 items-center rounded-full bg-emerald px-6 py-3 text-sm font-bold text-navy"
          >
            Back to home
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
