"use client";

import { useEffect, useState } from "react";
import EmergeBelfastEndedPage from "@/components/EmergeBelfastEndedPage";
import EmergeBelfastPageClient from "@/components/EmergeBelfastPageClient";
import { isEmergeBelfastCampaignActive } from "@/lib/emerge-belfast";

/**
 * Chooses the live 2026 campaign page or the soft-ended noindex view.
 * Runtime check covers visits after expiry even if the last static build
 * was produced while the campaign was still active.
 */
export default function EmergeBelfastRouteClient({
  initialActive,
}: {
  initialActive: boolean;
}) {
  const [active, setActive] = useState(initialActive);

  useEffect(() => {
    setActive(isEmergeBelfastCampaignActive());
  }, []);

  return active ? <EmergeBelfastPageClient /> : <EmergeBelfastEndedPage />;
}
