"use client";

/**
 * Driver portal — Stage 2 (jobs).
 * Offers sent to this driver, their confirmed jobs with On the way / Arrived / Complete,
 * Accept Change / Can't Do New Time, and past jobs. Only this driver's own fee is ever shown.
 */
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import styles from "@/components/owner-mobile/OwnerMobile.module.css";
import { DriverAccountsError, ukDate } from "@/lib/driver-accounts-api";
import {
  JOB_STATUS_LABEL,
  NEXT_STATUS_LABEL,
  driverJobs,
  poundsToPence,
  readLocation,
  type DriverJob,
  type DriverJobsView,
  type DriverOffer,
} from "@/lib/driver-jobs-api";

const body: CSSProperties = { margin: 0, fontSize: 14, color: "#33445C", lineHeight: 1.45 };
const strong: CSSProperties = { margin: 0, fontSize: 17, fontWeight: 800, color: "#071C38" };
const inputStyle: CSSProperties = { width: "100%", minHeight: 48, border: "1px solid #dce3ec", borderRadius: 12, padding: "0 14px", fontSize: 16, color: "#071C38", background: "#fff" };
const bigButton: CSSProperties = { minHeight: 56, fontSize: 17, borderRadius: 16 };

function trip(date: string, time: string): string {
  return `${ukDate(date)}${time ? ` · ${time}` : ""}`;
}
function clock(iso: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }) : "";
}
function closes(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
}
function message(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong.";
}
function mapsLink(address: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

export default function DriverJobs({ session, onToast }: { session: string; onToast: (t: string) => void }) {
  const [view, setView] = useState<DriverJobsView | null>(null);
  const [error, setError] = useState("");
  const [off, setOff] = useState(false);
  const [showPast, setShowPast] = useState(false);

  const load = useCallback(async () => {
    try {
      setView(await driverJobs.list(session));
      setError("");
    } catch (e) {
      if (e instanceof DriverAccountsError && e.status === 404) setOff(true);
      else setError(message(e));
    }
  }, [session]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  if (off) return null;
  if (!view) return error ? <div className={`${styles.notice} ${styles.red}`}>{error}</div> : <p className={styles.empty}>Loading your jobs…</p>;

  return (
    <>
      {error ? <div className={`${styles.notice} ${styles.red}`}>{error}</div> : null}
      {!view.vehicleReg ? <VehicleReg session={session} onSaved={load} onToast={onToast} /> : null}

      <h2 className={styles.sectionTitle} style={{ margin: "4px 4px 0" }}>
        Offers{view.offers.length ? ` · ${view.offers.length}` : ""}
      </h2>
      {!view.offers.length ? (
        <p className={styles.empty}>{view.available ? "No offers right now. New ones appear here." : "You're switched to unavailable, so you won't be sent offers."}</p>
      ) : null}
      {view.offers.map((o) => (
        <OfferCard key={o.id} offer={o} session={session} hasReg={Boolean(view.vehicleReg)} onDone={load} onToast={onToast} />
      ))}

      <h2 className={styles.sectionTitle} style={{ margin: "4px 4px 0" }}>
        Your jobs{view.jobs.length ? ` · ${view.jobs.length}` : ""}
      </h2>
      {!view.jobs.length ? <p className={styles.empty}>You have no jobs booked in.</p> : null}
      {view.jobs.map((j) => (
        <JobCard key={j.id} job={j} session={session} onDone={load} onToast={onToast} />
      ))}

      {view.past.length ? (
        <section className={styles.card} style={{ overflow: "hidden" }}>
          <button type="button" className={styles.row} onClick={() => setShowPast((v) => !v)} aria-expanded={showPast}>
            <span className={styles.rowBody}>
              <span className={styles.rowTitle} style={{ fontWeight: 700 }}>
                Past jobs · {view.past.length}
              </span>
            </span>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#5B6B80" }}>{showPast ? "Hide" : "Show"}</span>
          </button>
          {showPast
            ? view.past.map((j) => (
                <div key={j.id} className={styles.row} style={{ cursor: "default" }} data-past-job={j.id}>
                  <span className={styles.rowBody}>
                    <span className={styles.rowTitle} style={{ fontWeight: 700 }}>
                      {trip(j.tripDate, j.tripTime)}
                    </span>
                    <span className={styles.rowDetail} style={{ whiteSpace: "normal" }}>
                      {j.pickup} → {j.dropoff}
                      {j.note ? ` — ${j.note}` : ""}
                    </span>
                  </span>
                  <span style={{ display: "grid", justifyItems: "end", gap: 4 }}>
                    <span className={`${styles.chip} ${j.status === "completed" ? styles.green : styles.grey}`}>{JOB_STATUS_LABEL[j.status]}</span>
                    {j.status === "completed" ? <span style={{ fontSize: 14, fontWeight: 800, color: "#071C38" }}>{j.feeLabel}</span> : null}
                  </span>
                </div>
              ))
            : null}
        </section>
      ) : null}
      <p style={{ margin: "0 4px", fontSize: 13, color: "#5B6B80" }}>Fees shown are your agreed fee for each job. Payments are arranged by the office.</p>
    </>
  );
}

function VehicleReg({ session, onSaved, onToast }: { session: string; onSaved: () => void; onToast: (t: string) => void }) {
  const [reg, setReg] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <section className={`${styles.card} ${styles.cardPad}`} style={{ display: "grid", gap: 10, border: "2px solid #F79009" }} data-vehicle-reg>
      <h2 className={styles.sectionTitle}>Add your vehicle registration</h2>
      <p style={body}>You need this before you can take a job. The customer is sent part of it so they can spot your car.</p>
      <input style={{ ...inputStyle, textTransform: "uppercase" }} value={reg} onChange={(e) => setReg(e.target.value)} placeholder="e.g. AB12 CDE" aria-label="Vehicle registration" autoCapitalize="characters" maxLength={10} />
      {error ? <div className={`${styles.notice} ${styles.red}`}>{error}</div> : null}
      <button
        type="button"
        className={styles.primaryButton}
        disabled={busy || reg.replace(/\s/g, "").length < 4}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await driverJobs.setVehicleReg(session, reg);
            onToast("Registration saved");
            onSaved();
          } catch (e) {
            setError(message(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        Save registration
      </button>
    </section>
  );
}

function OfferCard({ offer, session, hasReg, onDone, onToast }: { offer: DriverOffer; session: string; hasReg: boolean; onDone: () => void; onToast: (t: string) => void }) {
  const [bid, setBid] = useState(offer.myBidPence ? (offer.myBidPence / 100).toFixed(2) : "");
  const [note, setNote] = useState(offer.myBidNote);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bidPence = poundsToPence(bid);
  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      onToast(done);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
      setConfirming(false);
      onDone();
    }
  };
  return (
    <section className={`${styles.card} ${styles.cardPad}`} style={{ display: "grid", gap: 10, border: "2px solid #12B76A" }} data-offer={offer.id}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span className={`${styles.chip} ${styles.green}`}>{offer.mode === "direct" ? "Job for you" : offer.mode === "bids" ? "Send your price" : "Job offer"}</span>
        <span style={{ fontSize: 13, color: "#5B6B80" }}>Closes {closes(offer.expiresAt)}</span>
      </div>
      <p style={strong}>{trip(offer.tripDate, offer.tripTime)}</p>
      <p style={body}>
        {offer.pickupArea} → {offer.dropoffArea}
      </p>
      <p style={{ ...body, fontSize: 13, color: "#5B6B80" }}>
        {offer.passengers} passenger{offer.passengers === 1 ? "" : "s"} · {offer.suitcases} case{offer.suitcases === 1 ? "" : "s"}
        {offer.vehicle ? ` · ${offer.vehicle}` : ""}
        {offer.hasFlight ? " · flight to meet" : ""}
      </p>
      {offer.note ? <p style={body}>Note from the office: {offer.note}</p> : null}
      {offer.mode !== "bids" ? (
        <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#067647" }} data-offer-fee>
          Your fee {offer.feeLabel}
        </p>
      ) : offer.myState === "bid" ? (
        <p style={{ ...body, fontWeight: 800, color: "#067647" }}>Your price {offer.myBidLabel} is with the office. They choose the driver.</p>
      ) : null}
      <p style={{ ...body, fontSize: 13 }}>The full address and customer contact appear once the job is yours.</p>
      {error ? <div className={`${styles.notice} ${styles.red}`}>{error}</div> : null}
      {!hasReg ? <div className={`${styles.notice} ${styles.amber}`}>Add your vehicle registration above to answer this.</div> : null}

      {offer.mode === "bids" ? (
        <>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#071C38" }}>Your price for this job (£)</span>
            <input style={inputStyle} inputMode="decimal" value={bid} onChange={(e) => setBid(e.target.value)} placeholder="e.g. 90" aria-label="Your price in pounds" />
          </label>
          <input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Note to the office (optional)" aria-label="Note to the office" />
          <button
            type="button"
            className={styles.emeraldButton}
            style={bigButton}
            disabled={busy || !hasReg || bidPence == null}
            onClick={() => run(() => driverJobs.respond(session, offer.id, "bid", bidPence ?? undefined, note.trim()), "Price sent to the office")}
          >
            {offer.myState === "bid" ? "Update my price" : "Send my price"}
          </button>
          <p style={{ ...body, fontSize: 13 }}>Your price is private. If the office chooses you, the job is yours at this price.</p>
        </>
      ) : confirming ? (
        <>
          <p style={{ ...body, fontWeight: 700 }}>
            Take this job for {offer.feeLabel}? The customer will be sent your first name, mobile and part of your registration.
          </p>
          <button type="button" className={styles.emeraldButton} style={bigButton} disabled={busy} onClick={() => run(() => driverJobs.respond(session, offer.id, "accept"), "The job is yours")}>
            {busy ? "Confirming…" : "Yes, I'll do it"}
          </button>
          <button type="button" className={styles.secondaryButton} onClick={() => setConfirming(false)}>
            Back
          </button>
        </>
      ) : (
        <button type="button" className={styles.emeraldButton} style={bigButton} disabled={busy || !hasReg} onClick={() => setConfirming(true)}>
          Accept job
        </button>
      )}
      <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => run(() => driverJobs.respond(session, offer.id, "decline"), "Offer declined")}>
        {offer.mode === "bids" ? "Not for me" : "Decline"}
      </button>
    </section>
  );
}

function JobCard({ job, session, onDone, onToast }: { job: DriverJob; session: string; onDone: () => void; onToast: (t: string) => void }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [confirmDone, setConfirmDone] = useState(false);

  const advance = async () => {
    setBusy("status");
    setError("");
    try {
      // Arrived and Complete record where the phone is, if it will say. The status updates either way.
      const location = job.nextStatus === "on_the_way" ? null : await readLocation();
      await driverJobs.setStatus(session, job.id, job.nextStatus, location);
      onToast(job.nextStatus === "completed" ? "Job complete" : NEXT_STATUS_LABEL[job.nextStatus]);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy("");
      setConfirmDone(false);
      onDone();
    }
  };
  const answer = async (action: "accept" | "cant_do") => {
    setBusy(action);
    setError("");
    try {
      await driverJobs.answerChange(session, job.change!.id, action);
      onToast(action === "accept" ? "Change accepted" : "The office has been told");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy("");
      onDone();
    }
  };
  const tone = job.status === "confirmed" ? styles.blue : job.status === "on_the_way" ? styles.amber : styles.green;

  return (
    <section className={`${styles.card} ${styles.cardPad}`} style={{ display: "grid", gap: 10, border: job.change ? "2px solid #F79009" : undefined }} data-job={job.id}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <p style={strong}>{trip(job.tripDate, job.tripTime)}</p>
        <span className={`${styles.chip} ${tone}`}>{JOB_STATUS_LABEL[job.status]}</span>
      </div>

      {job.change ? (
        <div className={`${styles.notice} ${styles.amber}`} style={{ display: "grid", gap: 10 }} data-job-change>
          <span>
            <b>This job has changed.</b> Was {trip(job.change.from.tripDate, job.change.from.tripTime)} — now <b>{trip(job.change.to.tripDate, job.change.to.tripTime)}</b>.
            {job.change.to.pickup !== job.change.from.pickup ? ` New pickup: ${job.change.to.pickup}.` : ""}
            {job.change.to.dropoff !== job.change.from.dropoff ? ` New drop-off: ${job.change.to.dropoff}.` : ""}
          </span>
          <button type="button" className={styles.emeraldButton} style={bigButton} disabled={Boolean(busy)} onClick={() => answer("accept")}>
            Accept Change
          </button>
          <button type="button" className={styles.dangerButton} style={{ minHeight: 52 }} disabled={Boolean(busy)} onClick={() => answer("cant_do")}>
            Can&apos;t Do New Time
          </button>
          <span style={{ fontSize: 13 }}>If you can&apos;t do it, the office is told straight away and will sort it with you.</span>
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 8 }}>
        <Place label="Pickup" value={job.pickup} />
        <Place label="Drop-off" value={job.dropoff} />
      </div>
      <p style={{ ...body, fontSize: 13, color: "#5B6B80" }}>
        {job.customerFirstName || "Customer"}
        {job.passengers != null ? ` · ${job.passengers} passenger${job.passengers === 1 ? "" : "s"}` : ""}
        {job.suitcases != null ? ` · ${job.suitcases} case${job.suitcases === 1 ? "" : "s"}` : ""}
        {job.flightNumber ? ` · flight ${job.flightNumber}` : ""}
      </p>
      {job.notes ? <p style={body}>Customer note: {job.notes}</p> : null}
      <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#067647" }} data-job-fee>
        Your fee {job.feeLabel}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: job.customerMobile ? "1fr 1fr" : "1fr", gap: 8 }}>
        <a className={styles.secondaryButton} style={{ display: "grid", placeItems: "center", textDecoration: "none" }} href={mapsLink(job.status === "arrived" ? job.dropoff : job.pickup)} target="_blank" rel="noreferrer">
          Navigate
        </a>
        {job.customerMobile ? (
          <a className={styles.secondaryButton} style={{ display: "grid", placeItems: "center", textDecoration: "none" }} href={`tel:${job.customerMobile}`}>
            Call customer
          </a>
        ) : null}
      </div>

      {job.onTheWayAt ? (
        <p style={{ ...body, fontSize: 13 }}>
          Set off {clock(job.onTheWayAt)}
          {job.arrivedAt ? ` · arrived ${clock(job.arrivedAt)}` : ""}
        </p>
      ) : null}
      {error ? <div className={`${styles.notice} ${styles.red}`}>{error}</div> : null}

      {job.nextStatus === "completed" && !confirmDone ? (
        <button type="button" className={styles.primaryButton} style={bigButton} disabled={Boolean(busy)} onClick={() => setConfirmDone(true)}>
          Complete job
        </button>
      ) : job.nextStatus === "completed" ? (
        <>
          <p style={{ ...body, fontWeight: 700 }}>Passenger dropped off and the job is finished?</p>
          <button type="button" className={styles.emeraldButton} style={bigButton} disabled={Boolean(busy)} onClick={advance}>
            {busy === "status" ? "Saving…" : "Yes, job complete"}
          </button>
          <button type="button" className={styles.secondaryButton} onClick={() => setConfirmDone(false)}>
            Not yet
          </button>
        </>
      ) : (
        <button type="button" className={job.nextStatus === "on_the_way" ? styles.primaryButton : styles.emeraldButton} style={bigButton} disabled={Boolean(busy)} onClick={advance} data-next-status={job.nextStatus}>
          {busy === "status" ? "Saving…" : NEXT_STATUS_LABEL[job.nextStatus]}
        </button>
      )}
      {job.nextStatus !== "on_the_way" ? <p style={{ ...body, fontSize: 13 }}>Your phone&apos;s location is saved privately with Arrived and Complete, as a record of the job.</p> : null}
    </section>
  );
}

function Place({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "grid", gap: 2 }}>
      <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", color: "#5B6B80" }}>{label}</span>
      <span style={{ fontSize: 16, fontWeight: 700, color: "#071C38" }}>{value}</span>
    </div>
  );
}
