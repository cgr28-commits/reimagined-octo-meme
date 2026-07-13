import Header from "@/components/Header";
import HeroSlideshow from "@/components/HeroSlideshow";
import AirportsSection from "@/components/AirportsSection";
import FlightStatusSection from "@/components/FlightStatusSection";
import AreasSection from "@/components/AreasSection";
import WhyChooseUsSection from "@/components/WhyChooseUsSection";
import FAQSection from "@/components/FAQSection";
import ToursTeaserSection from "@/components/ToursTeaserSection";
import VehiclesSection from "@/components/VehiclesSection";
import WhatsAppButton from "@/components/WhatsAppButton";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <HeroSlideshow />
        <AirportsSection />
        <FlightStatusSection />
        <AreasSection />
        <ToursTeaserSection />
        <VehiclesSection />
        <WhyChooseUsSection />
        <FAQSection />
      </main>
      <Footer />
      <WhatsAppButton />
    </>
  );
}
