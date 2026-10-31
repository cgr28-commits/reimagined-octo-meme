import { SITE } from "./data";
import { withBasePath } from "./paths";

export type Tour = {
  slug: string;
  title: string;
  shortDescription: string;
  description: string;
  duration: string;
  price: string;
  /** Lowest per-car price in GBP, for structured data. */
  priceFrom: number;
  priceNote: string;
  seoTitle: string;
  metaDescription: string;
  faqs: readonly { question: string; answer: string }[];
  highlights: readonly string[];
  whatsappMessage: string;
  eyebrow: string;
  image: string;
  imageAlt: string;
};

export const TOURS: readonly Tour[] = [
  {
    slug: "giants-causeway",
    title: "Giant's Causeway & Causeway Coast",
    seoTitle: "Private Giant's Causeway Tour from Belfast – From £395",
    metaDescription:
      "Private Giant's Causeway day tour from Belfast with your own driver. Carrick-a-Rede, Dunluce Castle and the Causeway Coast at your pace. From £395 per car, up to 4 people.",
    eyebrow: "Causeway Coast",
    shortDescription:
      "Explore Northern Ireland's most iconic coastline — hexagonal basalt columns, dramatic cliffs, and Atlantic views.",
    description:
      "A private Giant's Causeway tour from Belfast in your own car with a local driver — no coach, no fixed timetable and no strangers in your group. We collect you from your Belfast hotel, home or the cruise terminal and follow the Causeway Coast to the UNESCO World Heritage stones, with stops at Carrick-a-Rede Rope Bridge, Dunluce Castle and Ballintoy Harbour along the way. Take as long as you like at each stop: the route is planned around you, and your driver knows the quieter viewpoints and the best places for lunch.",
    duration: "Full day (~8 hours)",
    price: "From £395",
    priceFrom: 395,
    priceNote: "Price per car, not per person: up to 4 passengers in a Saloon or Estate, collected from your Belfast hotel, home or Belfast Cruise Terminal. Attraction entry tickets are not included. Picking up outside Belfast? We'll confirm the price when you enquire.",
    highlights: [
      "Giant's Causeway UNESCO World Heritage Site",
      "Carrick-a-Rede Rope Bridge (seasonal access)",
      "Dunluce Castle clifftop ruins",
      "Ballintoy Harbour and coastal villages",
      "Flexible photo and refreshment stops",
    ],
    whatsappMessage:
      "Hi, I'd like to enquire about a private day trip to the Giant's Causeway and Causeway Coast.",
    image: withBasePath("/images/tours/giants-causeway.jpg"),
    imageAlt: "Hexagonal basalt columns at Giant's Causeway on the Causeway Coast",
    faqs: [
      {
        question: "How much is a private Giant's Causeway tour from Belfast?",
        answer:
          "From £395 per car for a full day (around 8 hours) with your own driver, for up to 4 passengers. That's the price for the car, not per person. Attraction entry tickets are extra.",
      },
      {
        question: "How long does a Giant's Causeway day trip take?",
        answer:
          "Allow around 8 hours from Belfast. The drive to the Causeway is about 1 hour 15 minutes each way, which leaves plenty of time for the stones, the rope bridge, Dunluce Castle and lunch.",
      },
      {
        question: "Can you collect us from Belfast Cruise Terminal?",
        answer:
          "Yes. Tell us your ship and all-aboard time and we'll plan the day so you're back at the terminal in good time.",
      },
      {
        question: "Can we change the stops?",
        answer:
          "Yes. It's a private tour, so you choose where to stop and for how long. Add the Dark Hedges, Bushmills or Ballycastle if you like.",
      },
    ],
  },
  {
    slug: "belfast-city",
    title: "Belfast City Highlights",
    seoTitle: "Private Belfast City Tour by Car – From £195",
    metaDescription:
      "Private half-day Belfast city tour with your own driver: Titanic Quarter, City Hall, murals and peace walls. Ideal for cruise passengers. From £195 per car, up to 4 people.",
    eyebrow: "Belfast City",
    shortDescription:
      "Door-to-door transport to Belfast's landmarks, murals, Titanic Quarter, and the best of the city centre.",
    description:
      "See Belfast at your own pace on a private half-day city tour by car. Your driver collects you from your hotel, home or Belfast Cruise Terminal and takes you round the city's highlights — Titanic Belfast and the Titanic Quarter, City Hall, the Cathedral Quarter, the political murals and peace walls, and Stormont. Spend longer where you want and skip what you don't: history, architecture, food stops or a bit of everything.",
    duration: "Half day (~4 hours)",
    price: "From £195",
    priceFrom: 195,
    priceNote: "Half day, around 4 hours. Ideal for cruise passengers, day visitors or a few hours before a flight. Price per car, not per person: up to 4 passengers in a Saloon or Estate, collected from your Belfast hotel, home or Belfast Cruise Terminal. Attraction entry tickets are not included. Picking up outside Belfast? We'll confirm the price when you enquire.",
    highlights: [
      "Titanic Belfast and Titanic Quarter",
      "City Hall and Cathedral Quarter",
      "Political murals and peace walls",
      "Stormont Parliament Buildings",
      "Local lunch and coffee stop recommendations",
    ],
    whatsappMessage:
      "Hi, I'd like to enquire about a private Belfast city highlights day trip.",
    image: withBasePath("/images/tours/belfast-city.jpg"),
    imageAlt: "Belfast City Hall and city centre skyline",
    faqs: [
      {
        question: "How much is a private Belfast city tour?",
        answer:
          "From £195 per car for a half day (around 4 hours) with your own driver, for up to 4 passengers. Entry to attractions such as Titanic Belfast is extra.",
      },
      {
        question: "Is this tour suitable for cruise passengers?",
        answer:
          "Yes. We collect you at Belfast Cruise Terminal and bring you back in good time for all-aboard. Tell us your ship and times when you enquire.",
      },
      {
        question: "Can we visit the murals and peace walls?",
        answer:
          "Yes. The political murals and peace walls are among the most requested stops, along with Titanic Belfast and City Hall.",
      },
      {
        question: "Can we finish at the airport?",
        answer:
          "Yes. We can end the tour at Belfast City Airport or Belfast International Airport. Ask for the price when you enquire.",
      },
    ],
  },
  {
    slug: "game-of-thrones",
    title: "Game of Thrones Filming Locations",
    seoTitle: "Private Game of Thrones Tour from Belfast – From £395",
    metaDescription:
      "Private Game of Thrones filming locations tour from Belfast: Dark Hedges, Ballintoy Harbour, Cushendun Caves and more with your own driver. From £395 per car, up to 4 people.",
    eyebrow: "Film Locations",
    shortDescription:
      "Visit iconic Westeros filming sites across County Antrim and beyond — Dark Hedges, coastal castles, and more.",
    description:
      "Northern Ireland was the backdrop for much of Game of Thrones. On this private tour from Belfast your driver takes you to the most recognisable filming locations on the Antrim coast — the Dark Hedges, Ballintoy Harbour, Cushendun Caves and more — in your own car, at your own pace. Perfect for fans who want to see several sites in one comfortable day, and easy to combine with the Giant's Causeway.",
    duration: "Full day (~8 hours)",
    price: "From £395",
    priceFrom: 395,
    priceNote: "Full day, around 8 hours. Route can be tailored to your favourite locations. Price per car, not per person: up to 4 passengers in a Saloon or Estate, collected from your Belfast hotel, home or Belfast Cruise Terminal. Attraction entry tickets are not included. Picking up outside Belfast? We'll confirm the price when you enquire.",
    highlights: [
      "Dark Hedges avenue",
      "Ballintoy Harbour (Iron Islands)",
      "Dunluce Castle",
      "Cushendun Caves",
      "Additional locations by request",
    ],
    whatsappMessage:
      "Hi, I'd like to enquire about a private Game of Thrones filming locations day trip.",
    image: withBasePath("/images/tours/game-of-thrones.jpg"),
    imageAlt: "Dark Hedges tree-lined avenue in County Antrim",
    faqs: [
      {
        question: "How much is a private Game of Thrones tour from Belfast?",
        answer:
          "From £395 per car for a full day (around 8 hours) with your own driver, for up to 4 passengers. Any attraction entry is extra.",
      },
      {
        question: "Which filming locations do you visit?",
        answer:
          "Usually the Dark Hedges, Ballintoy Harbour, Cushendun Caves and Dunluce Castle. Tell us your favourites and we'll plan the route around them.",
      },
      {
        question: "Can we add the Giant's Causeway?",
        answer:
          "Yes. The Causeway is close to several filming locations, so it's easy to include on the same day.",
      },
    ],
  },
  {
    slug: "antrim-coast",
    title: "Antrim Coast Scenic Drive",
    seoTitle: "Private Antrim Coast Tour from Belfast – From £195",
    metaDescription:
      "Private Causeway Coastal Route drive from Belfast through the Glens of Antrim: Carnlough, Cushendall, Glenariff and Ballycastle. Half day from £195, full day from £395 per car.",
    eyebrow: "Scenic Coast",
    shortDescription:
      "A relaxed coastal journey from Belfast to the Glens of Antrim — beaches, harbours, and sweeping sea views.",
    description:
      "The Antrim Coast Road is one of the finest scenic drives in the UK. Sit back on a private tour from Belfast through seaside villages, the Glens of Antrim and clifftop viewpoints — without the stress of narrow roads or finding parking. Choose a half day along the coast to Carnlough and Glenarm, or a full day taking in Cushendall, Glenariff Forest Park and Ballycastle.",
    duration: "Half to full day (~5–8 hours)",
    price: "From £195",
    priceFrom: 195,
    priceNote: "Half day (around 4 hours) from £195, full day (around 8 hours) from £395. Price per car, not per person: up to 4 passengers in a Saloon or Estate, collected from your Belfast hotel, home or Belfast Cruise Terminal. Attraction entry tickets are not included. Picking up outside Belfast? We'll confirm the price when you enquire.",
    highlights: [
      "Glens of Antrim coastal route",
      "Glenariff Forest Park (seasonal)",
      "Cushendun and Cushendall villages",
      "Ballycastle and Rathlin Island views",
      "Flexible lunch stops at coastal pubs",
    ],
    whatsappMessage:
      "Hi, I'd like to enquire about a private Antrim Coast scenic drive day trip.",
    image: withBasePath("/images/tours/antrim-coast.jpg"),
    imageAlt: "Dramatic Antrim Coast cliffs beside Dunluce Castle",
    faqs: [
      {
        question: "How much is a private Antrim Coast tour?",
        answer:
          "A half day (around 4 hours) is from £195 per car and a full day (around 8 hours) is from £395, for up to 4 passengers with your own driver.",
      },
      {
        question: "How far along the coast do you go?",
        answer:
          "A half day usually reaches Carnlough or Glenarm. A full day can go on to Cushendall, Glenariff Forest Park and Ballycastle, or round to the Giant's Causeway.",
      },
      {
        question: "Can we stop for lunch?",
        answer:
          "Yes. Your driver will suggest a coastal pub or café and wait while you eat.",
      },
    ],
  },
] as const;

export function getTourBySlug(slug: string): Tour | undefined {
  return TOURS.find((tour) => tour.slug === slug);
}

export function getTourWhatsAppUrl(message: string): string {
  return `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(message)}`;
}

export const TOUR_BENEFITS = [
  {
    title: "Your own private vehicle",
    description:
      "Travel in comfort with a dedicated driver — no shared coaches, no fixed schedules, and no strangers in your group.",
  },
  {
    title: "We know the routes",
    description:
      "Our drivers know the best roads, viewpoints, and lunch spots across Northern Ireland, with flexibility to adapt on the day.",
  },
  {
    title: "Door-to-door service",
    description:
      "We collect you from your Belfast hotel, B&B, home or Belfast Cruise Terminal and bring you back when you're ready.",
  },
  {
    title: "Clear prices",
    description:
      "Half days from £195 and full days from £395 — per car, not per person, for up to 4 passengers. We confirm your exact price before you book.",
  },
] as const;
