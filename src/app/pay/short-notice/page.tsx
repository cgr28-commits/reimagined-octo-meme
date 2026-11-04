import type { Metadata } from "next";
import Link from "next/link";
import Logo from "@/components/Logo";
import ShortNoticePayClient from "./ShortNoticePayClient";

export const metadata: Metadata = {
  title: "Pay for approved booking | My Airport Taxi NI",
  robots: { index: false, follow: false },
};

/**
 * Static-export friendly (GitHub Pages): do not await searchParams on the server.
 * Token is read from the URL in the client component.
 */
export default function ShortNoticePayPage() {
  return (
    <main className="min-h-screen bg-navy px-4 py-10 sm:px-6">
      <div className="mx-auto mb-8 max-w-lg text-center">
        <Link href="/" aria-label="My Airport Taxi NI — home" className="inline-block">
          <Logo className="mx-auto h-20 w-auto" priority />
        </Link>
      </div>
      <ShortNoticePayClient />
    </main>
  );
}
