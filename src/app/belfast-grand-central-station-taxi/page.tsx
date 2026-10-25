import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import LocationQuoteSection from "@/components/LocationQuoteSection";
import LandingBreadcrumbs from "@/components/LandingBreadcrumbs";
import { LandingPageQuoteCta } from "@/components/LandingPageQuoteCta";
import { SITE } from "@/lib/data";
import { absoluteSiteUrl } from "@/lib/paths";
import { getBreadcrumbJsonLd, getServiceAreaJsonLd } from "@/lib/structured-data";
import styles from "./station.module.css";

const path = "/belfast-grand-central-station-taxi/";
const title = "Belfast Grand Central Station Taxi | Book Transfers Online";
const description = "Book a taxi to or from Belfast Grand Central Station. Fixed-price private transfers across Greater Belfast, online booking and secure payments.";
const stationGuide = "https://www.translink.co.uk/using-translink/station-finder/belfast-grand-central-station";
const whatsapp = `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent("Hello, I would like help arranging a Belfast Grand Central Station transfer.")}`;

export const metadata: Metadata = {
  title: { absolute: title }, description,
  alternates: { canonical: path },
  openGraph: {
    title,
    description,
    url: path,
    type: "website",
    images: [{ url: absoluteSiteUrl("/og-image-square.png"), width: 1200, height: 1200, alt: SITE.name }],
  },
  twitter: { card: "summary", title, description, images: [absoluteSiteUrl("/og-image-square.png")] },
};

const routes = [
  { name: "Belfast International Airport", text: "Connect your train or coach journey with a flight from Belfast International. Choose the airport as your destination for an outbound connection, or the station after an airport arrival. Leave time for baggage collection and your onward check-in.", href: "/airports/belfast-international/" },
  { name: "George Best Belfast City Airport", text: "Arrange the road connection between Grand Central and Belfast City Airport in either direction. Check that you have selected Belfast City, rather than Belfast International, before requesting your quote.", href: "/airports/belfast-city/" },
  { name: "Dublin Airport", text: "Book a private cross-border connection between the station and Dublin Airport. Enter your terminal where known and plan your collection around the airline’s check-in advice. Your quote uses the existing airport and applicable toll rules.", href: "/airports/dublin/" },
  { name: "Newtownabbey", text: "Travel between Grand Central and your home, workplace or accommodation in Newtownabbey. Use your full address for a journey-specific quote, whether you are heading for a train or coming home with luggage." },
  { name: "Glengormley", text: "Pre-book a station transfer from your Glengormley address, or arrange the final part of your journey home after arriving in Belfast. Choose Return if you need both legs." },
  { name: "Carrickfergus", text: "Arrange a private transfer between the station and Carrickfergus without changing vehicles with your bags. Enter the actual pickup or destination address rather than just the town name." },
  { name: "Whiteabbey", text: "Connect Grand Central with an address in Whiteabbey. If someone else is travelling, use the travelling passenger’s contact details so collection updates reach the right person." },
  { name: "Bangor", text: "Choose a pre-booked car between Grand Central and your Bangor destination when a door-to-door road connection suits your plans. Include every passenger and suitcase so the calculator can show suitable vehicles." },
  { name: "Holywood", text: "Book a station journey to or from a Holywood home, hotel or business address. An Estate can be useful when your party needs more luggage space than a Saloon offers." },
  { name: "Lisburn", text: "Plan a road transfer between Grand Central and Lisburn for a family visit, business trip or onward rail connection. For travel to the station, choose a pickup time that leaves a comfortable margin before departure." },
  { name: "Ballyclare", text: "Arrange your onward car journey to Ballyclare before your train or coach arrives. For rural addresses outside the town, select the precise address and add the building name where needed." },
  { name: "Titanic Quarter", text: "Travel between the station and your hotel, workplace or visitor destination in Titanic Quarter. Confirm the building or venue in the address search; Titanic Quarter railway station may be a different destination." },
  { name: "Belfast city-centre hotels", text: "Book a collection at your hotel or an onward transfer after arriving with luggage. Enter the hotel’s full name and check the selected address. Grand Central Hotel and Grand Central Station are different places." },
];

const faqs = [
  ["Can I pre-book a taxi from Belfast Grand Central Station?", "Yes. Enter the station as your pickup, choose your destination and confirm the passenger and suitcase counts to view a quote. You select the pickup date and time when you continue to book. Short-notice journeys may need availability approval before payment."],
  ["Where will my driver collect me?", "Follow the collection point agreed for your booking. The public-hire taxi rank is separate from a pre-booked private transfer; do not assume your driver will be waiting there. If you do not have a confirmed meeting point, contact us on WhatsApp before making your way outside."],
  ["Can I book a taxi to Belfast International Airport?", "Yes. Select Belfast Grand Central Station as the pickup and Belfast International Airport as the destination. You can also book the reverse journey. Applicable airport access charges are shown through the existing quote system."],
  ["Can I travel to Dublin Airport?", "Yes. Private transfers are available between Grand Central and Dublin Airport in either direction, subject to availability. Your fixed quote accounts for the applicable airport charges and tolls; this page does not publish an estimated fare."],
  ["Can I book a taxi to the station from Newtownabbey?", "Yes. Enter your full Newtownabbey pickup address and select Belfast Grand Central Station as your destination. Choose your collection time later in the booking process, allowing time to reach your train or coach."],
  ["Can I book a return journey?", "Yes. Select Return in the calculator. The existing 5% return-booking discount applies where an instant online price is offered, and you can review the combined fare before paying."],
  ["Can I pay securely online?", "Yes. Eligible bookings use the existing secure SumUp card checkout. If a short-notice journey needs availability approval, follow the payment instructions once it is approved. Keep your booking confirmation for your journey details."],
  ["What happens if my train is delayed?", "Contact us on WhatsApp as soon as you know, giving your booking reference and revised arrival time. We will discuss what is possible; a revised pickup is subject to availability. Station pickups have the normal non-airport allowance of 10 minutes from the agreed pickup time. Further waiting may be charged. Automatic train monitoring and the airport waiting allowance are not included."],
  ["Can I book a 7-seater for a station transfer?", "Yes. Choose up to seven passengers in the calculator when the 7 Seater Minibus is available. Enter your luggage accurately so we can assess the space required. Group journeys use the existing minibus pricing, minimum notice and availability rules; your booking must be confirmed before travel."],
  ["Is Business Class available for Grand Central Station?", "Business Class is available to select when offered for your journey and passenger/luggage combination. The current capacity is up to three passengers and two large suitcases. It uses the existing Business Class fare and availability rules. Station collections use an agreed collection point; airport Meet & Greet and flight-monitoring benefits do not apply to a station pickup."],
  ["Can I book an Estate for extra luggage?", "Yes. Enter your passenger and suitcase counts to see suitable vehicle options. Saloon and Estate bookings accommodate up to four passengers; the Estate offers additional luggage capacity. Its vehicle fare is £7 above the equivalent Saloon fare before the applicable return discount. Airport access charges remain separate from the vehicle supplement."],
];

export default function GrandCentralStationPage() {
  const schema = [
    getBreadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Belfast Grand Central Station Taxi", path }]),
    getServiceAreaJsonLd({ name: "Belfast Grand Central Station Taxi Transfers", description, path, serviceType: "Pre-booked station taxi transfer", areaServed: ["Belfast Grand Central Station", "Greater Belfast", ...routes.map((route) => route.name)] }),
  ];
  return <>
    {schema.map((item) => <script key={item["@type"]} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(item).replace(/</g, "\\u003c") }} />)}
    <Header />
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.shell}>
          <LandingBreadcrumbs items={[{ name: "Home", href: "/" }, { name: "Grand Central Station taxis" }]} />
          <div className={styles.heroGrid}>
            <div className={styles.intro}>
              <p className={styles.eyebrow}>By train. By coach. Onward with us.</p>
              <h1>Belfast Grand Central Station Taxi Transfers</h1>
              <p className={styles.lead}>Your next connection, arranged before you arrive.</p>
              <p>Pre-book a private taxi to or from Belfast Grand Central Station, with a fixed-price quote and straightforward online booking. From an airport connection to the last leg home, plan your journey across Greater Belfast with My Airport Taxi NI.</p>
              <div className={styles.actions}><LandingPageQuoteCta label="Get Instant Quote" /><a href={whatsapp} target="_blank" rel="noopener noreferrer">Ask us on WhatsApp ↗</a></div>
              <ul className={styles.benefits}><li>Fixed-price quotes</li><li>Cars &amp; up to 7 passengers</li><li>Save 5% on returns</li></ul>
              <figure className={styles.stationPhoto}>
                {/* Responsive, locally hosted derivative of the documented CC0 photograph. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/station/grand-central-1280.webp" srcSet="/images/station/grand-central-640.webp 640w, /images/station/grand-central-1280.webp 1280w, /images/station/grand-central-1920.webp 1920w" sizes="(max-width: 640px) calc(100vw - 32px), (max-width: 1023px) 760px, 564px" width={1920} height={1440} fetchPriority="high" decoding="async" alt="Glass-fronted Grosvenor Road entrance to Belfast Grand Central Station, with the station name above the doors" />
                <figcaption>Belfast Grand Central Station · Grosvenor Road entrance. <a href="https://commons.wikimedia.org/wiki/File:Grand_Central_Station,_Belfast_(Feb_25).jpg" target="_blank" rel="noopener noreferrer">Photo: RooneyDonal21 / Wikimedia Commons</a>, CC0. Photo shows the station, not an agreed pickup point.</figcaption>
              </figure>
              <div className={styles.note}><strong>A station transfer, planned around you.</strong><p>Choose either direction in the calculator. Select the station in Belfast, not Grand Central Hotel or Lanyon Place.</p></div>
            </div>
          </div>
        </div>
      </section>
      <nav className={`${styles.shell} ${styles.jumpLinks}`} aria-label="On this page"><a href="#quote">Get a quote</a><a href="#routes">Popular destinations</a><a href="#meeting-point">Meeting your driver</a><a href="#station-vehicles">Vehicles and luggage</a><a href="#station-faqs">FAQs</a></nav>
      <LocationQuoteSection
        bookingIntroduction="Pre-book your transfer to or from Belfast Grand Central Station in just a few clicks."
        pickupNotice="Follow the meeting instructions agreed for your booking. Do not assume collection at the public-hire taxi rank. If your meeting point is not confirmed, contact us on WhatsApp before heading outside."
        addressHint="Belfast Grand Central Station, Belfast"
        heading="Quote a taxi to or from Belfast Grand Central Station"
        description="Enter your pickup, destination, passengers and luggage. Choose your date and time when you book."
      />
      <div className={styles.shell}>
        <section className={styles.section}>
          <p className={styles.eyebrow}>Make the connection</p>
          <h2>Taxi transfers to and from Belfast Grand Central Station</h2>
          <div className={styles.columns}><p>Arriving by train or coach is only one part of the journey. A pre-booked transfer gives you an agreed pickup time and a price to review before booking, particularly useful when you are travelling with children, several bags or a business appointment ahead.</p><p>Grand Central brings rail and coach connections together, including Enterprise journeys to and from Dublin and cross-border X1 and X2 coach services. Check your ticket for the correct Belfast station and allow time to get from your platform or coach stand to the agreed collection point.</p></div>
        </section>
        <section className={styles.section} id="routes">
          <p className={styles.eyebrow}>One station. Many onward journeys.</p>
          <h2>Popular Grand Central Station taxi routes</h2>
          <p>Every route below can be booked in either direction. Your fare comes from the existing calculator using your selected addresses, vehicle and journey details.</p>
          <nav className={styles.destinationLinks} aria-label="Choose a popular destination">{routes.map((route, index) => <a key={route.name} href={`#station-route-${index}`}>{route.name}</a>)}</nav>
          <div className={styles.routes}>{routes.map((route, index) => <article id={`station-route-${index}`} key={route.name} className={styles.route}>
            <p className={styles.routeLabel}>Grand Central Station ↔</p><h3>{route.name}</h3><p>{route.text}</p>
            <div className={styles.routeActions}><LandingPageQuoteCta label={`Quote ${route.name} transfer`} className={styles.textCta} />{route.href && <Link href={route.href}>Airport guide →</Link>}</div>
          </article>)}</div>
          <p className={styles.small}>Travelling to Dundonald, Carryduff or another Greater Belfast address? Enter the precise location for a quote, or ask us on WhatsApp if you need help.</p>
        </section>
        <section className={`${styles.section} ${styles.travelGrid}`}>
          <article id="meeting-point" className={styles.travelCard}><p className={styles.eyebrow}>Arriving in Belfast</p><h2>Where to meet your driver</h2>
            <p>Book for a realistic collection time after your train or coach arrival, leaving time to collect your bags and walk through the station. Keep your phone available and follow the meeting instructions agreed for your booking.</p>
            <p>Translink lists general drop-off spaces on Boyne Bridge Place alongside a separate public-hire taxi rank. The dedicated drop-off spaces have a maximum stay of 10 minutes. This is a site access limit, not an extension of your booking’s waiting allowance.</p>
            <p>A private pre-booked collection does not mean joining the black-taxi rank. Confirm your meeting point with us; access, signs and space availability may affect the lawful place your driver can stop.</p>
            <a href={stationGuide} target="_blank" rel="noopener noreferrer">Read Translink’s current station access guide ↗</a>
          </article>
          <article className={styles.travelCard}><p className={styles.eyebrow}>Catching your connection</p><h2>Travelling to Grand Central Station</h2>
            <p>Arrange collection from your home, hotel or workplace and select Belfast Grand Central Station as the destination. Your driver can take you to a permitted drop-off point; allow time to walk inside and find your departure.</p>
            <p>For an Enterprise train or another rail or coach service, work back from the departure time on your ticket. Include a margin for traffic, luggage and boarding rather than using the service departure as your taxi pickup time.</p>
            <p>Check the station name carefully. Grand Central, Lanyon Place and Grand Central Hotel are distinct locations. Use <a href="https://www.translink.co.uk/" target="_blank" rel="noopener noreferrer">Translink’s journey information</a> for your rail or coach itinerary.</p>
          </article>
        </section>
        <section className={styles.section} id="station-vehicles">
          <p className={styles.eyebrow}>The right vehicle for your journey</p>
          <h2>Saloon, Estate, Business Class and 7-seater transfers</h2>
          <p>From an individual business trip to a family or group arrival, enter your passengers and luggage to see suitable vehicles and their current fares. Business Class and the 7 Seater Minibus are subject to availability.</p>
          <div className={styles.routes}>
            <article className={styles.route}><h3>Saloon &amp; Estate</h3><p>Both accommodate up to four passengers. Choose Saloon for up to two standard suitcases plus two small bags, or Estate for up to four large suitcases plus two small bags. Estate adds £7 to the equivalent Saloon vehicle fare before any return discount.</p><div className={styles.routeActions}><LandingPageQuoteCta label="Quote a Saloon or Estate" className={styles.textCta} /></div></article>
            <article className={styles.route}><h3>Business Class</h3><p>A premium vehicle option for up to three passengers and two large suitcases, when offered by the calculator. Suitable for a business visit, hotel connection or onward airport journey. Station pickups use your agreed collection point.</p><div className={styles.routeActions}><LandingPageQuoteCta label="Check Business Class options" className={styles.textCta} /></div></article>
            <article className={styles.route}><h3>7 Seater Minibus</h3><p>Travel together with up to seven passengers, plus the driver. Enter your suitcase count and tell us about any unusual luggage so capacity can be checked. The existing minibus availability and advance-booking requirements apply.</p><div className={styles.routeActions}><LandingPageQuoteCta label="Check 7-seater options" className={styles.textCta} /></div></article>
          </div>
        </section>
        <section className={styles.section}><p className={styles.eyebrow}>A familiar service, a new connection</p><h2>Why choose My Airport Taxi NI?</h2>
          <ul className={styles.why}>{["A fixed-price quote to review before booking", "Simple online booking for pre-booked transfers", "Secure card payments through SumUp", "Saloon and Estate options for up to four passengers", "Business Class and up to seven passengers by Minibus, when available", "Additional luggage capacity with Estate", "The existing 5% discount on return bookings"].map((benefit) => <li key={benefit}><span aria-hidden="true">✓</span>{benefit}</li>)}</ul>
          <p>Choose the vehicle that fits your luggage and check your booking confirmation. Airport access costs apply only where your journey involves an airport; the station itself does not attract an airport pickup fee or a flight-number requirement.</p>
        </section>
        <section id="station-faqs" className={styles.section}><p className={styles.eyebrow}>Before you travel</p><h2>Grand Central Station taxi questions</h2><div className={styles.faqs}>{faqs.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div><p className={styles.small}>Read the <Link href="/terms/">booking terms</Link> and <Link href="/cancellation/">cancellation policy</Link> before confirming your journey.</p></section>
      </div>
      <section className={styles.final}><div className={styles.shell}><p className={styles.eyebrow}>Your onward journey starts here</p><h2>Book your Grand Central Station transfer</h2><p>To the station or from it. Enter your journey, choose your vehicle and see your fixed quote before you book.</p><div className={styles.actions}><LandingPageQuoteCta label="Get Instant Quote" /><a href={whatsapp} target="_blank" rel="noopener noreferrer">Message us on WhatsApp ↗</a></div></div></section>
    </main><Footer />
  </>;
}
