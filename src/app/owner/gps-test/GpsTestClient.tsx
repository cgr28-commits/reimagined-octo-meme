"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

const Map = dynamic(() => import("@/components/LiveTrackMap"), { ssr: false });
const DEFAULT_BASE = "https://reimagined-octo-meme.cgr28.workers.dev";
function endpoint() {
  const configured = process.env.NEXT_PUBLIC_BOOKINGS_API_URL?.trim();
  if (!configured) return `${DEFAULT_BASE}/owner/private-gps-test`;
  try {
    const url = new URL(configured);
    if (["myairporttaxini.co.uk", "www.myairporttaxini.co.uk"].includes(url.hostname)) return `${DEFAULT_BASE}/owner/private-gps-test`;
    return `${configured.replace(/\/bookings\/?$/i, "")}/owner/private-gps-test`;
  } catch { return `${DEFAULT_BASE}/owner/private-gps-test`; }
}
type Pin = { lat: number; lng: number; updatedAt: string };

export default function GpsTestClient() {
  const [token, setToken] = useState("");
  const [viewer, setViewer] = useState(false);
  const [pin, setPin] = useState<Pin | null>(null);
  const [count, setCount] = useState(0);
  const [message, setMessage] = useState("Start a separate one-hour test. No customer booking, email or payment is created.");
  const [busy, setBusy] = useState(false);
  const watch = useRef<number | null>(null);
  const active = useRef("");
  const uploading = useRef(false);

  useEffect(() => {
    const linkToken = new URLSearchParams(window.location.search).get("view");
    if (linkToken) { setViewer(true); setToken(linkToken); }
    return () => { if (watch.current !== null) navigator.geolocation.clearWatch(watch.current); };
  }, []);

  async function post(body: Record<string, unknown>) {
    const key = window.sessionStorage.getItem("matni-owner-key")?.trim();
    if (!key) throw new Error("Open the owner dashboard and sign in in this browser tab, then return here.");
    const response = await fetch(endpoint(), { method: "POST", headers: { "Content-Type": "application/json", "X-Owner-Key": key }, body: JSON.stringify(body), cache: "no-store" });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) throw new Error(result?.error ?? "Private test unavailable. Both website and tracking server must have the test update deployed.");
    return result;
  }

  useEffect(() => {
    if (!token) return;
    let disposed = false;
    async function poll() {
      try {
        const response = await fetch(`${endpoint()}?token=${encodeURIComponent(token)}`, { cache: "no-store" });
        const result = await response.json();
        if (disposed) return;
        if (!response.ok) {
          setPin(null);
          if (response.status === 410) {
            active.current = "";
            if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
            setToken("");
          }
          throw new Error(result.error ?? "Test status unavailable");
        }
        setPin(result.driver);
        setCount(result.pointCount);
      } catch (error) {
        if (!disposed) { setPin(null); setMessage(error instanceof Error ? error.message : "Test status unavailable"); }
      }
    }
    void poll();
    const timer = window.setInterval(() => void poll(), 5000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [token]);

  async function start() {
    setBusy(true);
    try {
      if (!navigator.geolocation) throw new Error("This browser does not support GPS location.");
      const result = await post({ action: "create" });
      active.current = result.token;
      setToken(result.token);
      setMessage("Allow precise location. Keep this page open while walking a short distance.");
      watch.current = navigator.geolocation.watchPosition(async position => {
        if (active.current !== result.token || uploading.current) return;
        uploading.current = true;
        try {
          const saved = await post({ action: "location", token: result.token, lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy });
          if (active.current !== result.token) return;
          if (saved.stored) setMessage("GPS received by server. Check the map and recorded point count as you move.");
        } catch (error) {
          if (active.current === result.token) setMessage(error instanceof Error ? error.message : "GPS upload failed");
        } finally { uploading.current = false; }
      }, error => setMessage(`GPS unavailable: ${error.message}. Check location permission, then stop and restart the test.`), { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not start test"); }
    finally { setBusy(false); }
  }

  async function stop() {
    setBusy(true);
    active.current = "";
    if (watch.current !== null) { navigator.geolocation.clearWatch(watch.current); watch.current = null; }
    setPin(null);
    try {
      await post({ action: "stop", token });
      setToken(""); setCount(0); setMessage("Test stopped. Test link revoked and test location data deleted.");
    } catch (error) { setMessage(`Phone GPS stopped. Server cleanup needs retry: ${error instanceof Error ? error.message : "unknown error"}`); }
    finally { setBusy(false); }
  }

  return <main className="min-h-screen bg-navy px-4 py-10 text-white">
    <div className="mx-auto max-w-xl space-y-5">
      <a className="text-emerald underline" href="/owner/">Owner dashboard</a>
      <h1 className="text-2xl font-bold">Private GPS test</h1>
      <p className="text-white/75">{message}</p>
      <p className="text-sm text-white/60">Test while parked or walking. This checks browser GPS; switching apps or locking your phone must be tested separately.</p>
      {!viewer && <button disabled={busy} onClick={() => void (token ? stop() : start())} className="min-h-12 rounded-xl bg-emerald px-6 py-3 font-bold text-navy disabled:opacity-50">{busy ? "Please wait…" : token ? "Stop test and delete location" : "Start private GPS test"}</button>}
      {token && <>
        <p>Server-recorded points: {count}</p>
        {pin ? <><p className="text-sm">Last server position: {new Date(pin.updatedAt).toLocaleTimeString()}</p><Map markers={[{ lat: pin.lat, lng: pin.lng, label: "Test driver" }]} /></> : <p>No fresh server position. Waiting for GPS or the last position is over 90 seconds old.</p>}
        {!viewer && <div><p className="mb-2 text-sm">Open this private viewer link on a second device. Anyone with this link can see your test position until stopped or expired.</p><a className="break-all text-emerald underline" href={`?view=${token}`} target="_blank" rel="noreferrer">{typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}?view=${token}` : "Open test viewer"}</a></div>}
      </>}
    </div>
  </main>;
}
