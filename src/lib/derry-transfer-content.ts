/** Belfast ↔ Derry city-to-city page (owner, 14 Nov 2026): landing page for the Belfast - Derry ads. */
export const DERRY_TRANSFER_PAGE = {
  title: "Belfast to Derry Taxi & Private Transfer",
  description:
    "Pre-book a private taxi between Belfast and Derry~Londonderry, in either direction. Door to door, fixed price agreed before you pay, free cancellation up to 24 hours.",
  eyebrow: "Belfast ↔ Derry · Private transfers",
  intro:
    "Travel between Belfast and Derry~Londonderry in one private car, with your pickup, destination and price agreed in advance. We collect from homes, hotels and offices in either city and take you straight to the address in your booking.",
  sections: [
    {
      title: "One car, door to door, in either direction",
      text: "This is a pre-booked private transfer for the whole journey, not a taxi hailed on the day and not a shared coach. There is no walk to a bus or train station at either end and no timetable to fit around. Your driver collects you at the time you choose and takes you, your party and your bags directly to your destination.",
    },
    {
      title: "Your Belfast address",
      text: "Enter the full hotel name or street address, with a postcode where you have one. The city centre, Cathedral Quarter, Titanic Quarter, south Belfast and the towns around Greater Belfast are all different starting points, so use your actual address rather than a general Belfast pin.",
    },
    {
      title: "Your Derry address",
      text: "The Cityside, the Waterside, Culmore and Eglinton are different pickups and drop-offs. Enter the full address or hotel name so your price covers the right journey. If you are travelling on to another town in the north-west, enter that destination instead.",
    },
    {
      title: "How long does it take?",
      text: "Allow around an hour and a half to an hour and three-quarters between the two city centres in normal traffic. The usual route is the M2 out of Belfast and the A6 over the Glenshane Pass. The quote tool shows a mapped estimate for your exact addresses. Journey times are approximate and can vary depending on traffic, weather and time of day.",
    },
    {
      title: "Choosing your vehicle",
      text: "Enter every passenger and suitcase before choosing. A Saloon takes up to four passengers with two suitcases and two small bags. An Estate takes up to four passengers with more luggage. Business Class and the 7 Seater Minibus are on request and subject to availability.",
    },
  ],
  airportTitle: "Heading to or from an airport?",
  airportText:
    "If your journey starts or ends at an airport, use the page for that route so the right airport is already selected. Airport pickups include flight monitoring and up to 60 minutes' free waiting.",
  airportLinks: [
    { href: "/transfers/derry-to-belfast-international/", label: "Derry to Belfast International" },
    { href: "/transfers/derry-to-belfast-city-airport/", label: "Derry to Belfast City Airport" },
    { href: "/transfers/belfast-to-city-of-derry/", label: "Belfast to City of Derry Airport" },
    { href: "/transfers/derry-to-dublin-airport/", label: "Derry to Dublin Airport" },
  ],
  quoteText:
    "Enter your exact pickup and drop-off, the date and time, then your passengers and suitcases. Where an instant price is available it is shown straight away and you can book and pay securely online. Otherwise we confirm a fixed price with you before any payment.",
  faqs: [
    {
      question: "Can I book a taxi from Belfast to Derry?",
      answer:
        "Yes. Enter your Belfast pickup and Derry destination in the quote form, with your date, time, passengers and suitcases. The price is agreed before you pay.",
    },
    {
      question: "Can you collect in Derry and drive to Belfast?",
      answer:
        "Yes. The journey can be booked in either direction. Enter your Derry pickup address and your Belfast destination in the quote form.",
    },
    {
      question: "Is the price per person or per car?",
      answer:
        "The price is for the vehicle and the journey, not per passenger. Enter the full party and suitcase count so the right vehicle is offered.",
    },
    {
      question: "How long is the journey between Belfast and Derry?",
      answer:
        "Allow around an hour and a half to an hour and three-quarters between the city centres in normal traffic. Journey times are approximate and can vary depending on traffic, weather and time of day.",
    },
    {
      question: "Can I cancel?",
      answer: "Yes. Cancel up to 24 hours before your pickup time for a full refund.",
    },
    {
      question: "Can I book the journey back as well?",
      answer:
        "Yes. Choose Return on the quote form and enter both journeys. Where an instant return price is shown, you save 5% on the combined fare.",
    },
  ],
} as const;
