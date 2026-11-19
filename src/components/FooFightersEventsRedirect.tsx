"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { EVENTS_HUB_PATH } from "@/lib/bespoke-public";

/** Sends visitors from the old dedicated page to the Events quote tool. */
export default function FooFightersEventsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace(EVENTS_HUB_PATH);
  }, [router]);
  return null;
}
