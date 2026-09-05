/**
 * Owner/driver one-tap Waze + Call / WhatsApp helpers.
 * Run: npx tsx scripts/check-owner-job-nav-links.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildWazeNavigateUrl,
  ownerCustomerContactActions,
  ownerWhatsAppDigits,
  resolveOwnerDisplayedLegNav,
} from "../shared/owner-job-actions";
import { getServedAirport } from "../shared/served-airports";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

console.log("=== Waze URLs ===");
{
  const bfs = getServedAirport("BFS");
  assert.ok(bfs);
  const coordUrl = buildWazeNavigateUrl({ lat: bfs.lat, lng: bfs.lng, address: "ignored" });
  assert.equal(coordUrl, `https://waze.com/ul?ll=${bfs.lat},${bfs.lng}&navigate=yes`);
  console.log("OK  coordinates preferred over address");

  const dest = "12 High Street, Carrickfergus BT38 7AN";
  const addressUrl = buildWazeNavigateUrl({ address: dest });
  assert.equal(
    addressUrl,
    `https://waze.com/ul?q=${encodeURIComponent(dest)}&navigate=yes`,
  );
  assert.match(addressUrl || "", /High%20Street/);
  assert.match(addressUrl || "", /BT38%207AN/);
  console.log("OK  address fallback is URL-encoded");

  assert.equal(buildWazeNavigateUrl({ address: "" }), null);
  assert.equal(buildWazeNavigateUrl({ address: "—" }), null);
  assert.equal(buildWazeNavigateUrl({ lat: 999, lng: 0, address: dest }), addressUrl);
  console.log("OK  invalid coords fall back to encoded address; empty address has no link");
}

console.log("\n=== Return leg uses displayed / reversed addresses ===");
{
  const outbound = resolveOwnerDisplayedLegNav({
    displayedLeg: "outbound",
    pickupLabel: "Belfast International Airport",
    dropoffLabel: "12 High Street, Carrickfergus BT38 7AN",
    airportCode: "BFS",
    isFromAirport: true,
  });
  assert.match(outbound.pickup.wazeHref || "", /54\.6575,-6\.2158/);
  assert.equal(outbound.pickup.source, "coordinates");
  assert.equal(outbound.destination.label, "12 High Street, Carrickfergus BT38 7AN");
  assert.match(outbound.destination.wazeHref || "", /q=12%20High%20Street/);
  assert.equal(outbound.destination.source, "address");

  const ret = resolveOwnerDisplayedLegNav({
    displayedLeg: "return",
    pickupLabel: "Belfast International Airport",
    dropoffLabel: "12 High Street, Carrickfergus BT38 7AN",
    airportCode: "BFS",
    isFromAirport: true,
    quoteSnapshot: {
      pickupLat: 54.6575,
      pickupLng: -6.2158,
      dropoffLat: 54.713,
      dropoffLng: -5.808,
    },
  });
  assert.equal(ret.pickup.label, "12 High Street, Carrickfergus BT38 7AN");
  assert.equal(ret.destination.label, "Belfast International Airport");
  assert.equal(ret.pickup.wazeHref, "https://waze.com/ul?ll=54.713,-5.808&navigate=yes");
  assert.equal(ret.destination.wazeHref, "https://waze.com/ul?ll=54.6575,-6.2158&navigate=yes");
  console.log("OK  return leg Waze uses reversed displayed pickup/destination + stored coords");
}

console.log("\n=== Quote snapshot coords beat airport catalogue ===");
{
  const nav = resolveOwnerDisplayedLegNav({
    displayedLeg: "outbound",
    pickupLabel: "Belfast International Airport",
    dropoffLabel: "Custom pin",
    airportCode: "BFS",
    isFromAirport: true,
    quoteSnapshot: {
      journey: { pickupLat: 54.65, pickupLng: -6.21, dropoffLat: 54.6, dropoffLng: -5.93 },
    },
  });
  assert.equal(nav.pickup.wazeHref, "https://waze.com/ul?ll=54.65,-6.21&navigate=yes");
  assert.equal(nav.destination.wazeHref, "https://waze.com/ul?ll=54.6,-5.93&navigate=yes");
  console.log("OK  nested quoteSnapshot lat/lng used");
}

console.log("\n=== WhatsApp + tel normalisation ===");
{
  assert.equal(ownerWhatsAppDigits("07700 900123"), "447700900123");
  assert.equal(ownerWhatsAppDigits("+44 7700 900123"), "447700900123");
  assert.equal(ownerWhatsAppDigits("+447700900123"), "447700900123");
  assert.equal(ownerWhatsAppDigits("0044 7700 900123"), "447700900123");
  assert.equal(ownerWhatsAppDigits("+44 (0) 7700 900123"), "447700900123");
  assert.equal(ownerWhatsAppDigits("447700900123"), "447700900123");
  assert.equal(ownerWhatsAppDigits("+353 87 123 4567"), "353871234567");
  assert.equal(ownerWhatsAppDigits("00353 87 123 4567"), "353871234567");
  assert.equal(ownerWhatsAppDigits("+1 212 555 0100"), "12125550100");
  assert.equal(ownerWhatsAppDigits(""), "");
  assert.equal(ownerWhatsAppDigits("n/a"), "");
  assert.equal(ownerWhatsAppDigits("12"), "");
  assert.equal(ownerWhatsAppDigits("abc"), "");

  const uk07 = ownerCustomerContactActions("07700 900123");
  assert.ok(uk07);
  assert.equal(uk07.display, "07700 900123");
  assert.equal(uk07.telHref, "tel:+447700900123");
  assert.equal(uk07.whatsAppHref, "https://wa.me/447700900123");

  const plus44 = ownerCustomerContactActions("+44 7700 900123");
  assert.ok(plus44);
  assert.equal(plus44.display, "+44 7700 900123");
  assert.equal(plus44.telHref, "tel:+447700900123");
  assert.equal(plus44.whatsAppHref, "https://wa.me/447700900123");

  const intl = ownerCustomerContactActions("+353871234567");
  assert.ok(intl);
  assert.equal(intl.whatsAppHref, "https://wa.me/353871234567");
  assert.equal(intl.telHref, "tel:+353871234567");

  assert.equal(ownerCustomerContactActions(""), null);
  assert.equal(ownerCustomerContactActions("   "), null);
  assert.equal(ownerCustomerContactActions("not-a-number"), null);
  assert.equal(ownerCustomerContactActions("123"), null);
  console.log("OK  07 / +44 / international WhatsApp + tel; invalid numbers have no actions");
}

console.log("\n=== Owner/driver-only wiring ===");
{
  const panel = read("src/components/OwnerPaidBookingsPanel.tsx");
  const jobs = read("src/components/OwnerBookingJobsPanel.tsx");
  const actions = read("src/components/OwnerJobNavActions.tsx");
  const header = read("src/components/Header.tsx");
  const quote = read("src/components/QuoteCard.tsx");
  const contact = read("src/app/contact/ContactCardClient.tsx");

  assert.match(panel, /OwnerWazeAddressLink/);
  assert.match(panel, /OwnerCustomerCallWhatsApp/);
  assert.match(panel, /resolveOwnerDisplayedLegNav/);
  assert.match(panel, /data-owner-job-card/);
  assert.match(jobs, /OwnerWazeAddressLink/);
  assert.match(jobs, /OwnerCustomerCallWhatsApp/);
  assert.match(actions, /data-owner-waze/);
  assert.match(actions, /data-owner-call/);
  assert.match(actions, /data-owner-whatsapp/);
  assert.match(actions, /min-h-11/);
  assert.doesNotMatch(panel, /replace\(\/\^0\/, "44"\)/);

  assert.doesNotMatch(header, /OwnerJobNavActions|owner-job-actions|data-owner-waze/);
  assert.doesNotMatch(quote, /OwnerJobNavActions|owner-job-actions|data-owner-waze/);
  assert.doesNotMatch(contact, /OwnerJobNavActions|owner-job-actions|data-owner-waze/);
  console.log("OK  Waze/Call/WhatsApp on owner cards only — not public pages");
}

console.log("\nAll owner job nav-link checks passed.");
