"use client";

/**
 * Driver portal — individual accounts (Stage 1) and jobs (Stage 2, see DriverJobs).
 * Sign in with a single-use link from the office, apply, set availability,
 * answer offers, run jobs and contact the office. Earnings arrive in a later stage.
 */
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import styles from "@/components/owner-mobile/OwnerMobile.module.css";
import {
  MESSAGE_OPTIONS,
  DriverAccountsError,
  driverAccount,
  readDriverSession,
  storeDriverSession,
  type DriverMe,
} from "@/lib/driver-accounts-api";
import DriverJobs from "./DriverJobs";

type Phase =
  | { kind: "loading" }
  | { kind: "signed-out"; message?: string }
  | { kind: "apply"; token: string }
  | { kind: "ready"; me: DriverMe };

const inputStyle: CSSProperties = {
  width: "100%",
  minHeight: 48,
  border: "1px solid #dce3ec",
  borderRadius: 12,
  padding: "0 14px",
  fontSize: 16,
  color: "#071C38",
  background: "#fff",
};

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 800, color: "#071C38" }}>{label}</span>
      {children}
      {hint ? <span style={{ fontSize: 13, color: "#5B6B80" }}>{hint}</span> : null}
    </label>
  );
}

function readFragment(): { invite?: string; signin?: string } {
  const hash = typeof window === "undefined" ? "" : window.location.hash.replace(/^#/, "");
  const params = new URLSearchParams(hash);
  return { invite: params.get("invite") || undefined, signin: params.get("signin") || undefined };
}

function clearFragment() {
  // Remove the single-use token from the address bar and history.
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
}

export default function DriverPortalClient() {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [session, setSession] = useState("");
  const [toast, setToast] = useState("");

  const loadMe = useCallback(async (token: string) => {
    try {
      const me = await driverAccount.me(token);
      setPhase({ kind: "ready", me });
    } catch (e) {
      if (e instanceof DriverAccountsError && (e.status === 401 || e.status === 403)) {
        storeDriverSession("");
        setSession("");
        setPhase({ kind: "signed-out", message: e.status === 403 ? e.message : undefined });
      } else {
        setPhase({ kind: "signed-out", message: e instanceof Error ? e.message : "Could not load your account." });
      }
    }
  }, []);

  useEffect(() => {
    const boot = (fromHashChange: boolean) => {
      const { invite, signin } = readFragment();
      if (invite) {
        clearFragment();
        setPhase({ kind: "apply", token: invite });
        return;
      }
      if (signin) {
        clearFragment();
        setPhase({ kind: "loading" });
        driverAccount
          .signIn(signin)
          .then(({ sessionToken }) => {
            storeDriverSession(sessionToken);
            setSession(sessionToken);
            return loadMe(sessionToken);
          })
          .catch((e) => setPhase({ kind: "signed-out", message: e instanceof Error ? e.message : "This link did not work." }));
        return;
      }
      if (fromHashChange) return;
      const stored = readDriverSession();
      if (stored) {
        setSession(stored);
        void loadMe(stored);
      } else {
        setPhase({ kind: "signed-out" });
      }
    };
    boot(false);
    // A link opened while the portal is already showing only changes the #fragment.
    const onHash = () => boot(true);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [loadMe]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  return (
    <div className={styles.app} data-driver-portal>
      <div className={styles.inner}>
        <div data-owner-mobile-header className={styles.heroHeader}>
          <div className={styles.heroTop}>
            <span style={{ fontWeight: 800, letterSpacing: 0.2 }}>My Airport Taxi NI · Drivers</span>
          </div>
          <h1 className={styles.heroTitle}>
            {phase.kind === "ready" ? `Hi ${phase.me.driver.name.split(" ")[0]}` : phase.kind === "apply" ? "Join as a partner driver" : "Driver portal"}
          </h1>
        </div>
        <main className={styles.main} style={{ gap: 14 }}>
          {phase.kind === "loading" ? <p className={styles.empty}>Loading…</p> : null}
          {phase.kind === "signed-out" ? <SignedOut message={phase.message} /> : null}
          {phase.kind === "apply" ? (
            <ApplyForm
              token={phase.token}
              onApplied={(token) => {
                storeDriverSession(token);
                setSession(token);
                setToast("Application sent");
                void loadMe(token);
              }}
            />
          ) : null}
          {phase.kind === "ready" ? (
            <Home
              me={phase.me}
              session={session}
              onChanged={() => loadMe(session)}
              onToast={setToast}
              onSignedOut={() => {
                storeDriverSession("");
                setSession("");
                setPhase({ kind: "signed-out", message: "You are signed out." });
              }}
            />
          ) : null}
        </main>
      </div>
      {toast ? (
        <div
          role="status"
          style={{ position: "fixed", left: "50%", bottom: "calc(24px + env(safe-area-inset-bottom))", transform: "translateX(-50%)", background: "#071C38", color: "#fff", padding: "10px 16px", borderRadius: 999, fontSize: 14, fontWeight: 700, zIndex: 80 }}
        >
          {toast}
        </div>
      ) : null}
    </div>
  );
}

function SignedOut({ message }: { message?: string }) {
  return (
    <section className={`${styles.card} ${styles.cardPad}`} style={{ display: "grid", gap: 10 }}>
      {message ? <div className={`${styles.notice} ${styles.amber}`}>{message}</div> : null}
      <h2 className={styles.sectionTitle}>Sign in with your link</h2>
      <p style={{ margin: 0, fontSize: 15, color: "#33445C", lineHeight: 1.5 }}>
        Each driver has their own account. Ask the office for a sign-in link — it works once and expires after 30 minutes. Open it on this
        phone to stay signed in.
      </p>
    </section>
  );
}

function ApplyForm({ token, onApplied }: { token: string; onApplied: (session: string) => void }) {
  const [mobile, setMobile] = useState("");
  const [vehicleMake, setVehicleMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleColour, setVehicleColour] = useState("");
  const [vehicleReg, setVehicleReg] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <form
      className={`${styles.card} ${styles.cardPad}`}
      style={{ display: "grid", gap: 14 }}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          const res = await driverAccount.acceptInvite({ token, mobile, vehicleMake, vehicleModel, vehicleColour, vehicleReg });
          onApplied(res.sessionToken);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not send your application.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <p style={{ margin: 0, fontSize: 15, color: "#33445C", lineHeight: 1.5 }}>
        Add your contact details and vehicle registration. Make, model and colour are optional; we need the registration before you can accept a job.
      </p>
      <Field label="Mobile">
        <input style={inputStyle} type="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} autoComplete="tel" required />
      </Field>
      <Field label="Vehicle make">
        <input style={inputStyle} value={vehicleMake} onChange={(e) => setVehicleMake(e.target.value)} />
      </Field>
      <Field label="Vehicle model">
        <input style={inputStyle} value={vehicleModel} onChange={(e) => setVehicleModel(e.target.value)} />
      </Field>
      <Field label="Vehicle colour">
        <input style={inputStyle} value={vehicleColour} onChange={(e) => setVehicleColour(e.target.value)} />
      </Field>
      <Field label="Vehicle registration">
        <input style={inputStyle} value={vehicleReg} onChange={(e) => setVehicleReg(e.target.value.toUpperCase())} autoCapitalize="characters" required />
      </Field>
      {error ? <div className={`${styles.notice} ${styles.red}`}>{error}</div> : null}
      <button type="submit" className={styles.emeraldButton} disabled={busy || !mobile.trim() || !vehicleReg.trim()}>
        {busy ? "Sending…" : "Send application"}
      </button>
    </form>
  );
}

function Home({
  me,
  session,
  onChanged,
  onToast,
  onSignedOut,
}: {
  me: DriverMe;
  session: string;
  onChanged: () => Promise<void> | void;
  onToast: (t: string) => void;
  onSignedOut: () => void;
}) {
  const d = me.driver;
  const approved = d.status === "approved";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"jobs" | "account">("jobs");
  const showAccount = !approved || tab === "account";

  async function toggleAvailable() {
    setBusy(true);
    setError("");
    try {
      await driverAccount.setAvailable(session, !d.available);
      onToast(!d.available ? "You're available" : "You're unavailable");
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {approved ? (
        <div className={styles.segmented} role="tablist" aria-label="Jobs or account">
          {(["jobs", "account"] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} className={`${styles.segment} ${tab === t ? styles.segmentActive : ""}`} onClick={() => setTab(t)} data-portal-tab={t}>
              {t === "jobs" ? "Jobs" : "Account"}
            </button>
          ))}
        </div>
      ) : null}
      {error ? <div className={`${styles.notice} ${styles.red}`}>{error}</div> : null}
      {!approved ? (
        <div className={`${styles.notice} ${styles.amber}`}>
          Your details are with the office. You&apos;ll be able to go available once your account is approved.
        </div>
      ) : (
        <section className={`${styles.card} ${styles.cardPad}`} style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div>
              <h2 className={styles.sectionTitle}>{d.available ? "You're available" : "You're unavailable"}</h2>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "#5B6B80" }}>
                {d.available ? "The office can see you're free for work." : "The office won't plan work for you."}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={d.available}
              aria-label="Available for work"
              disabled={busy}
              onClick={toggleAvailable}
              style={{ width: 72, height: 44, borderRadius: 999, border: 0, background: d.available ? "#2FBF4A" : "#C9D2DE", position: "relative", flexShrink: 0, cursor: "pointer" }}
            >
              <span style={{ position: "absolute", top: 4, left: d.available ? 32 : 4, width: 36, height: 36, borderRadius: 999, background: "#fff", boxShadow: "0 1px 3px rgba(7,28,56,0.25)", transition: "left 150ms" }} />
            </button>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "#5B6B80" }}>This only affects new offers. Jobs you already have stay yours.</p>
        </section>
      )}

      {approved && tab === "jobs" ? (
        <>
          <DriverJobs session={session} onToast={onToast} />
          <ContactOffice me={me} session={session} onToast={onToast} />
        </>
      ) : null}

      {showAccount ? (
      <>
      <section className={`${styles.card} ${styles.cardPad}`} style={{ display: "grid", gap: 8 }}>
        <h2 className={styles.sectionTitle}>Profile</h2>
        <Row label="Vehicle" value={d.vehicleSummary || "—"} />
        {approved ? <Row label="Registration" value={d.vehicleReg || "Not added yet"} /> : null}
        <Row label="Mobile" value={d.mobile || "—"} />
        <Row label="Email" value={d.email} />
        <p style={{ margin: 0, fontSize: 13, color: "#5B6B80" }}>To change these, contact the office.</p>
      </section>

      <button
        type="button"
        className={styles.dangerButton}
        onClick={async () => {
          await driverAccount.signOut(session).catch(() => undefined);
          onSignedOut();
        }}
      >
        Sign out of this phone
      </button>
      </>
      ) : null}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14 }}>
      <span style={{ color: "#5B6B80" }}>{label}</span>
      <span style={{ color: "#071C38", fontWeight: 700, textAlign: "right", wordBreak: "break-word" }}>{value}</span>
    </div>
  );
}

function ContactOffice({ me, session, onToast }: { me: DriverMe; session: string; onToast: (t: string) => void }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("general");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const contact = me.contactOffice;
  const option = MESSAGE_OPTIONS.find((o) => o.category === category) ?? MESSAGE_OPTIONS[0];

  return (
    <section className={`${styles.card} ${styles.cardPad}`} style={{ display: "grid", gap: 12 }}>
      <h2 className={styles.sectionTitle}>Contact office</h2>
      {contact.mode === "phone" ? (
        <a className={styles.primaryButton} href={`tel:${contact.phone}`} style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>
          Call the office
        </a>
      ) : null}
      {open ? (
        <>
          <div role="radiogroup" aria-label="What is it about?" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {MESSAGE_OPTIONS.map((o) => {
              const active = o.category === category;
              return (
                <button
                  key={o.category}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setCategory(o.category)}
                  style={{
                    minHeight: 44,
                    padding: "0 14px",
                    borderRadius: 999,
                    fontSize: 14,
                    fontWeight: 800,
                    cursor: "pointer",
                    border: active ? `2px solid ${o.urgent ? "#D92D20" : "#071C38"}` : "1px solid #dce3ec",
                    background: active ? (o.urgent ? "#FEF3F2" : "#071C38") : "#fff",
                    color: active ? (o.urgent ? "#B42318" : "#fff") : o.urgent ? "#B42318" : "#071C38",
                  }}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
          {option.urgent ? (
            <div className={`${styles.notice} ${styles.red}`}>
              If anyone is hurt or in danger, call 999 first. This report goes to the top of the office dashboard.
            </div>
          ) : null}
          <textarea
            className={styles.composer}
            style={{ minHeight: 110 }}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={option.urgent ? "Where are you, which booking, and is the passenger with you?" : "Write to the office…"}
            maxLength={1000}
          />
          {error ? <div className={`${styles.notice} ${styles.red}`}>{error}</div> : null}
          <button
            type="button"
            className={option.urgent ? styles.dangerButton : styles.primaryButton}
            style={option.urgent ? { background: "#D92D20", color: "#fff", border: 0, minHeight: 52, fontSize: 16, borderRadius: 14 } : undefined}
            disabled={busy || !message.trim()}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const res = await driverAccount.messageOffice(session, message, category);
                setMessage("");
                setOpen(false);
                setCategory("general");
                onToast(res.priority === "urgent" ? "Urgent report sent to the office" : "Message sent to the office");
              } catch (e) {
                setError(e instanceof Error ? e.message : "Could not send.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Sending…" : option.urgent ? "Send urgent report" : "Send message"}
          </button>
          <button type="button" className={styles.secondaryButton} onClick={() => setOpen(false)}>
            Cancel
          </button>
        </>
      ) : (
        <button type="button" className={contact.mode === "phone" ? styles.secondaryButton : styles.primaryButton} onClick={() => setOpen(true)}>
          Message or report a problem
        </button>
      )}
      <p style={{ margin: 0, fontSize: 13, color: "#5B6B80" }}>For an emergency on the road, call 999 first.</p>
    </section>
  );
}
