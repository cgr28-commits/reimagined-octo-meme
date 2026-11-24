import { seedSettings } from "../seed.js";

/**
 * The six signature tours (D14): four existing tours upgraded in place plus two cruise products.
 * Prices and durations come from the completed WP-B1 settings seed (provisional, not published). Copy never claims professional guiding
 * (D5: "private local driver"), never names fleet or vehicle types beyond "car", and never mentions the driver's base.
 */
const CONTENT = {
  "giants-causeway": {
    name: "Giant's Causeway & Coast Classic", kicker: "FULL DAY · CAUSEWAY COAST", photo: "giants-causeway",
    tagline: "A private day along the Causeway Coast: dramatic cliffs, a famous rope bridge and a basalt shoreline, at a pace that suits you.",
    stops: ["dark-hedges", "ballintoy-harbour", "bushmills", "giants-causeway", "dunluce-castle"],
    start: "08:30", cruise: false, tags: ["coast", "scenery", "photo"],
  },
  "game-of-thrones": {
    name: "Game of Thrones Locations", kicker: "FULL DAY · FILM LOCATIONS", photo: "game-of-thrones",
    tagline: "The Kingsroad, the Iron Islands and the Dragonstone shore, with time to walk each location and take your photographs.",
    stops: ["dark-hedges", "ballintoy-harbour", "bushmills", "downhill-demesne", "dunluce-castle"],
    start: "08:30", cruise: false, tags: ["film", "photo", "coast"],
  },
  "antrim-coast": {
    name: "Antrim Coast & Glens", kicker: "HALF OR FULL DAY · GLENS OF ANTRIM", photo: "antrim-coast",
    tagline: "The Causeway Coastal Route at its most scenic: castle, harbours, waterfalls and the Glens of Antrim.",
    stops: ["carrickfergus-castle", "carnlough", "glenariff", "cushendun"],
    halfDayStops: ["carrickfergus-castle", "carnlough", "glenarm"],
    start: "09:30", cruise: false, tags: ["coast", "scenery", "walking"],
  },
  "belfast-city": {
    name: "Belfast City & Titanic", kicker: "HALF DAY · BELFAST", photo: "belfast-city",
    tagline: "The story of Belfast: the Titanic quarter, City Hall and the lanes of the Cathedral Quarter.",
    stops: ["titanic-belfast", "city-hall", "cathedral-quarter"],
    start: "09:30", cruise: false, tags: ["city", "history"],
  },
  "cruise-express": {
    name: "Cruise Port Express", kicker: "CRUISE GUESTS · BELFAST", photo: "belfast-city",
    tagline: "Belfast's highlights in a relaxed port day, planned around your ship's all-aboard time with a generous return buffer.",
    stops: ["titanic-belfast", "city-hall", "cathedral-quarter"],
    start: "10:00", cruise: true, tags: ["city", "history"],
  },
  "cruise-causeway": {
    name: "Cruise Causeway Day", kicker: "CRUISE GUESTS · CAUSEWAY COAST", photo: "giants-causeway",
    tagline: "The Causeway Coast from your ship, for later sailings only: a larger return buffer protects your all-aboard time.",
    stops: ["ballintoy-harbour", "giants-causeway", "dunluce-castle"],
    start: "09:00", cruise: true, tags: ["coast", "scenery"],
  },
};

const seedTours = new Map(seedSettings().commercial.tours.map((t) => [t.id, t]));

function priceFor(id) {
  const t = seedTours.get(id);
  if (!t) return null;
  if (t.provisionalPricePence?.value) return t.provisionalPricePence.value;
  const full = (t.variants || []).find((v) => v.id === "full-day");
  return full?.provisionalPricePence?.value ?? null;
}
function hoursFor(id) {
  const t = seedTours.get(id);
  if (t?.durationHours?.value) return t.durationHours.value;
  const full = (t?.variants || []).find((v) => v.id === "full-day");
  return full?.durationHours?.value ?? null;
}

export const TOURS = Object.freeze(
  Object.entries(CONTENT).map(([id, c]) => {
    const seed = seedTours.get(id);
    return Object.freeze({
      id, slug: id, halfDayStops: null, ...c,
      cruiseScope: seed?.cruiseScope ?? null,
      pricePence: priceFor(id),
      hours: hoursFor(id),
      variants: id === "antrim-coast" ? Object.freeze([{ id: "half-day", label: "Half day (about 4 hours)", pricePence: null, priceNote: "Half-day price confirmed in your quote" }, { id: "full-day", label: "Full day (about 8 hours)", pricePence: priceFor(id) }]) : null,
      provisional: true,
    });
  }),
);
export const TOUR_BY_ID = new Map(TOURS.map((t) => [t.id, t]));
export const formatPounds = (pence) => `£${(pence / 100).toFixed(pence % 100 === 0 ? 0 : 2)}`;
