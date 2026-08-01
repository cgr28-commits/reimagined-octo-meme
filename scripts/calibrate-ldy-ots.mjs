/**
 * Fetches OTS quotes for LDY → Belfast-area routes and computes surcharges
 * targeting ~£5 below OTS estate fares (same approach as BFS/BHD table).
 */

const LDY_PICKUP = "City of Derry Airport, BT47 3GY";
const OTS_AJAX = "https://onwardtravelsolutions.com/wp-admin/admin-ajax.php";
const LDY_BASE = 35;
const ESTATE_PREMIUM = 8;

const AREAS = {
  "Belfast City Centre": "12 Donegall Square, Belfast, BT1 5GS",
  Holywood: "22 High Street, Holywood, BT18 9AB",
  Newtownabbey: "5 Antrim Road, Newtownabbey, BT36 7QX",
  Lisburn: "10 Market Square, Lisburn, BT28 1AG",
  Dundonald: "12 Dundonald Road, Dundonald, BT16 1AA",
  Antrim: "17 High Street, Antrim, BT41 4BB",
  Ballyclare: "1 The Square, Ballyclare, BT39 9BB",
  Hillsborough: "9 Ballynahinch Road, Hillsborough, BT26 6AB",
  Carrickfergus: "10 Marine Highway, Carrickfergus, BT38 8AB",
  Comber: "9 The Square, Comber, BT23 5DT",
  Larne: "12 Point Road, Larne, BT40 1AB",
  Bangor: "12 Main Street, Bangor, BT20 5AB",
  Newtownards: "9 Church Street, Newtownards, BT23 4AB",
  Ballymena: "7 Castle Street, Ballymena, BT42 3AB",
};

function roundToNearestFive(value) {
  return Math.round(value / 5) * 5;
}

function roundFare(value) {
  const rounded = Math.round(value);
  return rounded % 5 === 4 ? rounded : roundToNearestFive(rounded);
}

function computeSaloonOneWay(basePlusSurcharge) {
  const fare = Math.max(basePlusSurcharge, LDY_BASE);
  return fare % 5 === 4 ? fare : roundToNearestFive(fare);
}

function computeEstateFare(surcharge) {
  const saloon = computeSaloonOneWay(LDY_BASE + surcharge);
  const estateTier = saloon + ESTATE_PREMIUM;
  return roundFare(estateTier);
}

function findSurchargeForTargetEstate(targetEstate) {
  for (let surcharge = 0; surcharge <= 160; surcharge++) {
    if (computeEstateFare(surcharge) === targetEstate) {
      return surcharge;
    }
  }
  return null;
}

async function refreshNonce() {
  const body = new URLSearchParams({ action: "otb_refresh_nonce" });
  const res = await fetch(OTS_AJAX, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json();
  return json.data.nonce;
}

async function fetchOtsQuote(nonce, dropoff) {
  const body = new URLSearchParams({
    action: "otb_get_quote",
    nonce,
    pickup: LDY_PICKUP,
    dropoff,
    pickup_datetime: "2026-08-15T10:00",
    passengers: "2",
    luggage: "2",
    hand_luggage: "0",
    is_return: "0",
    extra_stops_count: "0",
    extra_stops: "[]",
  });

  const res = await fetch(OTS_AJAX, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json();
  if (!json.success) {
    throw new Error(json.data?.message ?? "OTS quote failed");
  }

  const estate = json.data.vehicles.find((v) => /estate/i.test(v.name));
  const saloon = json.data.vehicles.find((v) => /saloon/i.test(v.name));
  return { otsEstate: estate?.price ?? null, otsSaloon: saloon?.price ?? null };
}

const nonce = await refreshNonce();
const results = [];

for (const [area, dropoff] of Object.entries(AREAS)) {
  const { otsEstate, otsSaloon } = await fetchOtsQuote(nonce, dropoff);
  const targetEstate = roundToNearestFive(Math.round(otsEstate - 5));
  const surcharge = findSurchargeForTargetEstate(targetEstate);
  const ourEstate = surcharge != null ? computeEstateFare(surcharge) : null;
  const ourSaloon = surcharge != null ? computeSaloonOneWay(LDY_BASE + surcharge) : null;

  results.push({
    area,
    otsEstate,
    otsSaloon,
    targetEstate,
    surcharge,
    ourEstate,
    ourSaloon,
    diff: ourEstate != null ? +(ourEstate - otsEstate).toFixed(2) : null,
  });

  await new Promise((r) => setTimeout(r, 200));
}

console.log(JSON.stringify(results, null, 2));

console.log("\n// LDY column for AREA_AIRPORT_SURCHARGES:");
for (const r of results) {
  console.log(`  ${JSON.stringify(r.area)}: surcharge ${r.surcharge} → estate £${r.ourEstate} (OTS £${r.otsEstate}, diff £${r.diff})`);
}
