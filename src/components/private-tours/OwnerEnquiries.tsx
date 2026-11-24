"use client";
import { useState } from "react";
import { formatPounds, toursApi } from "@/lib/private-tours";

type Enquiry = {
  id: string; createdAt: string; expiresAt: string; status: string;
  contact: { name: string; email: string; phone: string; via: string };
  request: { date: string; guests: number; pickupZoneId: string; pickupNote: string; tourId: string | null; luggage: { large: number; cabin: number }; notes: string };
  cruise: { ship: string; allAboard: string; scope: string; latestBack: string | null } | null;
  itinerary: { startTime: string; endTime: string; durationMinutes: number; items: { name: string; time: string; type: string }[] } | null;
  price: { pence: number | null }; mobility: string[]; owner: { driverWorkingMinutes: number | null };
  issues: { code: string; severity: string; message: string }[]; flags: Record<string, boolean>;
};

export default function OwnerEnquiries() {
  const [key, setKey] = useState("");
  const [rows, setRows] = useState<Enquiry[] | null>(null);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  const auth = { authorization: `Bearer ${key}` };

  async function load() {
    setMsg("");
    const r = await toursApi<{ entries: Enquiry[]; statuses: string[] }>("/owner/enquiries", { headers: auth });
    if (r.ok && r.data) { setRows(r.data.entries); setStatuses(r.data.statuses); }
    else setMsg(r.status === 401 || r.status === 403 ? "That key was not accepted." : r.status === 429 ? "Too many attempts. Wait and try again." : "Could not load enquiries.");
  }
  async function setStatus(id: string, status: string) {
    await toursApi("/owner/enquiries/status", { method: "POST", headers: auth, body: JSON.stringify({ id, status }) });
    await load();
  }
  async function remove(id: string) {
    await toursApi("/owner/enquiries/delete", { method: "POST", headers: auth, body: JSON.stringify({ id }) });
    await load();
  }

  return (
    <div style={{ marginTop: 24 }}>
      <div className="pt-panel pt-form" style={{ maxWidth: 520 }}>
        <div><label htmlFor="k">Owner key</label><input id="k" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} /></div>
        <button className="pt-btn" type="button" onClick={load} disabled={!key}>Load enquiries</button>
        {msg ? <p className="pt-status blocked" role="alert">{msg}</p> : null}
      </div>
      {rows ? (
        <div style={{ display: "grid", gap: 16, marginTop: 24 }}>
          {rows.length === 0 ? <p className="pt-muted">No enquiries yet.</p> : null}
          {rows.map((e) => {
            const review = Object.entries(e.flags).filter(([k, v]) => v && k !== "cruise").map(([k]) => k);
            return (
              <article className="pt-panel" key={e.id}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <h3>{e.contact.name} · {e.request.date}</h3>
                  <span className="pt-chip static">{e.id} · {e.status}</span>
                </div>
                <p className="pt-muted">{e.contact.email}{e.contact.phone ? ` · ${e.contact.phone}` : ""} (prefers {e.contact.via}) · {e.request.guests} guest(s) · {e.request.pickupZoneId}{e.request.pickupNote ? ` · ${e.request.pickupNote}` : ""}</p>
                {e.itinerary ? <p style={{ marginTop: 8 }}><b>{e.itinerary.startTime}–{e.itinerary.endTime}</b> · {e.itinerary.items.filter((i) => i.type === "stop").map((i) => i.name).join(" → ")} · {e.price.pence ? formatPounds(e.price.pence) : "no band"} (provisional)</p> : null}
                <p className="pt-muted">Driver working time {e.owner.driverWorkingMinutes ? `${Math.round(e.owner.driverWorkingMinutes / 6) / 10} h` : "n/a"} · luggage {e.request.luggage.large} large, {e.request.luggage.cabin} cabin</p>
                {e.cruise ? <p className="pt-note" style={{ marginTop: 8 }}>Cruise: {e.cruise.ship}, all-aboard {e.cruise.allAboard}, latest safe return {e.cruise.latestBack}</p> : null}
                {e.mobility.length ? <p className="pt-note" style={{ marginTop: 8 }}>Access needs (consented): {e.mobility.join(", ")}</p> : null}
                {review.length ? <p className="pt-note" style={{ marginTop: 8 }}>Needs your review: {review.join(", ")}</p> : null}
                {e.issues.length ? <ul className="pt-muted" style={{ paddingLeft: 18 }}>{e.issues.map((i, n) => <li key={n}>{i.message}</li>)}</ul> : null}
                {e.request.notes ? <p style={{ marginTop: 8 }}>“{e.request.notes}”</p> : null}
                <div className="pt-row">
                  {statuses.map((s) => <button key={s} className="pt-chip" aria-pressed={e.status === s} onClick={() => setStatus(e.id, s)}>{s}</button>)}
                  <button className="pt-chip" onClick={() => remove(e.id)}>Delete now</button>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
