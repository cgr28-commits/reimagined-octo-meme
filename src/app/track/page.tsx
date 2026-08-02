"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import TrackPageClient from "./TrackPageClient";

function readTokenFromLocation(): string {
  if (typeof window === "undefined") {
    return "";
  }

  return new URLSearchParams(window.location.search).get("id")?.trim() ?? "";
}

function TrackPageContent() {
  const searchParams = useSearchParams();
  const [token, setToken] = useState(() => searchParams.get("id")?.trim() ?? "");

  useEffect(() => {
    const fromUrl = searchParams.get("id")?.trim() ?? readTokenFromLocation();
    if (fromUrl) {
      setToken(fromUrl);
    }
  }, [searchParams]);

  if (!token) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-navy px-4 text-center text-white/70">
        Missing tracking link. Please use the link from your booking confirmation.
      </main>
    );
  }

  return <TrackPageClient token={token} />;
}

export default function TrackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-navy text-white/70">
          Loading…
        </div>
      }
    >
      <TrackPageContent />
    </Suspense>
  );
}
