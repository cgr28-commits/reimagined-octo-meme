import type { Metadata } from "next";
import Link from "next/link";
import "./private-tours.css";

export const metadata: Metadata = {
  title: "Private Tours (staging preview)",
  description: "Private tours from Belfast with a private local driver. Staging preview: not live.",
  robots: { index: false, follow: false },
};

export default function PrivateToursLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt">
      <div className="pt-banner" role="note"><b>Staging preview.</b> Provisional journey estimates and prices. Nothing here is live, bookable or charged.</div>
      <header className="pt-nav">
        <Link href="/private-tours/"><strong>Private Tours</strong></Link>
        <nav aria-label="Private Tours">
          <Link href="/private-tours/#tours">Signature tours</Link>
          <Link href="/private-tours/attractions/">Attractions</Link>
          <Link href="/private-tours/plan/">Plan your day</Link>
          <Link href="/private-tours/cruise-excursions/">Cruise guests</Link>
        </nav>
      </header>
      <main>{children}</main>
      <footer className="pt-foot">
        Your driver is a private local driver. Tours are driven, not guided. Journey times are provisional estimates until your private quote is confirmed.
        Entry tickets are not included unless your quote says so.
      </footer>
    </div>
  );
}
