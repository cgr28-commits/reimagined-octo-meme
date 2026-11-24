import Link from "next/link";
import { notFound } from "next/navigation";
import { ATTRACTION_BY_ID, TOURS, TOUR_BY_ID, buildSchedule, formatPounds, parseHM, publicView, tourPhoto, toHM, durationLabel } from "@/lib/private-tours";

export function generateStaticParams() {
  return TOURS.map((t) => ({ slug: t.slug }));
}
export const dynamicParams = false;

export default async function TourPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tour = TOUR_BY_ID.get(slug);
  if (!tour) notFound();
  const cruise = tour.cruise ? { allAboard: "20:00", canLeaveTerminal: "08:30", confirmed: true } : undefined;
  const sample = publicView(buildSchedule({
    stopIds: tour.stops, date: "2027-06-10", startMinutes: parseHM(tour.start), pickupZoneId: tour.cruise ? "belfast-harbour" : "belfast-centre", guests: 2, cruise,
  }));
  const items = sample.customer?.items ?? [];
  const half = tour.variants && tour.halfDayStops
    ? publicView(buildSchedule({ stopIds: tour.halfDayStops, date: "2027-06-10", startMinutes: parseHM(tour.start), pickupZoneId: "belfast-centre", guests: 2 }))
    : null;
  const planHref = `/private-tours/plan/?tour=${tour.id}`;
  return (
    <>
      <section className="pt-hero pt-wrap">
        <div className="pt-split">
          <div>
            <p className="pt-kicker">{tour.kicker}</p>
            <h1 style={{ marginTop: 8 }}>{tour.name}</h1>
            <p className="lead">{tour.tagline}</p>
            <div className="pt-price" style={{ marginTop: 18 }}>{tour.pricePence ? <>from {formatPounds(tour.pricePence)}</> : "Price in your quote"}<small>provisional staging price · for the car, up to 4 guests · about {durationLabel(sample.customer?.durationMinutes ?? 0)}</small></div>
            <div className="pt-actions">
              <Link className="pt-btn green" href={planHref}>Customise this tour</Link>
              <Link className="pt-btn alt" href="/private-tours/plan/">Build from scratch</Link>
            </div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="pt-hero-img" src={tourPhoto(tour.photo)} alt="" />
        </div>
      </section>
      <section className="pt-section pt-wrap">
        <div className="pt-split">
          <div className="pt-panel">
            <h2 style={{ marginBottom: 6 }}>A sample day</h2>
            <p className="pt-muted">Provisional timings for a June day starting {tour.start}. Your plan is rechecked for your date.</p>
            <ol className="pt-timeline" style={{ marginTop: 12 }}>
              {items.map((i: { id: string; name: string; startMinutes: number; minutes: number; driveMinutes?: number; blurb?: string; type: string }, n: number) => (
                <li key={`${i.id}-${n}`}>
                  <time>{toHM(i.startMinutes)}</time>
                  <div>
                    {i.driveMinutes ? <div className="drive">{i.driveMinutes} min drive</div> : null}
                    <div className="name">{i.name}</div>
                    {i.minutes ? <div className="pt-muted">{i.minutes} minutes{i.type === "stop" && ATTRACTION_BY_ID.get(i.id)?.ticketed ? " · entry ticket not included" : ""}</div> : null}
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <aside style={{ display: "grid", gap: 16 }}>
            <div className="pt-panel">
              <h3>What is included</h3>
              <ul className="pt-muted" style={{ paddingLeft: 18, margin: "10px 0 0" }}>
                <li>Your own private local driver and car, up to 4 guests</li>
                <li>Flexible pace: tell us what to linger over</li>
                <li>Hotel or harbour pick-up in Greater Belfast</li>
              </ul>
              <p className="pt-muted" style={{ marginTop: 10 }}>Entry tickets and meals are paid separately. Your driver is a private local driver; tours are driven, not guided.</p>
            </div>
            {half?.customer ? (
              <div className="pt-panel"><h3>Half-day option</h3><p className="pt-muted" style={{ marginTop: 8 }}>About {durationLabel(half.customer.durationMinutes)}. The half-day price is confirmed in your private quote.</p></div>
            ) : null}
            {tour.cruise ? (
              <div className="pt-panel"><h3>Cruise safety</h3><p className="pt-muted" style={{ marginTop: 8 }}>Your return is planned around your ship&apos;s all-aboard time with a protected buffer. {tour.cruiseScope === "longDistance" ? "Longer coast days need a later sailing." : ""}</p></div>
            ) : null}
          </aside>
        </div>
      </section>
    </>
  );
}
