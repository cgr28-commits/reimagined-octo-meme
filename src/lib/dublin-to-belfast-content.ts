import type { BelfastDublinLandingContent } from "@/components/DublinCityTransferLanding";

/**
 * Content for the Dublin city → Belfast private transfer page (owner, 16 Nov 2026).
 * Its own page so "taxi dublin to belfast" searches and ads land on a page that reads the
 * right way round, instead of the Belfast → Dublin or Dublin Airport pages.
 */
export const DUBLIN_TO_BELFAST_PATH = "/transfers/dublin-to-belfast/";

export const DUBLIN_TO_BELFAST_PAGE: BelfastDublinLandingContent = {
  title: "Dublin to Belfast Taxi – Fixed Price, Door to Door",
  h1: "Dublin to Belfast Taxi",
  description:
    "Pre-booked private taxi from Dublin city to Belfast. Collected from your Dublin hotel, home or office and driven door to door, with a fixed price agreed before you pay.",
  eyebrow: "Dublin city → Belfast · Private taxi",
  intro:
    "Travel from Dublin city to Belfast in one pre-booked private car, door to door. We collect you from your Dublin hotel, home, office or venue at the time you choose and drive you straight to your Belfast address. Your price is fixed and agreed before you pay, with no meter running and no change of bus or train on the way.",
  heroHighlights: [
    "Collected from your Dublin address",
    "Fixed price agreed before you pay",
    "Pre-booked local NI driver",
  ],
  journeyTitle: "One car from your Dublin door to Belfast",
  journeyText:
    "Getting from Dublin to Belfast by coach or train usually means getting to a station first, then finding a taxi at the other end with your luggage. A private transfer takes you from one address to the other in the same car. It suits the trip home after a city break, concert or match, business meetings, family visits and anyone travelling with heavy bags, children or a group.",
  belfastToDublinTitle: "Going the other way?",
  belfastToDublinText:
    "Travelling from Belfast to Dublin city instead? Use our Belfast to Dublin city page, or choose Return on the quote form to book both journeys together, for example down to Dublin for a concert and home to Belfast the same night.",
  dublinToBelfastTitle: "Your Dublin pickup",
  dublinToBelfastText:
    "We collect from your exact Dublin address: a city-centre hotel, an office in the Docklands, a home in the suburbs, Dublin Port, Heuston or Connolly station, or a venue such as the 3Arena, Aviva Stadium or Croke Park. Enter the full pickup address or Eircode and add any access notes, such as a hotel's side entrance or a venue's pickup area.",
  timeTitle: "How long does it take?",
  timeText:
    "Dublin city to Belfast is usually around two hours on the M1/A1, depending on the exact addresses, the time of day and traffic leaving Dublin. The quote shows a mapped estimate for your journey. If you have a meeting, appointment or onward connection in Belfast, tell us the time you need to be there and we will plan the pickup with a sensible buffer.",
  quoteText:
    "Enter your Dublin pickup address and your Belfast drop-off address, then the number of passengers and suitcases. Where an instant fare is shown you can book and pay online in minutes. Otherwise send the request and we confirm a fixed price and availability before you pay.",
  hero: {
    base: "belfast-big-fish",
    alt: "The Big Fish landmark on Donegall Quay in Belfast",
    author: "Ajay Suresh",
    source: "https://commons.wikimedia.org/wiki/File:The_Big_Fish_-_Belfast_(49528473747).jpg",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
  },
  whatsappMessage: "Hello, I would like a quote for a taxi from Dublin to Belfast.",
  faqs: [
    {
      question: "Can I get a taxi from Dublin to Belfast?",
      answer:
        "Yes. Pre-book online and we collect you from your Dublin hotel, home, office or venue and drive you door to door to your Belfast address. The price is fixed and agreed before you pay.",
    },
    {
      question: "How much is a taxi from Dublin to Belfast?",
      answer:
        "The price depends on the exact pickup and drop-off addresses, the vehicle and the journey time. Enter both addresses in the quote form to see your fixed price. The price is for the car, not per passenger, and it is agreed before you pay.",
    },
    {
      question: "How long is the journey from Dublin to Belfast?",
      answer:
        "Usually around two hours, depending on where you start and finish and on traffic, especially leaving Dublin city. Allow extra time if you need to arrive for a fixed start time.",
    },
    {
      question: "I'm flying into Dublin Airport. Is this the right page?",
      answer:
        "For a pickup at Dublin Airport use our Dublin Airport to Belfast page. Your driver meets you in Arrivals, tracks your flight and airport pickups include up to 60 minutes' waiting.",
    },
    {
      question: "Is waiting time included?",
      answer:
        "Yes. City pickups include 10 minutes' complimentary waiting from the booked pickup time. If you are being collected from an event or a busy venue, tell us when booking and we will agree the best pickup point.",
    },
    {
      question: "Can I book a return journey?",
      answer:
        "Yes. Choose Return and enter the details for both journeys.",
    },
    {
      question: "What if my plans change?",
      answer:
        "You can cancel up to 24 hours before your pickup for a full refund. Contact us as early as possible if your times change and we will do our best to move the booking.",
    },
    {
      question: "Which vehicle should I choose?",
      answer:
        "Enter everyone travelling and every suitcase before choosing a vehicle. A Saloon suits up to four passengers with standard luggage, an Estate gives extra boot space, and a 7-Seater Minibus is offered for larger groups when available.",
    },
  ],
};
