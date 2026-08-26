"use client";

export type OwnerDashboardToolTab = "jobs" | "a2a-quotes" | "personal-quotes" | "same-fare";

type OwnerDashboardToolSwitcherProps = {
  value: OwnerDashboardToolTab;
  onChange: (next: OwnerDashboardToolTab) => void;
};

const OPTIONS: { id: OwnerDashboardToolTab; label: string }[] = [
  { id: "jobs", label: "Jobs" },
  { id: "a2a-quotes", label: "A2A Quotes" },
  { id: "personal-quotes", label: "Personal Quotes" },
  { id: "same-fare", label: "Same Fare Test" },
];

/**
 * Compact top switcher for Owner Dashboard tools.
 * One selection at a time; Jobs is the operational default.
 */
export default function OwnerDashboardToolSwitcher({
  value,
  onChange,
}: OwnerDashboardToolSwitcherProps) {
  return (
    <div
      className="mb-6 rounded-2xl border border-white/10 bg-navy/50 p-2"
      role="tablist"
      aria-label="Owner dashboard tools"
    >
      <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
        {OPTIONS.map((option) => {
          const selected = value === option.id;
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
              className={`min-h-11 rounded-xl px-2 py-2 text-center text-xs font-semibold transition-colors sm:text-sm ${
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
