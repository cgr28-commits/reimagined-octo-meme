import Link from "next/link";
import { TOURS, formatPounds, tourPhoto } from "@/lib/private-tours";

export default function PrivateToursHome() {
  return (
    <>
      <section className="pt-hero pt-wrap">
        <p className="pt-kicker">Private tours from Belfast</p>
        <h1>Your day, your pace, your own private local driver.</h1>
        <p className="lead">Six signature tours, or build your own day from our hand-picked places. See instantly whether it fits, then send us a quote request. Nothing is charged until you accept a private quote.</p>
        <div className="pt-actions">
          <Link className="pt-btn green" href="/private-tours/plan/">Plan your day</Link>
          <Link className="pt-btn alt" href="#tours">See the signature tours</Link>
        </div>
      </section>
      <section id="tours" className="pt-section pt-wrap">
        <p className="pt-kicker">Signature tours</p>
        <h2 style={{ margin: "6px 0 20px" }}>Six ways to see Northern Ireland</h2>
        <div className="pt-grid">
          {TOURS.map((t) => (
            <article className="pt-card" key={t.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={tourPhoto(t.photo)} alt="" loading="lazy" />
              <div className="body">
                <p className="pt-kicker">{t.kicker}</p>
                <h3>{t.name}</h3>
                <p className="pt-muted">{t.tagline}</p>
                <div className="meta">
                  <div className="pt-price">{t.pricePence ? <>from {formatPounds(t.pricePence)}</> : "Quote"}<small>provisional · for the car, up to 4 guests</small></div>
                  <Link className="pt-btn small" href={`/private-tours/${t.slug}/`}>View tour</Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="pt-section pt-wrap">
        <div className="pt-panel">
          <h2>How it works</h2>
          <ol className="pt-steps" style={{ marginTop: 18 }}>
            <li><div><b>Choose or build.</b> <span className="pt-muted">Start from a signature tour or let us suggest a day around your interests.</span></div></li>
            <li><div><b>See it fit.</b> <span className="pt-muted">Opening hours, drive times and your finish time update as you change the plan.</span></div></li>
            <li><div><b>Request a private quote.</b> <span className="pt-muted">We check availability and reply personally. No payment is taken on this site yet.</span></div></li>
          </ol>
        </div>
      </section>
    </>
  );
}
