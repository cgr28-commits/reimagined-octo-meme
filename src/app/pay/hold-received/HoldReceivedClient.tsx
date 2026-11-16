"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SITE } from "@/lib/data";

/** After a customer authorises a short-notice card hold (Stripe return_url). */
export default function HoldReceivedClient() {
  const [reference, setReference] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setReference((params.get("ref") || "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 40));
    // Keep a clean address bar (drops the Stripe session id).
    if (params.get("checkout_id")) {
      window.history.replaceState(null, "", "/pay/hold-received/" + (params.get("ref") ? `?ref=${encodeURIComponent(params.get("ref") || "")}` : ""));
    }
  }, []);

  return (
    <section
      data-hold-received
      className="rounded-3xl border border-white/15 bg-white/[0.04] p-6 text-white sm:p-8"
    >
      <h1 className="text-2xl font-bold">Thank You for Your Booking</h1>
      <p className="mt-3 text-sm leading-relaxed text-white/85">
        Your booking request has been received successfully.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-white/85">
        Your transfer is confirmed once you receive your booking confirmation email.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-white/85">
        Please check your inbox, including your spam or junk folder.
      </p>
      {reference ? (
        <p className="mt-4 text-sm text-white/70">
          Booking reference: <span className="font-semibold text-white">{reference}</span>
        </p>
      ) : null}
      <p className="mt-6 text-sm text-white/70">
        Questions? Call {SITE.officeLandlineDisplay} or WhatsApp @belfasttaxi.
      </p>
      <Link href="/" className="btn-primary mt-6 inline-flex">
        Back to home
      </Link>
    </section>
  );
}
