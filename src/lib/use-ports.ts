"use client";

import { useEffect, useState } from "react";
import { resolvePorts, toPublicPorts, type PublicPort } from "../../shared/ports";
import { fetchPublicBookingNotice } from "@/lib/short-notice-api";

let cached: Promise<PublicPort[]> | null = null;

/**
 * Active cruise & ferry ports. Starts with the built-in verified list so the picker never
 * flashes empty, then switches to the owner's edited list from the Worker.
 */
export function usePorts(): PublicPort[] {
  const [ports, setPorts] = useState<PublicPort[]>(() => toPublicPorts(resolvePorts(undefined)));
  useEffect(() => {
    let cancelled = false;
    cached ??= fetchPublicBookingNotice()
      .then((notice) => notice.ports)
      .catch(() => toPublicPorts(resolvePorts(undefined)));
    void cached.then((value) => {
      if (!cancelled) setPorts(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return ports;
}
