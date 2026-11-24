"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ATTRACTIONS, REGIONS, TAGS, TAG_LABELS } from "@/lib/private-tours";
import credits from "@/lib/private-tours-photo-credits.json";
import { SELECTION_MAX, addToSelection, clearSelection, removeFromSelection, useSelection } from "@/lib/private-tours-selection";

type Attraction = { id: string; name: string; region: string; blurb: string; minutes: number; tags: string[] };
type Credit = { title: string; author: string; licence: string; licenceUrl: string; source: string };
const CREDITS = credits as Record<string, Credit>;
const regionLabel = (r: string) => (REGIONS as Record<string, string>)[r];
const tagLabel = (t: string) => (TAG_LABELS as Record<string, string>)[t] ?? t;
const photo = (id: string) => (CREDITS[id] ? `/images/private-tours/${id}.webp` : null);

export default function AttractionLibrary() {
  const selected = useSelection();
  const [region, setRegion] = useState("all");
  const [tag, setTag] = useState("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [onlySelected, setOnlySelected] = useState(false);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (ATTRACTIONS as Attraction[]).filter((a) =>
      (region === "all" || a.region === region) &&
      (tag === "all" || a.tags.includes(tag)) &&
      (!onlySelected || selected.includes(a.id)) &&
      (!q || `${a.name} ${a.blurb} ${regionLabel(a.region)} ${a.tags.map(tagLabel).join(" ")}`.toLowerCase().includes(q)));
  }, [region, tag, query, onlySelected, selected]);

  return (
    <div style={{ marginTop: 28 }}>
      <div className="pt-search">
        <label htmlFor="pt-q" className="pt-sr">Search attractions</label>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input id="pt-q" type="search" placeholder="Search places, areas or interests, e.g. castle, Game of Thrones, gardens" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
      </div>
      <div className="pt-chips" style={{ marginTop: 14 }} role="group" aria-label="Filter by area">
        <button className="pt-chip" aria-pressed={region === "all"} onClick={() => setRegion("all")}>All areas</button>
        {Object.entries(REGIONS).map(([id, label]) => (
          <button key={id} className="pt-chip" aria-pressed={region === id} onClick={() => setRegion(id)}>{label as string}</button>
        ))}
      </div>
      <div className="pt-chips" style={{ marginTop: 10 }} role="group" aria-label="Filter by interest">
        <button className="pt-chip" aria-pressed={tag === "all"} onClick={() => setTag("all")}>Any interest</button>
        {(TAGS as string[]).map((t) => <button key={t} className="pt-chip" aria-pressed={tag === t} onClick={() => setTag(t)}>{tagLabel(t)}</button>)}
      </div>
      <div className="pt-bar">
        <p className="pt-muted" aria-live="polite">{list.length} place{list.length === 1 ? "" : "s"}{selected.length ? ` · ${selected.length} in your itinerary` : ""}</p>
        <div className="pt-row" style={{ marginTop: 0 }}>
          {selected.length ? <button className="pt-chip" aria-pressed={onlySelected} onClick={() => setOnlySelected((v) => !v)}>Show only my selection</button> : null}
          {selected.length ? <button className="pt-chip" onClick={() => { clearSelection(); setOnlySelected(false); }}>Clear all</button> : null}
        </div>
      </div>
      {list.length === 0 ? <p className="pt-panel pt-muted">No places match. Try a different word or clear a filter.</p> : null}
      <div className="pt-grid pt-lib">
        {list.map((a) => {
          const on = selected.includes(a.id);
          const img = photo(a.id);
          const c = CREDITS[a.id];
          const expanded = open === a.id;
          return (
            <article key={a.id} className={`pt-card pt-attr${on ? " is-selected" : ""}`}>
              <div className="pt-media">
                {img ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img} alt={`${a.name}. Photograph by ${c.author}.`} loading="lazy" />
                ) : (
                  <div className="pt-nophoto" role="img" aria-label={`${a.name} (no photograph yet)`}><span>{regionLabel(a.region)}</span></div>
                )}
                {on ? <span className="pt-badge" aria-hidden="true">✓ In your itinerary</span> : null}
              </div>
              <div className="body">
                <p className="pt-kicker">{regionLabel(a.region)}</p>
                <h3>{a.name}</h3>
                <p className="pt-muted">{a.blurb}</p>
                <div className="pt-row" style={{ marginTop: 2 }}>
                  <button type="button" className={`pt-btn small ${on ? "alt" : "green"}`} aria-pressed={on} onClick={() => (on ? removeFromSelection(a.id) : addToSelection(a.id))} disabled={!on && selected.length >= SELECTION_MAX}>
                    {on ? "Remove from my itinerary" : selected.length >= SELECTION_MAX ? "Itinerary is full" : "Add to my itinerary"}
                  </button>
                  <button type="button" className="pt-chip" aria-expanded={expanded} aria-controls={`more-${a.id}`} onClick={() => setOpen(expanded ? null : a.id)}>{expanded ? "Less" : "More info"}</button>
                </div>
                {expanded ? (
                  <div id={`more-${a.id}`} className="pt-more">
                    <dl>
                      <dt>Area</dt><dd>{regionLabel(a.region)}</dd>
                      <dt>Good for</dt><dd>{a.tags.map(tagLabel).join(", ")}</dd>
                      <dt>Time in your plan</dt><dd>About {a.minutes} minutes to start with. You can make the visit shorter or longer in the planner.</dd>
                    </dl>
                    <p className="pt-note">We do not list opening times, admission prices or access details here. We confirm them for your date in your private quote, and the attraction&apos;s own website is the best source before you travel.</p>
                    {c ? <p className="pt-credit">Photo: <a href={c.source} target="_blank" rel="noopener noreferrer">{c.title}</a> by {c.author}, {c.licenceUrl ? <a href={c.licenceUrl} target="_blank" rel="noopener noreferrer">{c.licence}</a> : c.licence}, via Wikimedia Commons. Resized and re-encoded.</p> : null}
                  </div>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
      {selected.length ? (
        <div className="pt-actions"><Link className="pt-btn green" href="/private-tours/plan/">Plan my day with {selected.length} place{selected.length === 1 ? "" : "s"}</Link></div>
      ) : null}
    </div>
  );
}
