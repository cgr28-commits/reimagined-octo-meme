import Link from "next/link";
import { TOURS, guidePrice, tourPhoto } from "@/lib/private-tours";

export const metadata = { title: "Private cruise excursions from Belfast", description: "Private excursions for cruise guests in Belfast, planned around your all-aboard time and confirmed in a personal quote.", alternates: { canonical: "/private-tours/cruise-excursions/" } };

export default function CruisePage() {
  const cruise = TOURS.filter((t: { cruise: boolean }) => t.cruise);
  return (
    <>
      <section className="pt-hero pt-wrap">
        <p className="pt-kicker">Cruise guests</p>
        <h1 style={{ marginTop: 8 }}>Your ship sails on time. So do we.</h1>
        <p className="lead">Every cruise day is planned backwards from your ship&apos;s all-aboard time, with a protected return buffer and a traffic safety margin. If a plan does not fit safely, we say so before you ask for a quote.</p>
      </section>
      <section className="pt-section pt-wrap">
        <div className="pt-grid">
          {cruise.map((t: { id: string; name: string; kicker: string; tagline: string; photo: string; pricePence: number | null; slug: string; cruiseScope: string }) => (
            <article className="pt-card" key={t.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={tourPhoto(t.photo)} alt="" loading="lazy" />
              <div className="body">
                <p className="pt-kicker">{t.kicker}</p><h3>{t.name}</h3><p className="pt-muted">{t.tagline}</p>
                <p className="pt-muted"><b>{t.cruiseScope === "longDistance" ? "90-minute" : "60-minute"} return buffer</b> before all-aboard, plus a traffic margin.</p>
                <div className="meta"><div className="pt-price">{guidePrice(t.id).label}<small>{guidePrice(t.id).note}</small></div><Link className="pt-btn small" href={`/private-tours/${t.slug}/`}>View tour</Link></div>
              </div>
            </article>
          ))}
        </div>
        <div className="pt-panel" style={{ marginTop: 24 }}>
          <h2>What we need from you</h2>
          <ul className="pt-muted" style={{ paddingLeft: 18, marginTop: 10 }}>
            <li>Your ship&apos;s name and the all-aboard time, confirmed from your cruise line</li>
            <li>The time you can leave the terminal (we start 30 minutes later)</li>
            <li>Pick-up and return at Belfast Harbour</li>
          </ul>
          <div className="pt-actions"><Link className="pt-btn green" href="/private-tours/plan/?cruise=1">Plan a cruise day</Link></div>
        </div>
      </section>
    </>
  );
}
