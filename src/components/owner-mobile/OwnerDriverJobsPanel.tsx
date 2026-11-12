"use client";

/**
 * Stage 2 — Jobs (Owner Dashboard, More → Drivers → Jobs).
 * Offer a paid booking to drivers (fixed price, bids or one driver), choose the winning bid,
 * follow live jobs, release a driver, and acknowledge alerts that repeat until seen.
 * Nothing here pays a driver or changes a customer booking.
 */
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import styles from "./OwnerMobile.module.css";
import { BackIcon } from "./OwnerMobileIcons";
import { DriverAccountsError, ukDate } from "@/lib/driver-accounts-api";
import {
  JOB_STATUS_LABEL,
  OFFER_MODE_LABEL,
  ownerJobs,
  poundsToPence,
  type DispatchBoard,
  type Escalation,
  type LocationRecord,
  type NeedsDriver,
  type OfferMode,
  type OwnerJob,
  type OwnerOffer,
} from "@/lib/driver-jobs-api";

type Props = {
  ownerKey: string;
  onToast: (text: string) => void;
  onOpenDriver: (driverId: string) => void;
  onOpenBooking?: (reference: string, leg: "outbound" | "return", driverId: string) => void;
};

const body: CSSProperties = { margin: 0, fontSize: 14, color: "#33445C", lineHeight: 1.45 };
const strong: CSSProperties = { margin: 0, fontSize: 16, fontWeight: 800, color: "#071C38" };
const inputStyle: CSSProperties = { width: "100%", minHeight: 48, border: "1px solid #dce3ec", borderRadius: 12, padding: "0 14px", fontSize: 16, color: "#071C38", background: "#fff" };

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
}
function trip(date: string, time: string): string {
  return `${ukDate(date)}${time ? ` · ${time}` : ""}`;
}
function message(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong.";
}

export default function OwnerDriverJobsPanel({ ownerKey, onToast, onOpenDriver, onOpenBooking }: Props) {
  const [board, setBoard] = useState<DispatchBoard | null>(null);
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const [offering, setOffering] = useState<NeedsDriver | null>(null);

  const load = useCallback(async () => {
    try {
      setBoard(await ownerJobs.board(ownerKey));
      setError("");
    } catch (e) {
      if (e instanceof DriverAccountsError && e.status === 404) setUnavailable(true);
      else setError(message(e));
    }
  }, [ownerKey]);

  useEffect(() => {
    void load();
    // Keep bids, statuses and alerts fresh while the screen is open.
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const openOffer = (target: NeedsDriver | null) => setOffering(target);

  if (offering && board) {
    // Full-screen sheet over the Drivers screen, so this panel keeps its place underneath.
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "#F5F7FA", overflowY: "auto" }} data-offer-form>
        <div className={styles.inner}>
          <OfferForm
            ownerKey={ownerKey}
            target={offering}
            board={board}
            onToast={onToast}
            onClose={(sent) => {
              openOffer(null);
              if (sent) void load();
            }}
          />
        </div>
      </div>
    );
  }
  if (unavailable) {
    return <div className={`${styles.notice} ${styles.grey}`}>Driver jobs are being built and tested on staging only. They are not switched on for the live dashboard yet.</div>;
  }
  if (!board) return error ? <div className={`${styles.notice} ${styles.red}`}>{error}</div> : <p className={styles.empty}>Loading jobs…</p>;

  return (
    <>
      {error ? <div className={`${styles.notice} ${styles.red}`}>{error}</div> : null}
      {board.escalations.map((e) => (
        <EscalationCard key={e.id} alert={e} ownerKey={ownerKey} onDone={load} onToast={onToast} onOpenDriver={onOpenDriver} />
      ))}

      <Group title="Needs a driver" count={board.needsDriver.length}>
        {board.bookingLookupFailed ? <div className={`${styles.notice} ${styles.red}`}>Couldn&apos;t read the bookings just now. Pull down or reopen this screen to try again.</div> : null}
        {!board.needsDriver.length && !board.bookingLookupFailed ? <p className={styles.empty}>Every upcoming paid journey has a driver or an open offer.</p> : null}
        {board.needsDriver.map((n) => (
          <section key={`${n.reference}:${n.leg}`} className={`${styles.card} ${styles.cardPad}`} style={{ display: "grid", gap: 8 }} data-needs-driver={`${n.reference}:${n.leg}`}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <p style={strong}>{trip(n.tripDate, n.tripTime)}</p>
              {n.leg === "return" ? <span className={`${styles.chip} ${styles.blue}`}>Return</span> : null}
              {n.assignedOutsidePortal ? <span className={`${styles.chip} ${styles.amber}`}>Driver arranged by email</span> : null}
            </div>
            <p style={body}>
              {n.pickup} → {n.dropoff}
            </p>
            <p style={{ ...body, fontSize: 13, color: "#5B6B80" }}>
              {n.reference} · {n.customerFirstName || "Customer"} · {n.passengers} passenger{n.passengers === 1 ? "" : "s"}
              {n.vehicle ? ` · ${n.vehicle}` : ""}
            </p>
            <button type="button" className={styles.emeraldButton} onClick={() => openOffer(n)}>
              Find a driver
            </button>
          </section>
        ))}
      </Group>

      <Group title="Open offers" count={board.offers.length}>
        {!board.offers.length ? <p className={styles.empty}>No offers are open.</p> : null}
        {board.offers.map((o) => (
          <OfferCard key={o.id} offer={o} ownerKey={ownerKey} onDone={load} onToast={onToast} />
        ))}
      </Group>

      <Group title="Jobs with drivers" count={board.jobs.length}>
        {!board.jobs.length ? <p className={styles.empty}>No driver has a job at the moment.</p> : null}
        {board.jobs.map((j) => (
          <JobCard key={j.id} job={j} ownerKey={ownerKey} onDone={load} onToast={onToast} onOpenBooking={onOpenBooking} />
        ))}
      </Group>

      {board.closedOffers.length ? (
        <Group title="Offers that closed without a driver" count={board.closedOffers.length}>
          {board.closedOffers.map((o) => (
            <section key={o.id} className={`${styles.card} ${styles.cardPad}`} style={{ display: "grid", gap: 6 }}>
              <p style={strong}>{trip(o.tripDate, o.tripTime)}</p>
              <p style={body}>
                {o.reference} · {o.status === "expired" ? "Nobody took it in time" : "Declined"}
                {o.recipients.some((r) => r.state === "bid") ? ` · ${o.recipients.filter((r) => r.state === "bid").length} bid(s) not chosen` : ""}
              </p>
            </section>
          ))}
        </Group>
      ) : null}

      {board.recent.length ? (
        <Group title="Finished and closed" count={board.recent.length}>
          {board.recent.map((j) => (
            <section key={j.id} className={`${styles.card} ${styles.cardPad}`} style={{ display: "grid", gap: 6 }} data-recent-job={j.id}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <p style={strong}>{trip(j.tripDate, j.tripTime)}</p>
                <span className={`${styles.chip} ${j.status === "completed" ? styles.green : styles.grey}`}>{JOB_STATUS_LABEL[j.status]}</span>
              </div>
              <p style={body}>
                {j.driverName} · {j.reference} · driver fee {j.feeLabel}
              </p>
              {j.releaseReason ? <p style={body}>Reason: {j.releaseReason}</p> : null}
              <LocationLine label="Arrived" record={j.arrivedLocation} />
              <LocationLine label="Completed" record={j.completedLocation} />
              {j.payment ? <p style={{ ...body, fontWeight: 700 }}>Payment: {j.payment}</p> : null}
            </section>
          ))}
        </Group>
      ) : null}

      <p style={{ margin: "0 4px", fontSize: 13, color: "#5B6B80" }}>
        Drivers see only their own fee, never the customer price. Completing a job never pays anyone — every driver payment will need your approval.
      </p>
    </>
  );
}

function Group({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <h2 className={styles.sectionTitle} style={{ margin: "4px 4px 0" }}>
        {title}
        {count ? ` · ${count}` : ""}
      </h2>
      {children}
    </div>
  );
}

function LocationLine({ label, record }: { label: string; record: LocationRecord | null }) {
  if (!record) return null;
  return (
    <p style={{ ...body, fontSize: 13 }}>
      {label} {when(record.at)} ·{" "}
      {record.verified ? (
        <a href={`https://www.google.com/maps?q=${record.lat},${record.lng}`} target="_blank" rel="noreferrer" style={{ color: "#0B5CAD", fontWeight: 700 }}>
          location recorded{record.accuracyMetres != null ? ` (within ${Math.round(record.accuracyMetres)} m)` : ""}
        </a>
      ) : (
        <span style={{ color: "#B54708", fontWeight: 700 }}>location not verified</span>
      )}
    </p>
  );
}

function EscalationCard({ alert, ownerKey, onDone, onToast, onOpenDriver }: { alert: Escalation; ownerKey: string; onDone: () => void; onToast: (t: string) => void; onOpenDriver: (id: string) => void }) {
  const [closing, setClosing] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const loud = alert.priority === "high" && !alert.acknowledgedAt;
  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      onToast(done);
      onDone();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={`${styles.card} ${styles.cardPad}`} style={{ display: "grid", gap: 10, border: loud ? "2px solid #D92D20" : "1px solid #dce3ec" }} data-escalation={alert.id}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span className={`${styles.chip} ${loud ? styles.red : alert.acknowledgedAt ? styles.amber : styles.blue}`}>{loud ? "Urgent" : alert.acknowledgedAt ? "Seen — still to deal with" : "For you"}</span>
        <span style={{ fontSize: 13, color: "#5B6B80" }}>
          {when(alert.createdAt)}
          {alert.reminders ? ` · ${alert.reminders} reminder${alert.reminders === 1 ? "" : "s"} sent` : ""}
        </span>
      </div>
      <p style={strong}>{alert.title}</p>
      {alert.body ? <p style={body}>{alert.body}</p> : null}
      {error ? <div className={`${styles.notice} ${styles.red}`}>{error}</div> : null}
      {!alert.acknowledgedAt ? (
        <button type="button" className={styles.primaryButton} disabled={busy} onClick={() => run(() => ownerJobs.acknowledge(ownerKey, alert.id), "Seen. Reminders stopped.")}>
          {alert.priority === "high" ? "I've seen this — stop reminders" : "Mark as seen"}
        </button>
      ) : null}
      {alert.sourceType === "message" && alert.driverId ? (
        <button type="button" className={styles.secondaryButton} onClick={() => onOpenDriver(alert.driverId!)}>
          Open the driver&apos;s report
        </button>
      ) : null}
      {alert.sourceType === "offer" || alert.sourceType === "job" ? (
        closing ? (
          <>
            <input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you do?" aria-label="What did you do?" />
            <button type="button" className={styles.secondaryButton} disabled={busy || note.trim().length < 5} onClick={() => run(() => ownerJobs.closeAlert(ownerKey, alert.id, note.trim()), "Alert closed.")}>
              Close alert
            </button>
          </>
        ) : (
          <button type="button" className={styles.secondaryButton} onClick={() => setClosing(true)}>
            I&apos;ve dealt with this
          </button>
        )
      ) : null}
      {alert.sourceType === "change" ? <p style={{ ...body, fontSize: 13 }}>This closes by itself when the driver accepts, or when you release the driver from the job below.</p> : null}
    </section>
  );
}

function OfferCard({ offer, ownerKey, onDone, onToast }: { offer: OwnerOffer; ownerKey: string; onDone: () => void; onToast: (t: string) => void }) {
  const [choosing, setChoosing] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      onToast(done);
      onDone();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
      setChoosing("");
    }
  };
  const stateLabel = (state: string, seen: boolean) => (state === "bid" ? "" : state === "declined" ? "Declined" : seen ? "Seen" : "Not opened yet");
  return (
    <section className={`${styles.card} ${styles.cardPad}`} style={{ display: "grid", gap: 10 }} data-offer={offer.id}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <p style={strong}>{trip(offer.tripDate, offer.tripTime)}</p>
        <span className={`${styles.chip} ${styles.blue}`}>{OFFER_MODE_LABEL[offer.mode]}</span>
        {offer.feeLabel ? <span className={`${styles.chip} ${styles.green}`}>Driver fee {offer.feeLabel}</span> : null}
      </div>
      <p style={body}>
        {offer.reference}
        {offer.leg === "return" ? " (return)" : ""} · {offer.pickup} → {offer.dropoff}
      </p>
      <p style={{ ...body, fontSize: 13, color: "#5B6B80" }}>Closes {when(offer.expiresAt)}</p>
      {offer.mode === "bids" ? <p style={{ ...body, fontWeight: 700 }}>You choose the driver. The lowest bid does not win automatically.</p> : null}
      <div style={{ display: "grid", gap: 8 }}>
        {offer.recipients.map((r) => (
          <div key={r.driverId} style={{ display: "grid", gap: 6, padding: "10px 12px", borderRadius: 12, background: "#F3F6FA" }} data-recipient={r.driverId}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#071C38" }}>{r.driverName}</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: r.state === "bid" ? "#067647" : "#5B6B80" }}>{r.state === "bid" ? r.bidLabel : stateLabel(r.state, Boolean(r.seenAt))}</span>
            </div>
            {r.bidNote ? <span style={{ fontSize: 13, color: "#33445C" }}>“{r.bidNote}”</span> : null}
            {r.state === "bid" && !r.canBeChosen ? <span style={{ fontSize: 13, color: "#B42318", fontWeight: 700 }}>Account is {r.driverStatus} — can&apos;t be chosen</span> : null}
            {r.state === "bid" && r.canBeChosen ? (
              choosing === r.driverId ? (
                <div style={{ display: "grid", gap: 8 }}>
                  <span style={{ fontSize: 13, color: "#33445C" }}>
                    Give this job to {r.driverName} for {r.bidLabel}? The customer is then emailed the driver&apos;s first name, mobile and part of the registration.
                  </span>
                  <button type="button" className={styles.emeraldButton} disabled={busy} onClick={() => run(() => ownerJobs.award(ownerKey, offer.id, r.driverId), `${r.driverName} has the job.`)}>
                    Yes, choose {r.driverName.split(" ")[0]}
                  </button>
                  <button type="button" className={styles.secondaryButton} onClick={() => setChoosing("")}>
                    Not yet
                  </button>
                </div>
              ) : (
                <button type="button" className={styles.primaryButton} onClick={() => setChoosing(r.driverId)}>
                  Choose {r.driverName.split(" ")[0]} · {r.bidLabel}
                </button>
              )
            ) : null}
          </div>
        ))}
      </div>
      {error ? <div className={`${styles.notice} ${styles.red}`}>{error}</div> : null}
      <button type="button" className={styles.dangerButton} disabled={busy} onClick={() => run(() => ownerJobs.withdrawOffer(ownerKey, offer.id), "Offer withdrawn.")}>
        Withdraw offer
      </button>
    </section>
  );
}

function JobCard({ job, ownerKey, onDone, onToast, onOpenBooking }: { job: OwnerJob; ownerKey: string; onDone: () => void; onToast: (t: string) => void; onOpenBooking?: Props["onOpenBooking"] }) {
  const [releasing, setReleasing] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const tone = job.status === "confirmed" ? styles.blue : job.status === "on_the_way" ? styles.amber : styles.green;
  const release = async () => {
    setBusy(true);
    setError("");
    try {
      await ownerJobs.release(ownerKey, job.id, reason.trim());
      onToast("Driver released. The booking is unchanged and needs a driver.");
      onDone();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={`${styles.card} ${styles.cardPad}`} style={{ display: "grid", gap: 10, border: job.change || job.driverStatus !== "approved" ? "2px solid #D92D20" : undefined }} data-job={job.id}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <p style={strong}>{trip(job.tripDate, job.tripTime)}</p>
        <span className={`${styles.chip} ${tone}`}>{JOB_STATUS_LABEL[job.status]}</span>
      </div>
      <p style={body}>
        <b>{job.driverName}</b> · driver fee {job.feeLabel}
      </p>
      <p style={body}>
        {job.reference}
        {job.leg === "return" ? " (return)" : ""} · {job.pickup} → {job.dropoff}
      </p>
      {job.driverStatus !== "approved" ? (
        <div className={`${styles.notice} ${styles.red}`}>This driver&apos;s account is {job.driverStatus}. They still hold this job until you release them.</div>
      ) : null}
      {job.change ? (
        <div className={`${styles.notice} ${job.change.status === "cant_do" ? styles.red : styles.amber}`} data-job-change={job.change.status}>
          <b>{job.change.status === "cant_do" ? "Driver can't do the new time." : "Waiting for the driver to answer a change."}</b>
          <br />
          Was {trip(job.change.from.tripDate, job.change.from.tripTime)} — now {trip(job.change.to.tripDate, job.change.to.tripTime)}.
          {job.change.to.pickup !== job.change.from.pickup ? ` New pickup: ${job.change.to.pickup}.` : ""} The driver is still assigned on the old details.
        </div>
      ) : null}
      <p style={{ ...body, fontSize: 13, color: "#5B6B80" }}>
        {job.customerToldAt ? `Customer emailed driver details ${when(job.customerToldAt)}` : "Customer not yet emailed driver details"}
        {job.onTheWayAt ? ` · set off ${when(job.onTheWayAt)}` : ""}
      </p>
      <LocationLine label="Arrived" record={job.arrivedLocation} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {job.driverMobile ? (
          <a className={styles.secondaryButton} style={{ display: "grid", placeItems: "center", textDecoration: "none" }} href={`tel:${job.driverMobile}`}>
            Call driver
          </a>
        ) : null}
        {onOpenBooking ? (
          <button type="button" className={styles.secondaryButton} onClick={() => onOpenBooking(job.reference, job.leg, job.driverId)}>
            Open booking
          </button>
        ) : null}
      </div>
      {error ? <div className={`${styles.notice} ${styles.red}`}>{error}</div> : null}
      {releasing ? (
        <>
          <input style={inputStyle} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (kept in the audit log)" aria-label="Reason for releasing the driver" />
          <p style={{ ...body, fontSize: 13 }}>The driver is told. The customer is not told automatically, and the booking is not changed. You can then offer the job again.</p>
          <button type="button" className={styles.dangerButton} disabled={busy || reason.trim().length < 5} onClick={release}>
            Release {job.driverName.split(" ")[0]} from this job
          </button>
          <button type="button" className={styles.secondaryButton} onClick={() => setReleasing(false)}>
            Keep driver
          </button>
        </>
      ) : (
        <button type="button" className={styles.dangerButton} onClick={() => setReleasing(true)}>
          Release driver…
        </button>
      )}
    </section>
  );
}

const OPEN_FOR: { minutes: number; label: string }[] = [
  { minutes: 30, label: "30 min" },
  { minutes: 120, label: "2 hours" },
  { minutes: 720, label: "12 hours" },
  { minutes: 1440, label: "24 hours" },
];

function OfferForm({ ownerKey, target, board, onClose, onToast }: { ownerKey: string; target: NeedsDriver; board: DispatchBoard; onClose: (sent: boolean) => void; onToast: (t: string) => void }) {
  const [mode, setMode] = useState<OfferMode>("fixed");
  const [fee, setFee] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [minutes, setMinutes] = useState(120);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const feePence = poundsToPence(fee);
  const usable = (d: DispatchBoard["drivers"][number]) => (mode === "direct" ? d.documentsOk : d.canReceiveOffers);
  const why = (d: DispatchBoard["drivers"][number]) => (!d.documentsOk ? "Documents need attention" : !d.available && mode !== "direct" ? "Switched to unavailable" : !d.hasVehicleReg ? "No registration added yet — must add it before accepting" : d.available ? "Available" : "Unavailable (can still be asked directly)");
  const chosen = picked.filter((id) => board.drivers.some((d) => d.id === id && usable(d)));
  const ready = chosen.length > 0 && (mode === "bids" || feePence != null) && (mode !== "direct" || chosen.length === 1);

  const toggle = (id: string) => setPicked((p) => (mode === "direct" ? [id] : p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const send = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await ownerJobs.createOffer(ownerKey, {
        reference: target.reference, leg: target.leg, mode, feePence: mode === "bids" ? undefined : feePence ?? undefined,
        driverIds: chosen, expiresInMinutes: minutes, note: note.trim(),
      });
      onToast(`Sent to ${res.sentTo.length} driver${res.sentTo.length === 1 ? "" : "s"}.`);
      onClose(true);
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  };

  return (
    <>
      <div data-owner-mobile-header className={styles.pageHeader}>
        <div className={styles.backRow}>
          <button type="button" className={styles.backButton} onClick={() => onClose(false)}>
            <BackIcon size={24} />
            Jobs
          </button>
        </div>
        <div className={styles.pageTitleRow}>
          <h1 className={styles.pageTitle}>Find a driver</h1>
        </div>
        <p className={styles.pageSub}>
          {target.reference}
          {target.leg === "return" ? " (return)" : ""} · {trip(target.tripDate, target.tripTime)}
        </p>
      </div>
      <main className={styles.main} style={{ gap: 14 }}>
        <section className={`${styles.card} ${styles.cardPad}`} style={{ display: "grid", gap: 6 }}>
          <p style={strong}>
            {target.pickup} → {target.dropoff}
          </p>
          <p style={body}>
            {target.passengers} passenger{target.passengers === 1 ? "" : "s"}
            {target.vehicle ? ` · ${target.vehicle}` : ""}
          </p>
          <p style={{ ...body, fontSize: 13 }}>Before a driver has the job they see the area only — no street address, customer name, phone or price paid.</p>
        </section>

        <section className={`${styles.card} ${styles.cardPad}`} style={{ display: "grid", gap: 12 }}>
          <h2 className={styles.sectionTitle}>How to offer it</h2>
          <div className={styles.segmented} role="tablist">
            {(["fixed", "bids", "direct"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                className={`${styles.segment} ${mode === m ? styles.segmentActive : ""}`}
                onClick={() => {
                  setMode(m);
                  if (m === "direct") setPicked((p) => p.slice(0, 1));
                }}
              >
                {m === "fixed" ? "Fixed price" : m === "bids" ? "Bids" : "One driver"}
              </button>
            ))}
          </div>
          <p style={body}>
            {mode === "fixed"
              ? "You set the driver fee. The first driver to accept gets the job."
              : mode === "bids"
                ? "Drivers send you a private price. You choose the driver — the lowest never wins automatically."
                : "Ask one driver directly at your fee. They accept or decline."}
          </p>
          {mode !== "bids" ? (
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: "#071C38" }}>Driver fee (£)</span>
              <input style={inputStyle} inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="e.g. 45" aria-label="Driver fee in pounds" />
              {fee && feePence == null ? <span style={{ fontSize: 13, color: "#B42318", fontWeight: 700 }}>Enter an amount between £1 and £2,000.</span> : null}
            </label>
          ) : null}
        </section>

        <section className={styles.card} style={{ overflow: "hidden" }}>
          <h2 className={styles.sectionTitle} style={{ padding: "14px 16px 4px" }}>
            {mode === "direct" ? "Choose the driver" : "Send to"}
          </h2>
          {!board.drivers.length ? <p className={styles.empty}>No approved drivers yet.</p> : null}
          {board.drivers.map((d) => {
            const ok = usable(d);
            const on = ok && picked.includes(d.id);
            return (
              <button key={d.id} type="button" className={styles.row} disabled={!ok} onClick={() => toggle(d.id)} aria-pressed={on} style={{ opacity: ok ? 1 : 0.55 }} data-pick-driver={d.id}>
                <span
                  aria-hidden
                  style={{ width: 26, height: 26, borderRadius: mode === "direct" ? 13 : 8, border: `2px solid ${on ? "#12B76A" : "#B8C4D4"}`, background: on ? "#12B76A" : "#fff", color: "#fff", display: "grid", placeItems: "center", fontWeight: 900, flex: "0 0 auto" }}
                >
                  {on ? "✓" : ""}
                </span>
                <span className={styles.rowBody}>
                  <span className={styles.rowTitle} style={{ fontWeight: 700 }}>
                    {d.name}
                  </span>
                  <span className={styles.rowDetail} style={{ whiteSpace: "normal" }}>
                    {why(d)}
                  </span>
                </span>
              </button>
            );
          })}
        </section>

        <section className={`${styles.card} ${styles.cardPad}`} style={{ display: "grid", gap: 12 }}>
          <h2 className={styles.sectionTitle}>Keep the offer open for</h2>
          <div className={styles.filterRow}>
            {OPEN_FOR.map((o) => (
              <button key={o.minutes} type="button" className={`${styles.filter} ${minutes === o.minutes ? styles.filterActive : ""}`} onClick={() => setMinutes(o.minutes)}>
                {o.label}
              </button>
            ))}
          </div>
          <p style={{ ...body, fontSize: 13 }}>It never stays open past the pickup time. If nobody takes it, you&apos;re alerted.</p>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#071C38" }}>Note to drivers (optional)</span>
            <input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="e.g. Child seat needed" />
          </label>
        </section>

        {error ? <div className={`${styles.notice} ${styles.red}`}>{error}</div> : null}
        <button type="button" className={styles.emeraldButton} disabled={!ready || busy} onClick={send}>
          {busy ? "Sending…" : mode === "direct" ? "Ask this driver" : `Send to ${chosen.length || "…"} driver${chosen.length === 1 ? "" : "s"}`}
        </button>
        <p style={{ margin: "0 4px", fontSize: 13, color: "#5B6B80" }}>When a driver takes the job, the customer is emailed the driver&apos;s first name, mobile and part of the registration. Nothing is paid.</p>
      </main>
    </>
  );
}
