"use client";

/** More → Notifications: turn phone alerts on for this device and choose what alerts you. */
import { useCallback, useEffect, useState } from "react";
import styles from "./OwnerMobile.module.css";
import { BackIcon } from "./OwnerMobileIcons";
import { resolveWorkerBaseUrl } from "@/lib/worker-api";

type PushStatus = {
  publicKey: string;
  devices: { label: string; createdAt: string; endpointId: string }[];
  prefs: Record<string, boolean>;
  categories: { id: string; label: string }[];
  sent?: number;
};

type Support = "ready" | "needs-install" | "unsupported" | "blocked";

async function api(ownerKey: string, path: string, body?: unknown): Promise<PushStatus> {
  const res = await fetch(`${resolveWorkerBaseUrl()}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Accept: "application/json", "X-Owner-Key": ownerKey.trim(), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as PushStatus & { error?: string };
  if (!res.ok) throw new Error(data.error || "Could not reach the server.");
  return data;
}

function keyBytes(base64url: string): Uint8Array {
  const padded = base64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64url.length / 4) * 4, "=");
  const bin = atob(padded);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function detectSupport(): Support {
  if (typeof window === "undefined") return "unsupported";
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return ios && !standalone ? "needs-install" : "unsupported";
  }
  if (ios && !standalone) return "needs-install";
  if (Notification.permission === "denied") return "blocked";
  return "ready";
}

function deviceLabel(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "iPad";
  if (/Android/.test(ua)) return "Android phone";
  if (/Mac/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows PC";
  return "Device";
}

export default function OwnerNotificationsScreen({ ownerKey, onBack, onToast }: { ownerKey: string; onBack: () => void; onToast: (t: string) => void }) {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [support, setSupport] = useState<Support>("ready");
  const [thisEndpoint, setThisEndpoint] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setSupport(detectSupport());
    try {
      setStatus(await api(ownerKey, "/owner/push"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load.");
    }
    try {
      const reg = await navigator.serviceWorker?.getRegistration("/owner/");
      const sub = await reg?.pushManager.getSubscription();
      setThisEndpoint(sub?.endpoint ?? "");
    } catch {
      setThisEndpoint("");
    }
  }, [ownerKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const onThisDevice = Boolean(thisEndpoint) && Boolean(status?.devices.some((d) => thisEndpoint.endsWith(d.endpointId)));

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const turnOn = () =>
    run(async () => {
      if (!status) throw new Error("Still loading — try again in a moment.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setSupport(permission === "denied" ? "blocked" : "ready");
        throw new Error("Notifications weren't allowed. You can allow them in your phone's Settings.");
      }
      const reg = await navigator.serviceWorker.register("/owner-sw.js", { scope: "/owner/" });
      await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      const sub = existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(status.publicKey) as BufferSource }));
      setStatus(await api(ownerKey, "/owner/push/subscribe", { subscription: sub.toJSON(), label: deviceLabel() }));
      setThisEndpoint(sub.endpoint);
      onToast("Notifications are on for this device");
    });

  const turnOff = () =>
    run(async () => {
      const reg = await navigator.serviceWorker.getRegistration("/owner/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        setStatus(await api(ownerKey, "/owner/push/unsubscribe", { endpoint: sub.endpoint }));
        await sub.unsubscribe();
      }
      setThisEndpoint("");
      onToast("Notifications are off for this device");
    });

  const sendTest = () =>
    run(async () => {
      const res = await api(ownerKey, "/owner/push/test", {});
      setStatus(res);
      onToast(res.sent ? `Test sent to ${res.sent} device${res.sent === 1 ? "" : "s"}` : "No device received the test");
    });

  const setPref = (id: string, value: boolean) =>
    run(async () => {
      setStatus(await api(ownerKey, "/owner/push/prefs", { prefs: { [id]: value } }));
    });

  return (
    <>
      <div data-owner-mobile-header className={styles.pageHeader}>
        <div className={styles.backRow}>
          <button type="button" className={styles.backButton} onClick={onBack}>
            <BackIcon size={24} />
            More
          </button>
        </div>
        <div className={styles.pageTitleRow}>
          <h1 className={styles.pageTitle}>Notifications</h1>
        </div>
      </div>
      <main className={styles.main} style={{ gap: 14 }}>
        {error ? <div className={`${styles.notice} ${styles.red}`}>{error}</div> : null}

        <section className={`${styles.card} ${styles.cardPad}`} style={{ display: "grid", gap: 12 }}>
          <h2 className={styles.sectionTitle}>This device</h2>
          {support === "needs-install" ? (
            <>
              <p style={{ margin: 0, fontSize: 15, color: "#33445C", lineHeight: 1.5 }}>
                On an iPhone, notifications only work once the dashboard is on your Home Screen:
              </p>
              <ol style={{ margin: 0, paddingLeft: 20, fontSize: 15, color: "#071C38", lineHeight: 1.7, fontWeight: 600 }}>
                <li>Open this page in Safari.</li>
                <li>Tap the Share button, then “Add to Home Screen”.</li>
                <li>Open “MATNI Owner” from your Home Screen and sign in.</li>
                <li>Come back to More → Notifications and turn them on.</li>
              </ol>
            </>
          ) : support === "unsupported" ? (
            <p style={{ margin: 0, fontSize: 15, color: "#33445C" }}>This browser can’t show notifications. Try Safari on your iPhone or Chrome on a computer.</p>
          ) : support === "blocked" ? (
            <p style={{ margin: 0, fontSize: 15, color: "#33445C", lineHeight: 1.5 }}>
              Notifications are blocked for the dashboard on this device. Allow them in Settings → Notifications → MATNI Owner, then come back here.
            </p>
          ) : onThisDevice ? (
            <>
              <span className={`${styles.chip} ${styles.green}`} style={{ justifySelf: "start" }}>
                On
              </span>
              <button type="button" className={styles.primaryButton} disabled={busy} onClick={sendTest}>
                Send a test notification
              </button>
              <button type="button" className={styles.secondaryButton} disabled={busy} onClick={turnOff}>
                Turn off on this device
              </button>
            </>
          ) : (
            <>
              <p style={{ margin: 0, fontSize: 15, color: "#33445C", lineHeight: 1.5 }}>
                Get an alert on this device when something needs you, even when the dashboard is closed.
              </p>
              <button type="button" className={styles.emeraldButton} disabled={busy || !status} onClick={turnOn}>
                Turn on notifications
              </button>
            </>
          )}
        </section>

        {status ? (
          <section className={styles.card} style={{ overflow: "hidden" }}>
            <h2 className={styles.sectionTitle} style={{ padding: "14px 16px 6px" }}>
              Alert me about
            </h2>
            {status.categories.map((c) => {
              const on = status.prefs[c.id] !== false;
              return (
                <div key={c.id} className={styles.row} style={{ cursor: "default" }}>
                  <span className={styles.rowBody}>
                    <span className={styles.rowTitle} style={{ fontWeight: 700, whiteSpace: "normal" }}>
                      {c.label}
                    </span>
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={c.label}
                    disabled={busy}
                    onClick={() => setPref(c.id, !on)}
                    style={{ width: 60, height: 36, borderRadius: 999, border: 0, background: on ? "#2FBF4A" : "#C9D2DE", position: "relative", flexShrink: 0, cursor: "pointer" }}
                  >
                    <span style={{ position: "absolute", top: 3, left: on ? 27 : 3, width: 30, height: 30, borderRadius: 999, background: "#fff", boxShadow: "0 1px 3px rgba(7,28,56,0.25)", transition: "left 150ms" }} />
                  </button>
                </div>
              );
            })}
            <p style={{ margin: 0, padding: "10px 16px 14px", fontSize: 13, color: "#5B6B80", lineHeight: 1.45 }}>
              “Quote viewed”, saved quotes and the daily report never alert you. Alerts follow the emails arriving in your dashboard Inbox, so they
              rely on your mailbox forwarding staying switched on.
            </p>
          </section>
        ) : null}

        {status && status.devices.length ? (
          <section className={`${styles.card} ${styles.cardPad}`} style={{ display: "grid", gap: 8 }}>
            <h2 className={styles.sectionTitle}>Devices receiving alerts</h2>
            {status.devices.map((d) => (
              <div key={d.endpointId} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", fontSize: 15 }}>
                <span style={{ fontWeight: 700, color: "#071C38" }}>
                  {d.label}
                  {thisEndpoint.endsWith(d.endpointId) ? " (this device)" : ""}
                </span>
                <button
                  type="button"
                  className={styles.linkButton}
                  style={{ minHeight: 44 }}
                  disabled={busy}
                  onClick={() => run(async () => setStatus(await api(ownerKey, "/owner/push/unsubscribe", { endpointId: d.endpointId })))}
                >
                  Remove
                </button>
              </div>
            ))}
          </section>
        ) : null}
      </main>
    </>
  );
}
