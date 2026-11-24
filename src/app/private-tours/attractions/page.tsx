import AttractionLibrary from "@/components/private-tours/AttractionLibrary";
import credits from "@/lib/private-tours-photo-credits.json";
import { ATTRACTIONS } from "@/lib/private-tours";

type Credit = { title: string; author: string; licence: string; licenceUrl: string; source: string };

export const metadata = { title: "Northern Ireland attractions for a private tour", description: "Search Northern Ireland attractions, add them to your itinerary and request a personal private tour quote.", alternates: { canonical: "/private-tours/attractions/" } };

export default function AttractionsPage() {
  const list = credits as Record<string, Credit>;
  return (
    <section className="pt-hero pt-wrap">
      <p className="pt-kicker">Attraction library</p>
      <h1 style={{ marginTop: 8 }}>Places we love to take you</h1>
      <p className="lead">Search our hand-picked places, add the ones you like to your itinerary, and we will build the day around them. Opening times, admission prices and access details are confirmed for your date in your private quote.</p>
      <AttractionLibrary />
      <details className="pt-panel" style={{ marginTop: 36 }}>
        <summary style={{ cursor: "pointer", fontWeight: 700 }}>Photo credits and licences</summary>
        <p className="pt-muted" style={{ margin: "10px 0" }}>Photographs are openly licensed from Wikimedia Commons. Each was resized and re-encoded. Adapted CC BY-SA images are shared under the same licence.</p>
        <ul className="pt-credit" style={{ paddingLeft: 18, display: "grid", gap: 6 }}>
          {(ATTRACTIONS as { id: string; name: string }[]).filter((a) => list[a.id]).map((a) => {
            const c = list[a.id];
            return <li key={a.id}><b>{a.name}:</b> <a href={c.source} target="_blank" rel="noopener noreferrer">{c.title}</a> by {c.author}, {c.licenceUrl ? <a href={c.licenceUrl} target="_blank" rel="noopener noreferrer">{c.licence}</a> : c.licence}</li>;
          })}
        </ul>
      </details>
    </section>
  );
}
