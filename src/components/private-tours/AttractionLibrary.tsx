"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ATTRACTIONS, REGIONS, TAGS, TAG_LABELS } from "@/lib/private-tours";

const MOBILITY: Record<string, string> = { level: "Level, easy access", "some-steps": "Some steps", steep: "Steep paths or many steps" };

export default function AttractionLibrary() {
  const [region, setRegion] = useState("all");
  const [tag, setTag] = useState("all");
  const list = useMemo(() => ATTRACTIONS.filter((a: { region: string; tags: string[] }) => (region === "all" || a.region === region) && (tag === "all" || a.tags.includes(tag))), [region, tag]);
  return (
    <div style={{ marginTop: 28 }}>
      <div className="pt-chips" role="group" aria-label="Filter by area">
        <button className="pt-chip" aria-pressed={region === "all"} onClick={() => setRegion("all")}>All areas</button>
        {Object.entries(REGIONS).map(([id, label]) => (
          <button key={id} className="pt-chip" aria-pressed={region === id} onClick={() => setRegion(id)}>{label as string}</button>
        ))}
      </div>
      <div className="pt-chips" style={{ marginTop: 10 }} role="group" aria-label="Filter by interest">
        <button className="pt-chip" aria-pressed={tag === "all"} onClick={() => setTag("all")}>Any interest</button>
        {TAGS.map((t: string) => (
          <button key={t} className="pt-chip" aria-pressed={tag === t} onClick={() => setTag(t)}>{(TAG_LABELS as Record<string, string>)[t] ?? t}</button>
        ))}
      </div>
      <p className="pt-muted" style={{ margin: "18px 0" }} aria-live="polite">{list.length} place{list.length === 1 ? "" : "s"}</p>
      <div className="pt-grid">
        {list.map((a: { id: string; name: string; region: string; blurb: string; minutes: number; tags: string[]; mobility: string; ticketed: boolean; ticketNote?: string; seasonMonths?: number[] }) => (
          <article key={a.id} className="pt-card"><div className="body">
            <p className="pt-kicker">{(REGIONS as Record<string, string>)[a.region]}</p>
            <h3>{a.name}</h3>
            <p className="pt-muted">{a.blurb}</p>
            <div className="pt-chips">
              <span className="pt-chip static">about {a.minutes} min</span>
              <span className="pt-chip static">{MOBILITY[a.mobility]}</span>
              {a.ticketed ? <span className="pt-chip static">Ticket not included</span> : null}
              {a.seasonMonths ? <span className="pt-chip static">Seasonal</span> : null}
            </div>
            <div className="meta"><span /><Link className="pt-btn small" href={`/private-tours/plan/?add=${a.id}`}>Add to my day</Link></div>
          </div></article>
        ))}
      </div>
    </div>
  );
}
