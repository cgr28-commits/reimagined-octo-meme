"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getSelection, setSelection, addToSelection } from "@/lib/private-tours-selection";
import {
  ATTRACTION_BY_ID, TAGS, TAG_LABELS, TOUR_BY_ID, ZONES, buildSchedule, durationLabel, parseHM, publicView, suggest, suggestAdditions, toHM,
  toursApi, toursApiConfigured,
} from "@/lib/private-tours";

type Item = { type: string; id: string; name: string; startMinutes: number; minutes: number; driveMinutes?: number; ticketed?: boolean; ticketNote?: string; mobility?: string; minMinutes?: number; maxMinutes?: number };
type Issue = { code: string; severity: string; message: string };
type Result = { ok: boolean; status: "fits" | "tight" | "blocked"; customer: { startMinutes: number; endMinutes: number; durationMinutes: number; items: Item[]; breakdown: { driving: number; stops: number; meals: number; waiting: number; contingency: number }; slackMinutes: number | null }; issues: Issue[]; cruise: { latestBack: string; bufferMinutes: number; allAboard: string; earliestStart: string | null; slackMinutes: number } | null; price: { pence: number | null; note: string }; reviewRequired: boolean };
type Receipt = { ok: boolean; reference?: string; handling?: string; message?: string; error?: string; errors?: string[] };

const MOBILITY_CHOICES = [["limited-walking", "Limited walking"], ["avoid-steps", "Avoid steps"], ["avoid-steep-paths", "Avoid steep paths"], ["wheelchair-folding", "Folding wheelchair"], ["needs-seating", "Frequent seating"]];
const futureDate = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

export default function PlanBuilder() {
  const params = useSearchParams();
  const [date, setDate] = useState(() => futureDate(30));
  const [startTime, setStartTime] = useState("09:00");
  const [guests, setGuests] = useState(2);
  const [pickup, setPickup] = useState("belfast-centre");
  const [interests, setInterests] = useState<string[]>([]);
  const [pace, setPace] = useState("balanced");
  const [stepFree, setStepFree] = useState("any"); // suggestion filter only; never stored
  const [budget, setBudget] = useState("");
  const [stopIds, setStopIds] = useState<string[]>([]);
  const [visits, setVisits] = useState<Record<string, number>>({});
  const [seed, setSeed] = useState(1);
  const [why, setWhy] = useState("");
  const [note, setNote] = useState("");
  const [cruiseOn, setCruiseOn] = useState(false);
  const [cruise, setCruise] = useState({ ship: "", allAboard: "20:00", canLeaveTerminal: "08:30", confirmed: false });
  const [tourId, setTourId] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ token: string; expiresAt: string } | null>(null);
  const [saveMsg, setSaveMsg] = useState("");
  const [hydrated, setHydrated] = useState(false);

  // Starting points: ?tour=, ?add=, ?cruise=1, ?plan=<token>
  useEffect(() => {
    const t = params.get("tour");
    const add = params.get("add");
    if (params.get("cruise") === "1") { setCruiseOn(true); setPickup("belfast-harbour"); setStartTime("10:00"); }
    const tour = t ? TOUR_BY_ID.get(t) : undefined;
    if (t && tour) {
      setTourId(t); setStopIds([...tour.stops]); setStartTime(tour.start);
      if (tour.cruise) { setCruiseOn(true); setPickup("belfast-harbour"); }
    } else if (add && ATTRACTION_BY_ID.has(add)) { addToSelection(add); setStopIds(getSelection().filter((id) => ATTRACTION_BY_ID.has(id))); }
    else if (getSelection().length) setStopIds(getSelection().filter((id) => ATTRACTION_BY_ID.has(id)));
    const token = params.get("plan");
    if (token) {
      toursApi<{ ok: boolean; plan: { stopIds: string[]; date: string | null; startTime: string; guests: number; pickupZoneId: string; interests: string[]; pace: string } }>(`/itinerary/saved/${encodeURIComponent(token)}`).then((r) => {
        if (r.ok && r.data?.plan) {
          const p = r.data.plan;
          setStopIds(p.stopIds); if (p.date) setDate(p.date); setStartTime(p.startTime); setGuests(p.guests); setPickup(p.pickupZoneId); setInterests(p.interests); setPace(p.pace);
          setNote("Your saved plan has been restored.");
        } else setNote("That saved plan has expired or was deleted.");
      });
    }
    setHydrated(true);
  }, [params]);

  useEffect(() => { if (hydrated) setSelection(stopIds); }, [stopIds, hydrated]);
  const startMinutes = parseHM(startTime);
  const result: Result | null = useMemo(() => {
    if (stopIds.length === 0 || startMinutes === null) return null;
    return publicView(buildSchedule({
      stopIds, date, startMinutes, pickupZoneId: pickup, dropoffZoneId: pickup, guests, visitMinutes: visits,
      cruise: cruiseOn ? { allAboard: cruise.allAboard, canLeaveTerminal: cruise.canLeaveTerminal, confirmed: cruise.confirmed } : undefined,
    })) as Result;
  }, [stopIds, startMinutes, date, pickup, guests, visits, cruiseOn, cruise]);

  const runSuggest = useCallback((surprise: boolean, nextSeed: number) => {
    if (startMinutes === null) return;
    const budgetPence = budget ? Math.round(Number(budget) * 100) : undefined;
    const s = suggest({
      date, startMinutes, pickupZoneId: pickup, dropoffZoneId: pickup, guests, interests, pace, mobility: stepFree, surprise, seed: nextSeed,
      budgetPence: Number.isFinite(budgetPence) ? budgetPence : undefined,
      cruise: cruiseOn ? { allAboard: cruise.allAboard, canLeaveTerminal: cruise.canLeaveTerminal, confirmed: cruise.confirmed } : undefined,
      cruiseScope: cruiseOn ? "belfastOnly" : undefined,
    });
    setSeed(nextSeed); setTourId(null); setVisits({});
    if (s.ok) { setStopIds(s.stopIds); setWhy([s.why, s.budgetNote].filter(Boolean).join(" ")); } else setWhy(s.message ?? "");
  }, [startMinutes, date, pickup, guests, interests, pace, stepFree, budget, cruiseOn, cruise]);

  const additions = useMemo(() => {
    if (stopIds.length === 0 || startMinutes === null || stopIds.length >= 8) return [];
    return suggestAdditions({ stopIds, date, startMinutes, pickupZoneId: pickup, guests, visitMinutes: visits }, interests) as { id: string; name: string; minutes: number }[];
  }, [stopIds, date, startMinutes, pickup, guests, visits, interests]);

  const move = (i: number, d: number) => setStopIds((ids) => { const n = [...ids]; const j = i + d; if (j < 0 || j >= n.length) return ids; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const remove = (id: string) => { setStopIds((ids) => ids.filter((x) => x !== id)); setTourId(null); };
  const toggle = (t: string) => setInterests((l) => (l.includes(t) ? l.filter((x) => x !== t) : [...l, t]));

  async function save() {
    setSaveMsg("");
    const r = await toursApi<{ ok: boolean; token: string; expiresAt: string }>("/itinerary/save", { method: "POST", body: JSON.stringify({ plan: { stopIds, date, startTime, guests, pickupZoneId: pickup, interests, pace } }) });
    if (r.ok && r.data?.token) { setSaved({ token: r.data.token, expiresAt: r.data.expiresAt }); setSaveMsg("Saved. Anyone with the link can open this plan until it expires. You can delete it at any time."); }
    else setSaveMsg(r.status === 429 ? "Too many saves just now. Please try again later." : toursApiConfigured ? "We could not save this plan. Please try again." : "Saving is not connected in this preview build.");
  }
  async function unsave() {
    if (!saved) return;
    await toursApi(`/itinerary/saved/${encodeURIComponent(saved.token)}`, { method: "DELETE" });
    setSaved(null); setSaveMsg("Your saved plan has been deleted.");
  }
  const link = saved && typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}?plan=${saved.token}` : "";

  return (
    <div className="pt-builder" style={{ marginTop: 28 }}>
      <div className="pt-panel pt-form">
        <h2 style={{ fontSize: "1.6rem" }}>Your day</h2>
        <div className="pt-two">
          <div><label htmlFor="d">Date</label><input id="d" type="date" value={date} min={futureDate(1)} onChange={(e) => setDate(e.target.value)} /></div>
          <div><label htmlFor="t">Start time</label><input id="t" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></div>
        </div>
        <div className="pt-two">
          <div><label htmlFor="g">Guests (up to 4)</label><select id="g" value={guests} onChange={(e) => setGuests(Number(e.target.value))}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}</select></div>
          <div><label htmlFor="p">Pick-up and return</label><select id="p" value={pickup} onChange={(e) => setPickup(e.target.value)}>{ZONES.map((z: { id: string; label: string }) => <option key={z.id} value={z.id}>{z.label}</option>)}</select></div>
        </div>
        <div>
          <span className="lbl">What do you enjoy?</span>
          <div className="pt-chips">{TAGS.map((t: string) => <button type="button" key={t} className="pt-chip" aria-pressed={interests.includes(t)} onClick={() => toggle(t)}>{(TAG_LABELS as Record<string, string>)[t] ?? t}</button>)}</div>
        </div>
        <div className="pt-two">
          <div><label htmlFor="pace">Pace</label><select id="pace" value={pace} onChange={(e) => setPace(e.target.value)}><option value="relaxed">Relaxed (fewer stops)</option><option value="balanced">Balanced</option><option value="full">Full (more stops)</option></select></div>
          <div><label htmlFor="mob">Walking preference (a provisional guide only)</label><select id="mob" value={stepFree} onChange={(e) => setStepFree(e.target.value)}><option value="any">No preference</option><option value="avoid-steep">Prefer gentler walking</option><option value="level-only">Prefer the least walking</option></select></div>
        </div>
        <div><label htmlFor="b">Flexible budget for the day, £ (optional)</label><input id="b" inputMode="numeric" value={budget} placeholder="e.g. 450" onChange={(e) => setBudget(e.target.value.replace(/[^\d]/g, ""))} /><p className="pt-muted" style={{ marginTop: 6 }}>A budget only steers suggestions. It never changes our prices or removes safety checks.</p></div>
        <label className="check"><input type="checkbox" checked={cruiseOn} onChange={(e) => { setCruiseOn(e.target.checked); if (e.target.checked) setPickup("belfast-harbour"); }} /> I am on a cruise and must be back for all-aboard</label>
        {cruiseOn ? (
          <div className="pt-form">
            <div className="pt-two">
              <div><label htmlFor="cs">Ship</label><input id="cs" value={cruise.ship} onChange={(e) => setCruise({ ...cruise, ship: e.target.value })} /></div>
              <div><label htmlFor="ca">All-aboard time</label><input id="ca" type="time" value={cruise.allAboard} onChange={(e) => setCruise({ ...cruise, allAboard: e.target.value })} /></div>
            </div>
            <div><label htmlFor="cl">Earliest you can leave the terminal</label><input id="cl" type="time" value={cruise.canLeaveTerminal} onChange={(e) => setCruise({ ...cruise, canLeaveTerminal: e.target.value })} /></div>
            <label className="check"><input type="checkbox" checked={cruise.confirmed} onChange={(e) => setCruise({ ...cruise, confirmed: e.target.checked })} /> These times come from my cruise line</label>
          </div>
        ) : null}
        <div className="pt-actions" style={{ marginTop: 4 }}>
          <button type="button" className="pt-btn green" onClick={() => runSuggest(false, seed)}>Suggest a day</button>
          <button type="button" className="pt-btn alt" onClick={() => runSuggest(true, Math.floor(Math.random() * 1e6))}>Surprise me</button>
          {stopIds.length > 0 ? <button type="button" className="pt-btn alt" onClick={() => runSuggest(false, seed + 1)}>Reshuffle</button> : null}
        </div>
        {why ? <p className="pt-muted" aria-live="polite">{why}</p> : null}
        {note ? <p className="pt-muted" aria-live="polite">{note}</p> : null}
      </div>

      <div style={{ display: "grid", gap: 20 }}>
        {!result ? (
          <div className="pt-panel"><h2 style={{ fontSize: "1.6rem" }}>Your itinerary</h2><p className="pt-muted" style={{ marginTop: 10 }}>Choose “Suggest a day” or “Surprise me”, or start from a <Link href="/private-tours/#tours">signature tour</Link> or the <Link href="/private-tours/attractions/">attraction library</Link>.</p></div>
        ) : (
          <>
            <div className={`pt-status ${result.status}`} role="status" aria-live="polite">
              {result.status === "fits" ? "This day fits." : result.status === "tight" ? "This day fits, but check the notes." : "This day does not fit yet."}
              {result.issues.length ? <ul className="pt-issues">{result.issues.map((i, n) => <li key={n}>{i.message}</li>)}</ul> : null}
            </div>
            <div className="pt-panel">
              <h2 style={{ fontSize: "1.6rem" }}>{tourId ? TOUR_BY_ID.get(tourId)?.name : "Your itinerary"}</h2>
              <div className="pt-stats">
                <div><b>{toHM(result.customer.startMinutes)}</b><span>Pick-up</span></div>
                <div><b>{toHM(result.customer.endMinutes)}</b><span>Back at</span></div>
                <div><b>{durationLabel(result.customer.durationMinutes)}</b><span>Total</span></div>
              </div>
              {result.cruise ? <p className="pt-muted">Latest safe return {result.cruise.latestBack} ({result.cruise.bufferMinutes}-minute buffer plus a traffic margin before {result.cruise.allAboard}).</p> : null}
              <ol className="pt-timeline">
                {result.customer.items.map((i, n) => {
                  const idx = stopIds.indexOf(i.id);
                  return (
                    <li key={`${i.id}-${n}`}>
                      <time>{toHM(i.startMinutes)}</time>
                      <div>
                        {i.driveMinutes ? <div className="drive">{i.driveMinutes} min drive (estimate)</div> : null}
                        <div className="name">{i.name}</div>
                        {i.minutes ? <div className="pt-muted">{i.minutes} min</div> : null}
                        {i.type === "stop" ? (
                          <div className="pt-row">
                            <button type="button" className="pt-chip" onClick={() => move(idx, -1)} disabled={idx === 0} aria-label={`Move ${i.name} earlier`}>↑</button>
                            <button type="button" className="pt-chip" onClick={() => move(idx, 1)} disabled={idx === stopIds.length - 1} aria-label={`Move ${i.name} later`}>↓</button>
                            <button type="button" className="pt-chip" onClick={() => setVisits((v) => ({ ...v, [i.id]: Math.max(i.minMinutes ?? 15, i.minutes - 15) }))} aria-label={`Shorter visit at ${i.name}`}>−15 min</button>
                            <button type="button" className="pt-chip" onClick={() => setVisits((v) => ({ ...v, [i.id]: Math.min(i.maxMinutes ?? 240, i.minutes + 15) }))} aria-label={`Longer visit at ${i.name}`}>+15 min</button>
                            <button type="button" className="pt-chip" onClick={() => remove(i.id)} aria-label={`Remove ${i.name}`}>Remove</button>
                          </div>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
              {additions.length ? (
                <div style={{ marginTop: 16 }}><span className="lbl">Add something that still fits</span>
                  <div className="pt-chips">{additions.map((a) => <button type="button" key={a.id} className="pt-chip" onClick={() => { setStopIds((ids) => [...ids, a.id]); setTourId(null); }}>+ {a.name}</button>)}</div>
                </div>
              ) : null}
              <div style={{ marginTop: 18 }}>
                <div className="pt-price">Price confirmed in your personal quote<small>Our published private tour prices apply to the signature tours. A tailored route is priced personally, and nothing is booked or charged until you accept your quote.</small></div>
                {result.reviewRequired ? <p className="pt-note" style={{ marginTop: 10 }}>We will review this plan personally before quoting.</p> : null}
              </div>
              <div className="pt-actions">
                <button type="button" className="pt-btn alt small" onClick={save} disabled={!!saved}>Save this plan (30 days)</button>
                {saved ? <button type="button" className="pt-btn alt small" onClick={unsave}>Delete saved plan</button> : null}
              </div>
              {saveMsg ? <p className="pt-muted" style={{ marginTop: 8 }} aria-live="polite">{saveMsg}</p> : null}
              {link ? <p className="pt-muted" style={{ wordBreak: "break-all" }}>{link}</p> : null}
            </div>
            <EnquiryForm result={result} date={date} startTime={startTime} guests={guests} pickup={pickup} stopIds={stopIds} visits={visits} tourId={tourId} cruiseOn={cruiseOn} cruise={cruise} />
          </>
        )}
      </div>
    </div>
  );
}

function EnquiryForm({ result, date, startTime, guests, pickup, stopIds, visits, tourId, cruiseOn, cruise }: {
  result: Result; date: string; startTime: string; guests: number; pickup: string; stopIds: string[]; visits: Record<string, number>; tourId: string | null; cruiseOn: boolean; cruise: { ship: string; allAboard: string; canLeaveTerminal: string; confirmed: boolean };
}) {
  const [f, setF] = useState({ name: "", email: "", phone: "", contactVia: "email", large: 0, cabin: 0, notes: "", pickupNote: "", consent: false, mobilityConsent: false, website: "" });
  const [mobility, setMobility] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Receipt | null>(null);
  const [error, setError] = useState("");
  const set = (k: string, v: string | number | boolean) => setF((s) => ({ ...s, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!result.ok) { setError("Please fix the problems above before requesting a quote."); return; }
    setBusy(true);
    const body = {
      name: f.name, email: f.email, phone: f.phone, contactVia: f.contactVia, date, startTime, guests, pickupZoneId: pickup, dropoffZoneId: pickup, pickupNote: f.pickupNote,
      stopIds, tourId, visitMinutes: visits, luggage: { large: Number(f.large), cabin: Number(f.cabin) }, notes: f.notes, website: f.website, consentToStore: f.consent,
      cruise: cruiseOn ? { ship: cruise.ship, allAboard: cruise.allAboard, canLeaveTerminal: cruise.canLeaveTerminal, confirmed: cruise.confirmed } : undefined,
      mobility: mobility.length ? { preferences: mobility, consent: f.mobilityConsent } : undefined,
    };
    const r = await toursApi<Receipt>("/enquiries", { method: "POST", body: JSON.stringify(body) });
    setBusy(false);
    if (r.ok && r.data?.ok) setDone(r.data);
    else if (r.status === 429) setError("You have sent several requests recently. Please try again later.");
    else if (r.status === 400 && r.data?.errors) setError(`Please check: ${r.data.errors.join(", ")}.`);
    else setError(toursApiConfigured ? "We could not send your request. Please try again." : "Requests are not connected in this preview build.");
  }

  if (done) return (
    <div className="pt-ok" role="status"><h2 style={{ fontSize: "1.5rem" }}>Request received</h2><p style={{ marginTop: 8 }}>{done.message}</p><p style={{ marginTop: 8 }}><b>Reference {done.reference}</b></p><p className="pt-muted" style={{ marginTop: 8 }}>This is a staging preview: no real quote will be sent.</p></div>
  );

  return (
    <form className="pt-panel pt-form" onSubmit={submit} noValidate>
      <h2 style={{ fontSize: "1.6rem" }}>Request a private quote</h2>
      <p className="pt-muted">No payment is taken. We check availability and reply with a personal quote valid for 7 days.</p>
      <div className="pt-two">
        <div><label htmlFor="n">Your name</label><input id="n" autoComplete="name" value={f.name} onChange={(e) => set("name", e.target.value)} required /></div>
        <div><label htmlFor="e">Email</label><input id="e" type="email" autoComplete="email" value={f.email} onChange={(e) => set("email", e.target.value)} required /></div>
      </div>
      <div className="pt-two">
        <div><label htmlFor="ph">Phone or WhatsApp (optional)</label><input id="ph" type="tel" autoComplete="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></div>
        <div><label htmlFor="cv">Best way to reach you</label><select id="cv" value={f.contactVia} onChange={(e) => set("contactVia", e.target.value)}><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="phone">Phone</option></select></div>
      </div>
      <div><label htmlFor="pn">Hotel or pick-up details</label><input id="pn" value={f.pickupNote} onChange={(e) => set("pickupNote", e.target.value)} /></div>
      <div className="pt-two">
        <div><label htmlFor="lg">Large suitcases</label><select id="lg" value={f.large} onChange={(e) => set("large", Number(e.target.value))}>{[0, 1, 2, 3, 4].map((n) => <option key={n}>{n}</option>)}</select></div>
        <div><label htmlFor="cb">Cabin bags</label><select id="cb" value={f.cabin} onChange={(e) => set("cabin", Number(e.target.value))}>{[0, 1, 2, 3, 4].map((n) => <option key={n}>{n}</option>)}</select></div>
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="lbl">Mobility or access needs (optional)</legend>
        <div className="pt-chips">{MOBILITY_CHOICES.map(([id, label]) => <button type="button" key={id} className="pt-chip" aria-pressed={mobility.includes(id)} onClick={() => setMobility((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]))}>{label}</button>)}</div>
        {mobility.length ? <label className="check" style={{ marginTop: 10 }}><input type="checkbox" checked={f.mobilityConsent} onChange={(e) => set("mobilityConsent", e.target.checked)} /> I agree you may store these needs to plan my day. They are used only for this request and are never used for marketing or analytics.</label> : null}
      </fieldset>
      <div><label htmlFor="no">Anything else we should know?</label><textarea id="no" value={f.notes} maxLength={1000} onChange={(e) => set("notes", e.target.value)} /></div>
      <div className="pt-hp" aria-hidden="true"><label htmlFor="web">Website</label><input id="web" tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => set("website", e.target.value)} /></div>
      <label className="check"><input type="checkbox" checked={f.consent} onChange={(e) => set("consent", e.target.checked)} /> I agree My Airport Taxi NI may store these details for 30 days to prepare and send my quote.</label>
      {error ? <p className="pt-status blocked" role="alert">{error}</p> : null}
      <button className="pt-btn green" type="submit" disabled={busy || !f.consent}>{busy ? "Sending…" : "Request my private quote"}</button>
    </form>
  );
}
