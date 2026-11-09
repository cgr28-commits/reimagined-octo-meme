import Link from "next/link";

/**
 * Design 3 (mobile preview, ?mobile=d3) homepage block from the approved mockup:
 * "Where are you travelling?" links and "Every booking includes". Rendered hidden for
 * everyone; only the Design 3 preview stylesheet shows it, so desktop, Design 2 and the
 * current mobile site are unchanged.
 */
const JOURNEYS = [
  { href: "/airports/belfast-international/", title: "Belfast International", sub: "Aldergrove · BFS", icon: "plane" },
  { href: "/airports/belfast-city/", title: "Belfast City Airport", sub: "George Best · BHD", icon: "plane" },
  { href: "/transfers/belfast-to-dublin-airport/", title: "Belfast ↔ Dublin Airport", sub: "Saloon or Business Class", icon: "plane" },
  { href: "/belfast-cruise-terminal-transfers/", title: "Cruise & rail transfers", sub: "Belfast port · Grand Central", icon: "train" },
] as const;

function Icon({ kind }: { kind: "plane" | "train" }) {
  return kind === "plane" ? (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" /></svg>
  ) : (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 2c-4 0-8 .5-8 4v9.5A3.5 3.5 0 0 0 7.5 19L6 20.5v.5h2l2-2h4l2 2h2v-.5L16.5 19a3.5 3.5 0 0 0 3.5-3.5V6c0-3.5-4-4-8-4zM7.5 17a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3.5-7H6V6h5zm2 0V6h5v4zm3.5 7a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z" /></svg>
  );
}

export default function Design3QuickLinks() {
  return (
    <section className="hidden" data-d3-quick aria-labelledby="d3-quick-heading">
      <p data-d3-eyebrow>Popular journeys</p>
      <h2 id="d3-quick-heading" data-d3-h2>Where are you travelling?</h2>
      <ul data-d3-routes>
        {JOURNEYS.map((j) => (
          <li key={j.href}>
            <Link href={j.href} data-d3-route>
              <span data-d3-route-icon><Icon kind={j.icon} /></span>
              <span data-d3-route-text>
                <strong>{j.title}</strong>
                <small>{j.sub}</small>
              </span>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
            </Link>
          </li>
        ))}
      </ul>
      <div data-d3-includes>
        <h3>Every booking includes</h3>
        <ul>
          <li>A pre-booked driver and a fixed price agreed before you travel</li>
          <li>Flight monitoring and up to 60 minutes’ free waiting at the airport</li>
          <li>Free cancellation up to 24 hours before pickup</li>
        </ul>
      </div>
    </section>
  );
}
