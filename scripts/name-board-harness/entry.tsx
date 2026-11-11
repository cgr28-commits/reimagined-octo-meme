/**
 * Test-only harness for scripts/check-owner-name-board-browser.ts.
 * Mounts the real NameBoardPanel inside a navy page that mimics the
 * Owner Dashboard container, plus a stand-in for a job card's
 * "Show name board" button. Never shipped: it lives under scripts/, which is
 * excluded from the Next.js app and tsconfig.
 */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import NameBoardPanel, { type NameBoardPrefill } from "../../src/components/NameBoardPanel";

function Harness() {
  const [prefill, setPrefill] = useState<NameBoardPrefill | null>(null);
  return (
    <main
      style={{
        maxWidth: 640,
        margin: "0 auto",
        padding: "16px",
        fontFamily: "Manrope, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
      }}
    >
      <button
        type="button"
        data-testid="harness-job-button"
        onClick={() => setPrefill({ name: "Mrs Aoife Gallagher", requestId: Date.now() })}
        style={{ marginBottom: 12 }}
      >
        Booking: Show name board
      </button>
      <NameBoardPanel prefill={prefill} />
    </main>
  );
}

const mount = document.getElementById("root");
if (mount) createRoot(mount).render(<Harness />);
