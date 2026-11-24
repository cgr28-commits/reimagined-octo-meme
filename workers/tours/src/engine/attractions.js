/**
 * WP-B3 (staging): curated attraction library.
 *
 * Everything here is OWNER-APPROVED CONTENT TO VERIFY, written from independent general knowledge (not copied from any
 * mapping provider). Coordinates are approximate (about 100-300 m) and exist only for provisional journey estimates;
 * opening windows and visit times are provisional starting values the owner confirms in the library. No Google data is stored here.
 *
 * tags: coast, film, city, history, gardens, food, photo, family, walking, scenery
 * region: belfast | south-antrim | glens | north-coast | down | mourne
 * belfastArea: true only for places close enough to Belfast Harbour for a Belfast-only cruise day (60-minute return buffer).
 * open: [openMinute, closeMinute] since midnight. closedDays: JS weekday numbers (0 = Sunday). seasonMonths: [firstMonth, lastMonth] (1-12).
 * mobility: level | some-steps | steep
 */
export const REGIONS = Object.freeze({
  belfast: "Belfast",
  "south-antrim": "Carrickfergus and Larne coast",
  glens: "Glens of Antrim",
  "north-coast": "Causeway Coast",
  down: "County Down and Strangford",
  mourne: "Mourne Mountains",
});

export const TAGS = Object.freeze(["coast", "film", "city", "history", "gardens", "food", "photo", "family", "walking", "scenery"]);
export const TAG_LABELS = Object.freeze({
  coast: "Coast and sea views", film: "Game of Thrones and film", city: "Belfast city", history: "History and heritage",
  gardens: "Gardens and estates", food: "Food and cafés", photo: "Photography", family: "Family friendly", walking: "Walks and nature", scenery: "Mountains and scenery",
});

const A = (id, name, region, lat, lng, minutes, bounds, tags, extra) => ({
  id, name, region, lat, lng, minutes, minMinutes: bounds[0], maxMinutes: bounds[1], tags,
  open: [0, 1440], closedDays: [], seasonMonths: null, ticketed: false, ticketNote: null, mobility: "level", belfastArea: false, priority: 3, blurb: "", ...extra,
});

export const ATTRACTIONS = Object.freeze([
  // ---- Belfast
  A("titanic-belfast", "Titanic Belfast and the Slipways", "belfast", 54.6081, -5.9096, 120, [45, 180], ["city", "history", "family"], { open: [600, 1020], ticketed: true, ticketNote: "Entry is booked by you in advance.", belfastArea: true, priority: 5, blurb: "The story of the Titanic where she was built, with the slipways and Thompson Dock outside." }),
  A("city-hall", "Belfast City Hall and Donegall Square", "belfast", 54.5966, -5.9301, 30, [15, 60], ["city", "history", "photo"], { open: [540, 1020], belfastArea: true, priority: 4, blurb: "Belfast's landmark civic building and gardens in the middle of the city." }),
  A("cathedral-quarter", "Cathedral Quarter lunch", "belfast", 54.6016, -5.9254, 60, [45, 90], ["food", "city"], { belfastArea: true, priority: 3, blurb: "Cobbled lanes, street art and some of the city's best places to eat." }),
  A("st-georges-market", "St George's Market", "belfast", 54.5951, -5.9226, 60, [30, 90], ["food", "city", "family"], { open: [540, 900], closedDays: [1, 2, 3, 4], belfastArea: true, priority: 4, blurb: "Victorian covered market with local food and crafts." }),
  A("crumlin-road-gaol", "Crumlin Road Gaol", "belfast", 54.6091, -5.9435, 90, [60, 120], ["history", "city"], { open: [600, 1020], ticketed: true, ticketNote: "Tours are booked by you in advance.", mobility: "some-steps", belfastArea: true, priority: 3, blurb: "A Victorian prison and courthouse." }),
  A("belfast-castle", "Belfast Castle and Cave Hill", "belfast", 54.6403, -5.9455, 60, [30, 120], ["history", "scenery", "walking", "photo", "family"], { open: [540, 1020], mobility: "some-steps", belfastArea: true, priority: 4, blurb: "A hillside castle with views across Belfast Lough." }),
  A("botanic-ulster-museum", "Botanic Gardens and the Ulster Museum", "belfast", 54.5817, -5.9315, 75, [30, 120], ["gardens", "history", "family"], { open: [600, 1020], belfastArea: true, priority: 3, blurb: "The Victorian Palm House and the Ulster Museum in leafy south Belfast." }),
  A("stormont-estate", "Stormont Estate", "belfast", 54.6046, -5.8352, 45, [20, 90], ["gardens", "history", "photo", "walking"], { belfastArea: true, priority: 2, blurb: "Parliament Buildings at the head of a long, tree-lined avenue." }),
  // ---- Carrickfergus, Islandmagee and Larne
  A("carrickfergus-castle", "Carrickfergus Castle and harbour", "south-antrim", 54.7126, -5.8057, 60, [30, 90], ["history", "coast", "family"], { open: [600, 1020], ticketed: true, ticketNote: "Entry is paid on the day or booked by you.", belfastArea: true, priority: 4, blurb: "A Norman castle on the shore of Belfast Lough." }),
  A("gobbins", "The Gobbins cliff path", "south-antrim", 54.8135, -5.7776, 150, [120, 180], ["coast", "walking", "scenery"], { open: [600, 1020], seasonMonths: [3, 10], ticketed: true, ticketNote: "Timed tickets are booked by you well in advance.", mobility: "steep", priority: 3, blurb: "A dramatic cliff-edge path and bridges on the Islandmagee coast." }),
  A("larne-sandy-bay", "Larne and the Coastal Causeway Route start", "south-antrim", 54.853, -5.816, 30, [15, 60], ["coast", "photo"], { priority: 2, blurb: "Where the Causeway Coastal Route begins along the sea." }),
  // ---- Glens of Antrim
  A("glenarm", "Glenarm village and walled garden", "glens", 54.969, -5.963, 60, [30, 90], ["gardens", "history", "food"], { open: [660, 1020], seasonMonths: [4, 9], priority: 3, blurb: "One of the oldest villages on the coast, with a walled garden and castle estate." }),
  A("carnlough", "Carnlough harbour", "glens", 54.9922, -5.9948, 45, [20, 75], ["coast", "food", "photo", "family"], { priority: 3, blurb: "A pretty limestone harbour with cafés and a seafront." }),
  A("glenariff", "Glenariff Forest Park waterfalls", "glens", 54.9753, -6.1136, 90, [45, 150], ["walking", "scenery", "photo", "family"], { mobility: "steep", priority: 4, blurb: "Waterfall walks in the Queen of the Glens." }),
  A("cushendun", "Cushendun village and caves", "glens", 55.1253, -6.0527, 45, [20, 75], ["film", "coast", "photo", "history"], { priority: 4, blurb: "A National Trust coastal village and the sea caves seen in Game of Thrones." }),
  // ---- Causeway Coast
  A("ballycastle-fair-head", "Ballycastle and Fair Head", "north-coast", 55.222, -6.152, 60, [30, 120], ["scenery", "coast", "walking"], { mobility: "steep", priority: 2, blurb: "Sea cliffs facing Rathlin Island and Scotland." }),
  A("carrick-a-rede", "Carrick-a-Rede Rope Bridge", "north-coast", 55.238, -6.348, 90, [60, 120], ["coast", "walking", "scenery", "photo"], { open: [540, 1020], seasonMonths: [3, 10], ticketed: true, ticketNote: "Timed tickets from the National Trust are booked by you.", mobility: "steep", priority: 5, blurb: "The famous rope bridge to a small island, with a clifftop walk." }),
  A("ballintoy-harbour", "Ballintoy Harbour", "north-coast", 55.2465, -6.3715, 30, [15, 60], ["film", "coast", "photo"], { priority: 4, blurb: "A tiny harbour used as the Iron Islands in Game of Thrones." }),
  A("dark-hedges", "The Dark Hedges", "north-coast", 55.133, -6.38, 25, [15, 45], ["film", "photo"], { priority: 5, blurb: "A tunnel of beech trees, known as the Kingsroad in Game of Thrones." }),
  A("giants-causeway", "Giant's Causeway", "north-coast", 55.2408, -6.5116, 100, [60, 150], ["coast", "scenery", "walking", "photo", "family"], { open: [480, 1080], mobility: "some-steps", ticketed: true, ticketNote: "The visitor experience is booked by you; the stones are free to walk.", priority: 5, blurb: "Thousands of basalt columns on a UNESCO World Heritage coast." }),
  A("bushmills", "Bushmills village lunch", "north-coast", 55.2043, -6.5191, 60, [45, 90], ["food"], { priority: 3, blurb: "A relaxed lunch stop near the Causeway." }),
  A("bushmills-distillery", "Old Bushmills Distillery", "north-coast", 55.2049, -6.5169, 75, [60, 120], ["history", "food"], { open: [600, 1020], ticketed: true, ticketNote: "Tours are booked by you in advance.", priority: 3, blurb: "The licensed distillery in Bushmills village." }),
  A("dunluce-castle", "Dunluce Castle", "north-coast", 55.2108, -6.5792, 45, [20, 90], ["history", "coast", "photo", "film"], { open: [600, 1020], ticketed: true, ticketNote: "Entry is booked by you; the view from the road is free.", mobility: "some-steps", priority: 4, blurb: "Clifftop castle ruins above the sea." }),
  A("portrush", "Portrush seafront", "north-coast", 55.2058, -6.654, 45, [20, 90], ["coast", "food", "family"], { priority: 2, blurb: "A traditional seaside resort with beaches and chip shops." }),
  A("downhill-demesne", "Downhill Demesne and Mussenden Temple", "north-coast", 55.167, -6.807, 60, [30, 90], ["coast", "film", "photo", "walking"], { priority: 4, blurb: "A temple on a clifftop above a long beach, used as Dragonstone in Game of Thrones." }),
  // ---- County Down
  A("castle-ward", "Castle Ward (Winterfell)", "down", 54.376, -5.542, 90, [45, 150], ["film", "history", "gardens", "family"], { open: [600, 1020], ticketed: true, ticketNote: "Entry is booked by you or paid on the day.", mobility: "some-steps", priority: 4, blurb: "A National Trust estate on Strangford Lough, used as Winterfell." }),
  A("inch-abbey", "Inch Abbey", "down", 54.3495, -5.709, 30, [15, 60], ["film", "history", "photo"], { priority: 2, blurb: "Riverside abbey ruins seen in Game of Thrones." }),
  A("mount-stewart", "Mount Stewart gardens", "down", 54.5225, -5.6217, 90, [60, 150], ["gardens", "history", "family"], { open: [600, 1020], seasonMonths: [3, 10], ticketed: true, ticketNote: "Entry is booked by you in advance.", priority: 4, blurb: "One of the National Trust's finest gardens, on Strangford Lough." }),
  A("hillsborough-castle", "Hillsborough Castle and village", "down", 54.459, -6.082, 90, [45, 150], ["gardens", "history", "food"], { open: [600, 1020], ticketed: true, ticketNote: "Entry is booked by you.", priority: 3, blurb: "A royal residence and gardens, with an attractive village for lunch." }),
  A("tollymore", "Tollymore Forest Park", "down", 54.212, -5.935, 75, [45, 150], ["walking", "film", "scenery", "family"], { priority: 4, blurb: "Rivers, bridges and mountain views, used as the Haunted Forest." }),
  // ---- Mourne
  A("newcastle", "Newcastle seafront", "mourne", 54.215, -5.889, 45, [20, 90], ["coast", "food", "family", "scenery"], { priority: 3, blurb: "A seaside town beneath the Mourne Mountains." }),
  A("silent-valley", "Silent Valley and Mourne Wall", "mourne", 54.1295, -6.051, 75, [45, 120], ["scenery", "walking", "photo"], { open: [600, 1020], priority: 3, blurb: "A reservoir in the heart of the Mournes with mountain views." }),
]);

export const ATTRACTION_BY_ID = new Map(ATTRACTIONS.map((a) => [a.id, a]));

/**
 * Owner-approved attraction combinations (PROVISIONAL, owner editable later): a plan may only mix regions that appear together in one set.
 * This keeps generated days geographically sensible; "unrestricted" combinations are out of scope.
 */
export const APPROVED_COMBOS = Object.freeze([
  ["belfast"],
  ["belfast", "south-antrim"],
  ["belfast", "down"],
  ["south-antrim", "glens"],
  ["glens", "north-coast"],
  ["north-coast"],
  ["south-antrim", "glens", "north-coast"],
  ["down", "mourne"],
  ["down"],
]);

export function regionsAreApproved(regions) {
  const set = new Set(regions);
  return APPROVED_COMBOS.some((combo) => [...set].every((r) => combo.includes(r)));
}
