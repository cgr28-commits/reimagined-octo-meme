import type { Metadata } from "next";
import Link from "next/link";
import "./private-tours.css";
import Logo from "@/components/Logo";
import FloatingItinerary from "@/components/private-tours/FloatingItinerary";
import { TOURS_LIVE } from "@/lib/private-tours-mode";

export const metadata: Metadata = TOURS_LIVE
  ? {
      title: { default: "Private Tours from Belfast | My Airport Taxi NI", template: "%s | My Airport Taxi NI" },
      description: "Private tours from Belfast with a private local driver. Choose a signature tour or build your own day, then request a personal quote.",
      alternates: { canonical: "/private-tours/" },
      robots: { index: true, follow: true },
    }
  : {
      title: "Private Tours (staging preview)",
      description: "Private tours from Belfast with a private local driver. Staging preview: not live.",
      robots: { index: false, follow: false },
    };

export default function PrivateToursLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt">
      {TOURS_LIVE ? null : <div className="pt-banner" role="note"><b>Staging preview.</b> Provisional journey estimates and prices. Nothing here is live, bookable or charged.</div>}
      <header className="pt-nav">
        <Link href="/private-tours/" className="pt-brand" aria-label="My Airport Taxi NI: Private Tours home"><Logo wide theme="light" priority className="h-10 sm:h-12 w-auto" /></Link>
        <nav aria-label="Private Tours">
          <Link href="/private-tours/#tours">Signature tours</Link>
          <Link href="/private-tours/attractions/">Attractions</Link>
          <Link href="/private-tours/plan/">Plan your day</Link>
          <Link href="/private-tours/cruise-excursions/">Cruise guests</Link>
        </nav>
      </header>
      <main>{children}</main>
      <FloatingItinerary />
      <footer className="pt-foot">
        Your driver is a private local driver. Tours are driven, not guided. Journey times are provisional estimates until your private quote is confirmed.
        Entry tickets are not included unless your quote says so.
      </footer>
    </div>
  );
}
