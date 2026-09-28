"use client";

export type OwnerDashboardToolTab =
  | "jobs"
  | "past"
  | "availability"
  | "more"
  | "pricing"
  | "a2a-quotes"
  | "personal-quotes"
  | "same-fare"
  | "admin"
  | "money"
  | "requests"
  | "enquiries"
  | "tracking";

type OwnerDashboardToolSwitcherProps = {
  value: OwnerDashboardToolTab;
  onChange: (next: OwnerDashboardToolTab) => void;
};

const PRIMARY: { id: "jobs" | "past" | "availability" | "more"; label: string }[] = [
  { id: "jobs", label: "Jobs" },
  { id: "past", label: "Past" },
  { id: "availability", label: "Availability" },
  { id: "more", label: "More" },
];

export const OWNER_MORE_DESTINATIONS: {
  id: OwnerDashboardToolTab;
  label: string;
  hint: string;
}[] = [
  { id: "admin", label: "Job admin", hint: "Awaiting payment, future jobs, refunds, and checkout recovery" },
  { id: "money", label: "Money", hint: "Earned revenue and payments received" },
  { id: "requests", label: "Requests", hint: "Approvals that need a decision, and deposit cash" },
  { id: "enquiries", label: "Enquiries", hint: "Quotes and enquiry jobs" },
  { id: "tracking", label: "Tracking", hint: "Driver tracking jobs and acceptance" },
  { id: "pricing", label: "Pricing", hint: "Fares and vehicle pricing" },
  { id: "a2a-quotes", label: "A2A Quotes", hint: "Address-to-address quote queue" },
  { id: "personal-quotes", label: "Personal Quotes", hint: "Personal quote codes" },
  { id: "same-fare", label: "Same Fare Test", hint: "Same-fare amendment test" },
];

export function ownerDashboardPrimaryTab(
  value: OwnerDashboardToolTab,
): "jobs" | "past" | "availability" | "more" {
  if (value === "jobs" || value === "past" || value === "availability") return value;
  return "more";
}

/**
 * Compact top switcher for Owner Dashboard tools.
 * Four large targets — no horizontal scrolling. Less-used tools live under More.
 */
export default function OwnerDashboardToolSwitcher({
  value,
  onChange,
}: OwnerDashboardToolSwitcherProps) {
  const selectedPrimary = ownerDashboardPrimaryTab(value);
  return (
    <div
      className="mb-4 rounded-2xl border border-white/10 bg-navy/50 p-2"
      role="tablist"
      aria-label="Owner dashboard tools"
    >
      <div className="grid grid-cols-2 gap-1">
        {PRIMARY.map((option) => {
          const selected = selectedPrimary === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="tab"
              id={`owner-tool-tab-${option.id}`}
              aria-selected={selected}
              aria-controls={`owner-tool-panel-${option.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(option.id)}
              className={`min-h-12 rounded-xl px-2 py-2 text-center text-sm font-semibold transition-colors ${
                selected
                  ? "bg-emerald text-navy"
                  : "bg-transparent text-white/70 hover:bg-white/5 hover:text-white"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function OwnerDashboardMoreMenu({
  onChange,
}: {
  onChange: (next: OwnerDashboardToolTab) => void;
}) {
  return (
    <div id="owner-tool-panel-more" role="tabpanel" aria-labelledby="owner-tool-tab-more">
      <p className="text-xs font-semibold uppercase tracking-wider text-white/45">More</p>
      <h2 className="mt-1 text-xl font-bold text-white">Dashboard tools</h2>
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {OWNER_MORE_DESTINATIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className="min-h-16 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left hover:border-white/25"
          >
            <span className="block text-base font-bold text-white">{item.label}</span>
            <span className="mt-1 block text-sm text-white/55">{item.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function OwnerToolBackBar({
  title,
  onBack,
}: {
  title: string;
  onBack: () => void;
}) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <button
        type="button"
        onClick={onBack}
        className="min-h-11 shrink-0 rounded-xl border border-white/15 px-4 text-sm font-semibold text-white"
      >
        More
      </button>
      <h2 className="text-lg font-bold text-white">{title}</h2>
    </div>
  );
}
