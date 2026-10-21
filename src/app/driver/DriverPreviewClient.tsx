"use client";

import { useEffect, useState } from "react";
import DriverPageClient from "./DriverPageClient";
import { getDemoDriverJobs } from "@/lib/tracking-demo";
import type { DriverJob } from "@/lib/tracking-api";

/** Read-only preview adapter. Never delegates any request to the network. */
export default function DriverPreviewClient() {
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_MY_JOBS_PREVIEW !== "true") return;
    const day = (offset: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(Date.now() + offset * 86400000));
    const base = getDemoDriverJobs().jobs;
    const samples = [base[0], base[1], base[1]].map((job, index) => ({
      ...job,
      token: `preview-job-${index + 1}`,
      bookingReference: `MAT-PREVIEW-${1001 + index}`,
      customerName: ["Alex (sample)", "Sam (sample)", "Jordan (sample)"][index],
      customerMobile: undefined,
      tripDate: day(index === 2 ? 200 : 0),
      tripTime: index === 0 ? "10:30" : "14:30",
      pickupAt: `${day(index === 2 ? 200 : 0)}T${index === 0 ? "10:30" : "14:30"}`,
      pickupDisplay: `${day(index === 2 ? 200 : 0)} · ${index === 0 ? "10:30" : "14:30"}`,
      assignedDriverName: "Colin",
      assignmentStatus: "accepted",
      journeyStatus: "idle",
      journeyStatusLabel: "Not started",
      journeyLeg: index === 2 ? "return" : "outbound",
      sharingActive: false,
      driver: null,
      customer: null,
      trackUrl: "#preview",
      allowedJourneyActions: [],
    })) as DriverJob[];
    const previousFetch = window.fetch;
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.origin);
      const method = init?.method ?? (input instanceof Request ? input.method : "GET");
      const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
      if (method !== "GET") return reply({ error: "This is a read-only preview. No real bookings are changed." }, 403);
      if (url.pathname === "/driver/jobs") return reply({ ok: true, role: "driver", driverName: "Colin", date: "all-assigned", jobs: samples, nextCursor: null });
      if (url.pathname === "/driver/flight") {
        const sample = samples.find(job => job.token === url.searchParams.get("token"));
        return reply({ flight: sample?.flight ? { ...sample.flight, date: sample.tripDate, status: "Delayed", scheduledTime: "14:30", revisedTime: `${sample.tripDate}T15:15:00+01:00`, delayMinutes: 45 } : null, lastCheckedAt: new Date().toISOString(), message: "Sample flight information — not a live airline update." });
      }
      return reply({ error: "Network access is disabled in this preview." }, 403);
    };
    window.localStorage.setItem("matni-driver-portal-session", "dps_preview_only");
    setReady(true);
    return () => { window.fetch = previousFetch; window.localStorage.removeItem("matni-driver-portal-session"); };
  }, []);

  return <div onClickCapture={event => {
    const target = event.target as HTMLElement;
    if (target.closest("a")) { event.preventDefault(); event.stopPropagation(); setNotice("Links to live services are disabled in this sample preview."); }
  }}>
    <aside className="fixed bottom-0 left-0 right-0 z-[9999] border-t border-amber-300 bg-[#071c38] px-4 py-3 text-center text-sm text-white">
      <strong className="text-amber-200">Preview · sample journeys only</strong>
      <p>Read-only. No driver key, live bookings, GPS or messages.</p>
      {notice && <p role="status">{notice}</p>}
    </aside>
    {ready ? <div className="pb-28"><DriverPageClient portal="driver" /></div> : <p className="p-8 text-white">Opening sample jobs…</p>}
  </div>;
}
