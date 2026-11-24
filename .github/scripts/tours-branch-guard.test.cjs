// Run with: node .github/scripts/tours-branch-guard.test.cjs
const assert = require("node:assert/strict");
const { evaluate, APPROVAL_LABEL } = require("./tours-branch-guard.cjs");

// Non-tours branches are never guarded, whatever they change.
for (const headRef of ["cursor/fix-fare", "claude/some-work", "feature/x", "main", "", undefined]) {
  const result = evaluate({
    headRef,
    baseRef: "main",
    labels: [],
    changedFiles: [".github/workflows/deploy-worker.yml", "shared/bespoke-quote.ts"],
  });
  assert.equal(result.guarded, false, `guarded: ${headRef}`);
  assert.equal(result.ok, true, `ok: ${headRef}`);
}

// A branch that merely contains "tours" is not a tours/ branch.
assert.equal(evaluate({ headRef: "cursor/tours/x", baseRef: "main", labels: [], changedFiles: [] }).guarded, false);
assert.equal(evaluate({ headRef: "tours-fix", baseRef: "main", labels: [], changedFiles: [] }).guarded, false);

// tours/* into main without the label fails.
let result = evaluate({ headRef: "tours/builder", baseRef: "main", labels: [], changedFiles: ["src/app/tours/page.tsx"] });
assert.equal(result.guarded, true);
assert.equal(result.ok, false);
assert.equal(result.reasons.length, 1);

// With the label it passes (string or object labels).
for (const labels of [[APPROVAL_LABEL], [{ name: APPROVAL_LABEL }]]) {
  result = evaluate({ headRef: "tours/builder", baseRef: "main", labels, changedFiles: ["src/app/tours/page.tsx"] });
  assert.equal(result.ok, true);
}

// tours/* into another tours branch does not need the label.
result = evaluate({ headRef: "tours/builder", baseRef: "tours/integration", labels: [], changedFiles: ["src/lib/tours.ts"] });
assert.equal(result.ok, true);

// Protected files fail even with the label, and each is named.
for (const path of [
  ".github/workflows/deploy-pages.yml",
  ".github/workflows/deploy-worker.yml",
  ".github/workflows/auto-merge-cursor-prs.yml",
  ".github/workflows/tours-branch-guard.yml",
  ".github/CODEOWNERS",
  ".github/scripts/tours-branch-guard.cjs",
]) {
  result = evaluate({ headRef: "tours/x", baseRef: "tours/integration", labels: [APPROVAL_LABEL], changedFiles: [path] });
  assert.equal(result.ok, false, path);
  assert.ok(result.reasons[0].includes(path), path);
}

// Other workflows (for example a preview workflow) are not protected by this guard.
result = evaluate({
  headRef: "tours/x",
  baseRef: "tours/integration",
  labels: [],
  changedFiles: [".github/workflows/deploy-tours-preview.yml"],
});
assert.equal(result.ok, true);

console.log("tours-branch-guard: all tests passed");
