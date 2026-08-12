"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import HoldingPage from "./HoldingPage";
import { SITE_OFFLINE, SITE_OFFLINE_ALLOWLIST } from "@/lib/data";

function isAllowlistedPath(pathname: string | null): boolean {
  if (!pathname) {
    return false;
  }
  const normalized = pathname.replace(/\/$/, "") || "/";
  return SITE_OFFLINE_ALLOWLIST.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
  );
}

function isOfflineActive(nowMs = Date.now()): boolean {
  if (!SITE_OFFLINE.enabled) {
    return false;
  }
  const untilMs = Date.parse(SITE_OFFLINE.until);
  if (Number.isNaN(untilMs)) {
    return SITE_OFFLINE.enabled;
  }
  return nowMs < untilMs;
}

export default function SiteOfflineGate({
  children,
}: {
  children: React.ReactNode;
}) {
  // Start offline when configured so the holding page is the first paint (no booking UI flash).
  const [showHolding, setShowHolding] = useState(() => isOfflineActive());
  const pathname = usePathname();

  useEffect(() => {
    const sync = () => setShowHolding(isOfflineActive());
    sync();
    const id = window.setInterval(sync, 30_000);
    return () => window.clearInterval(id);
  }, []);

  if (showHolding && !isAllowlistedPath(pathname)) {
    return <HoldingPage />;
  }

  return children;
}
