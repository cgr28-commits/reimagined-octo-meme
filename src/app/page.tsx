import Header from "@/components/Header";
import HeroSlideshow from "@/components/HeroSlideshow";
import AirportsSection from "@/components/AirportsSection";
import FlightStatusSection from "@/components/FlightStatusSection";
import AreasSection from "@/components/AreasSection";
import ReviewsSection from "@/components/ReviewsSection";
import FAQSection from "@/components/FAQSection";
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
        <ReviewsSection />
        <FAQSection />
      </main>
      <Footer />
      <WhatsAppButton />
    </>
  );
}
