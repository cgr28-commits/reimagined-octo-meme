// Pure decision logic for the "Tours branch guard" check.
// Kept free of GitHub calls so it can be unit tested (see tours-branch-guard.test.cjs).
//
// Rule set (Private Tours work, roadmap WP-A1):
//  1. Only pull requests whose head branch starts with "tours/" are guarded.
//     Every other pull request passes untouched, so existing airport work is unaffected.
//  2. A tours/* pull request must not change the production deploy / merge workflows,
//     the code owners file or this guard itself.
//  3. A tours/* pull request into main needs the label below, added by the owner
//     when they have approved it. No label, no pass.

const TOURS_PREFIX = "tours/";
const APPROVAL_LABEL = "tours-go-live-approved";

const PROTECTED_PATHS = [
  ".github/workflows/deploy-pages.yml",
  ".github/workflows/deploy-worker.yml",
  ".github/workflows/auto-merge-cursor-prs.yml",
  ".github/workflows/tours-branch-guard.yml",
  ".github/CODEOWNERS",
  ".github/scripts/tours-branch-guard.cjs",
  ".github/scripts/tours-branch-guard.test.cjs",
];

function evaluate({ headRef, baseRef, labels, changedFiles }) {
  const head = String(headRef || "");
  if (!head.startsWith(TOURS_PREFIX)) {
    return { guarded: false, ok: true, reasons: [] };
  }
  const reasons = [];
  const files = Array.isArray(changedFiles) ? changedFiles : [];
  const touched = PROTECTED_PATHS.filter((path) => files.includes(path));
  for (const path of touched) {
    reasons.push(`tours/* branches may not change ${path}`);
  }
  const names = (Array.isArray(labels) ? labels : []).map((label) =>
    String(typeof label === "string" ? label : label?.name || ""),
  );
  if (String(baseRef || "") === "main" && !names.includes(APPROVAL_LABEL)) {
    reasons.push(`merging into main needs the "${APPROVAL_LABEL}" label (owner approval)`);
  }
  return { guarded: true, ok: reasons.length === 0, reasons };
}

module.exports = { evaluate, TOURS_PREFIX, APPROVAL_LABEL, PROTECTED_PATHS };
