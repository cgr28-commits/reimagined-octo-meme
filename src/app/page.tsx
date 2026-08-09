import type { Metadata } from "next";
import Header from "@/components/Header";
import HeroSlideshow from "@/components/HeroSlideshow";
import GoogleReviewsSection from "@/components/GoogleReviewsSection";
import AirportsSection from "@/components/AirportsSection";
import FlightStatusSection from "@/components/FlightStatusSection";
import AreasSection from "@/components/AreasSection";
import WhyChooseUsSection from "@/components/WhyChooseUsSection";
import DriverTrackingSection from "@/components/DriverTrackingSection";
import FAQSection from "@/components/FAQSection";
import ToursTeaserSection from "@/components/ToursTeaserSection";
import VehiclesSection from "@/components/VehiclesSection";
import ChauffeurSection from "@/components/ChauffeurSection";
import Footer from "@/components/Footer";
import { SERVICE_FLAGS } from "@/lib/data";

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
  },
};

export default function Home() {
  return (
    <>
      <Header />
      <main className="overflow-x-clip">
        <HeroSlideshow />
        <GoogleReviewsSection />
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
        <FAQSection />
      </main>
      <Footer />
    </>
  );
}
