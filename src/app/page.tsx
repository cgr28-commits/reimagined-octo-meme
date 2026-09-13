import type { Metadata } from "next";
import Header from "@/components/Header";
import HeroSlideshow from "@/components/HeroSlideshow";
import AirportsSection from "@/components/AirportsSection";
import FlightStatusSection from "@/components/FlightStatusSection";
import AreasSection from "@/components/AreasSection";
import WhyChooseUsSection from "@/components/WhyChooseUsSection";
import DriverTrackingSection from "@/components/DriverTrackingSection";
import FAQSection from "@/components/FAQSection";
import ToursTeaserSection from "@/components/ToursTeaserSection";
import VehiclesSection from "@/components/VehiclesSection";
import ChauffeurSection from "@/components/ChauffeurSection";
import EmergePromoCard from "@/components/EmergePromoCard";
import Footer from "@/components/Footer";
import { HOMEPAGE_SEO_DESCRIPTION, HOMEPAGE_SEO_TITLE, SERVICE_FLAGS } from "@/lib/data";
import { getFaqPageJsonLd } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: HOMEPAGE_SEO_TITLE,
  description: HOMEPAGE_SEO_DESCRIPTION,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: HOMEPAGE_SEO_TITLE,
    description: HOMEPAGE_SEO_DESCRIPTION,
    url: "/",
  },
};

export default function Home() {
  const faqLd = getFaqPageJsonLd();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />
      <Header />
      <main className="overflow-x-clip">
        <HeroSlideshow />
        <AirportsSection />
        <FlightStatusSection />
        <AreasSection />
        {/* Soft-hidden via SERVICE_FLAGS — set dayTrips: true in data.ts to restore */}
        {SERVICE_FLAGS.dayTrips ? <ToursTeaserSection /> : null}
        <VehiclesSection />
        {/* Soft-hidden via SERVICE_FLAGS — set chauffeur: true in data.ts to restore */}
        {SERVICE_FLAGS.chauffeur ? <ChauffeurSection /> : null}
        <WhyChooseUsSection />
        {/* Soft-hidden via SERVICE_FLAGS.liveDriverTracking — set true in data.ts to restore */}
        {SERVICE_FLAGS.liveDriverTracking ? <DriverTrackingSection /> : null}
        <EmergePromoCard />
        <FAQSection />
      </main>
      <Footer />
    </>
  );
}
