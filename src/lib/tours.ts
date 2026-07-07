import { SITE } from "./data";
import { withBasePath } from "./paths";

export type Tour = {
  slug: string;
  title: string;
  shortDescription: string;
  description: string;
  duration: string;
  price: string;
  priceNote: string;
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
    eyebrow: "Causeway Coast",
    shortDescription:
      "Explore Northern Ireland's most iconic coastline — hexagonal basalt columns, dramatic cliffs, and Atlantic views.",
    description:
      "Discover the UNESCO World Heritage Giant's Causeway with a private driver who knows the best viewpoints, quieter stops, and photo spots along the Causeway Coast. We tailor the route to your pace — whether you want the full coastal experience or a focused visit to the stones and nearby attractions.",
    duration: "Full day (~8 hours)",
    price: "From £250",
    priceNote: "Based on saloon vehicle from Belfast. MPV and minibus options available.",
    highlights: [
      "Giant's Causeway UNESCO World Heritage Site",
      "Carrick-a-Rede Rope Bridge (seasonal access)",
      "Dunluce Castle clifftop ruins",
      "Ballintoy Harbour and coastal villages",
      "Flexible photo and refreshment stops",
    ],
    whatsappMessage:
      "Hi, I'd like to enquire about a private tour to the Giant's Causeway and Causeway Coast.",
    image: withBasePath("/images/tours/giants-causeway.jpg"),
    imageAlt: "Hexagonal basalt columns at Giant's Causeway on the Causeway Coast",
  },
  {
    slug: "belfast-city",
    title: "Belfast City Highlights",
    eyebrow: "City Tour",
    shortDescription:
      "A guided drive through Belfast's landmarks, murals, Titanic Quarter, and the best of the city centre.",
    description:
      "See Belfast at your own pace with a knowledgeable local driver. From the Titanic Quarter and Cathedral Quarter to political murals and panoramic viewpoints, we build an itinerary around your interests — history, architecture, food stops, or a bit of everything.",
    duration: "Half day (~4 hours)",
    price: "From £120",
    priceNote: "Ideal for cruise passengers, day visitors, or pre-flight sightseeing.",
    highlights: [
      "Titanic Belfast and Titanic Quarter",
      "City Hall and Cathedral Quarter",
      "Political murals and peace walls",
      "Stormont Parliament Buildings",
      "Local lunch and coffee stop recommendations",
    ],
    whatsappMessage:
      "Hi, I'd like to enquire about a private Belfast city highlights tour.",
    image: withBasePath("/images/tours/belfast-city.jpg"),
    imageAlt: "Belfast City Hall and city centre skyline",
  },
  {
    slug: "game-of-thrones",
    title: "Game of Thrones Filming Locations",
    eyebrow: "Film Locations",
    shortDescription:
      "Visit iconic Westeros filming sites across County Antrim and beyond — Dark Hedges, coastal castles, and more.",
    description:
      "Northern Ireland served as the backdrop for much of Game of Thrones. Our private tour takes you to the most recognisable filming locations with a driver who knows the routes and the stories behind each stop. Perfect for fans who want to see multiple sites in one comfortable day.",
    duration: "Full day (~8 hours)",
    price: "From £220",
    priceNote: "Route can be customised to focus on your favourite locations.",
    highlights: [
      "Dark Hedges avenue",
      "Ballintoy Harbour (Iron Islands)",
      "Dunluce Castle",
      "Cushendun Caves",
      "Additional locations by request",
    ],
    whatsappMessage:
      "Hi, I'd like to enquire about a private Game of Thrones filming locations tour.",
    image: withBasePath("/images/tours/game-of-thrones.jpg"),
    imageAlt: "Dark Hedges tree-lined avenue in County Antrim",
  },
  {
    slug: "antrim-coast",
    title: "Antrim Coast Scenic Drive",
    eyebrow: "Scenic Coast",
    shortDescription:
      "A relaxed coastal journey from Belfast to the Glens of Antrim — beaches, harbours, and sweeping sea views.",
    description:
      "The Antrim Coast Road is one of the finest scenic drives in the UK. Enjoy a leisurely private tour through seaside towns, glens, and cliff-top lookouts without the stress of navigating narrow roads or finding parking. We can include Glenariff Forest Park, Cushendall, and Ballycastle depending on your time.",
    duration: "Half to full day (~5–8 hours)",
    price: "From £180",
    priceNote: "Duration and price depend on how far along the coast you wish to travel.",
    highlights: [
      "Glens of Antrim coastal route",
      "Glenariff Forest Park (seasonal)",
      "Cushendun and Cushendall villages",
      "Ballycastle and Rathlin Island views",
      "Flexible lunch stops at coastal pubs",
    ],
    whatsappMessage:
      "Hi, I'd like to enquire about a private Antrim Coast scenic drive tour.",
    image: withBasePath("/images/tours/antrim-coast.jpg"),
    imageAlt: "Dramatic Antrim Coast cliffs beside Dunluce Castle",
  },
  {
    slug: "mourne-mountains",
    title: "Mourne Mountains & Coastal Route",
    eyebrow: "Mountains & Coast",
    shortDescription:
      "From dramatic mountain passes to the Newcastle coast — experience the beauty of County Down in comfort.",
    description:
      "The Mourne Mountains inspired C.S. Lewis and offer some of Northern Ireland's most striking landscapes. Our private tour combines mountain scenery with charming coastal villages, Silent Valley Reservoir, and the seaside town of Newcastle — all at a pace that suits you.",
    duration: "Full day (~8 hours)",
    price: "From £200",
    priceNote: "Includes mountain viewpoints and coastal stops. Hiking time can be built in on request.",
    highlights: [
      "Mourne mountain scenic viewpoints",
      "Silent Valley Reservoir",
      "Newcastle seaside promenade",
      "Tollymore Forest Park (optional)",
      "Local food and refreshment stops",
    ],
    whatsappMessage:
      "Hi, I'd like to enquire about a private Mourne Mountains and coastal route tour.",
    image: withBasePath("/images/tours/mourne-mountains.jpg"),
    imageAlt: "Mourne Mountains rising above Newcastle on the County Down coast",
  },
  {
    slug: "derry-londonderry",
    title: "Derry / Londonderry City & Walled Tour",
    eyebrow: "North West",
    shortDescription:
      "Walk the historic city walls, explore the Bogside murals, and discover the culture of the Walled City.",
    description:
      "Derry/Londonderry is one of Europe's finest walled cities. Our private tour covers the 17th-century walls, the Peace Bridge, Bogside murals, and the Guildhall — with your driver on hand for pickups between sites and local insight throughout the day.",
    duration: "Full day (~7 hours)",
    price: "From £180",
    priceNote: "Includes Belfast–Derry transfer time. Shorter city-only tours available on request.",
    highlights: [
      "Historic city walls walk",
      "Bogside murals and Free Derry Corner",
      "Peace Bridge and Guildhall",
      "St Columb's Cathedral",
      "River Foyle viewpoints",
    ],
    whatsappMessage:
      "Hi, I'd like to enquire about a private Derry / Londonderry city tour.",
    image: withBasePath("/images/tours/derry-londonderry.jpg"),
    imageAlt: "View through Derry city walls overlooking the Walled City",
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
    title: "Local knowledge",
    description:
      "Our drivers know the best routes, viewpoints, and lunch spots across Northern Ireland, with flexibility to adapt on the day.",
  },
  {
    title: "Door-to-door service",
    description:
      "We collect you from your hotel, B&B, cruise terminal, or airport and return you when you're ready.",
  },
  {
    title: "Clear upfront quotes",
    description:
      "Get a personalised price via WhatsApp before you travel. All quotes include your vehicle, driver, fuel, and tolls.",
  },
] as const;
