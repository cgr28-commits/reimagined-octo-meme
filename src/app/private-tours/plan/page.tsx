import { Suspense } from "react";
import PlanBuilder from "@/components/private-tours/PlanBuilder";

export default function PlanPage() {
  return (
    <section className="pt-hero pt-wrap">
      <p className="pt-kicker">Smart Itinerary Builder</p>
      <h1 style={{ marginTop: 8 }}>Plan your day</h1>
      <p className="lead">Tell us when and who, pick what you love, and we will build a day that fits. Change anything and the timings update instantly.</p>
      <Suspense fallback={<p className="pt-muted" style={{ marginTop: 24 }}>Loading the planner…</p>}>
        <PlanBuilder />
      </Suspense>
    </section>
  );
}
