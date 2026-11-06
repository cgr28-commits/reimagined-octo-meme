/**
 * Test-only harness: a signed-in dashboard page with one airport job card,
 * the page-level DriverLocatorProvider and the Name Board, wired as in
 * DriverPageClient. API calls are answered by Playwright route mocks.
 */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import NameBoardPanel, { type NameBoardPrefill } from "../../src/components/NameBoardPanel";
import { DriverLocatorControls, DriverLocatorProvider, LocatorBoardBadge } from "../../src/components/DriverLocator";

const role = (new URLSearchParams(location.search).get("role") as "owner" | "driver") || "driver";

function Page() {
  const [prefill, setPrefill] = useState<NameBoardPrefill | null>(null);
  const [boardOpen, setBoardOpen] = useState(false);
  const open = (name: string) => {
    setPrefill({ name, requestId: Date.now() });
    setBoardOpen(true);
  };
  return (
    <DriverLocatorProvider accessKey={role === "owner" ? "owner-test-key" : "driver-test-key"} role={role}>
      <main style={{ maxWidth: 640, margin: "0 auto", padding: 16, fontFamily: "system-ui, sans-serif" }}>
        {boardOpen ? (
          <div data-testid="harness-board">
            <NameBoardPanel prefill={prefill} liveStatus={<LocatorBoardBadge />} />
          </div>
        ) : null}
        <article style={{ border: "1px solid rgba(255,255,255,.15)", borderRadius: 16, padding: 16, marginTop: 16 }}>
          <h2 style={{ margin: 0 }}>Mrs Aoife Gallagher</h2>
          <p style={{ opacity: 0.7 }}>Belfast International Airport → Lisburn · Flight EZY123</p>
          <DriverLocatorControls
            job={{ token: "a".repeat(32), customerName: "Mrs Aoife Gallagher", isAirportPickup: true, airportCode: "BFS" }}
            canOperate
            onShowNameBoard={open}
          />
        </article>
      </main>
    </DriverLocatorProvider>
  );
}

createRoot(document.getElementById("root")!).render(<Page />);
