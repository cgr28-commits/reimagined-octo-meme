# Branch rules for `main` (owner to apply in GitHub)

Why: any push to `main` publishes the live website (`deploy-pages.yml`), and a push that
changes `workers/addresses/**` or `shared/**` redeploys the live Worker (`deploy-worker.yml`).
As of 24 Nov 2026 `main` has no branch rule and no ruleset. The files in this change add
guards inside the repository; **the settings below can only be applied by the repository
owner in GitHub**, and nothing in this repository applies them.

## What the files in this change do
| File | Effect |
|---|---|
| `.github/workflows/auto-merge-cursor-prs.yml` | Adds an explicit "never auto-merge `tours/*`" check. `cursor/*` behaves exactly as before. |
| `.github/workflows/tours-branch-guard.yml` + `.github/scripts/tours-branch-guard.cjs` | For `tours/*` pull requests only: fails if they touch the production deploy workflows, CODEOWNERS or the guard, or if they target `main` without the label `tours-go-live-approved`. Other pull requests pass immediately. |
| `.github/CODEOWNERS` | Marks workflows, `shared/`, `wrangler.toml` and the payment / availability stores as owner-reviewed. Enforced only if "Require review from Code Owners" is switched on. |

## Recommended settings (two tiers)

### Tier 1: apply first (does not change how you work today)
GitHub, Settings, Rules, Rulesets, New branch ruleset:
- Name: `main protection`. Enforcement: Active. Target: default branch (`main`).
- **Block force pushes**: on.
- **Restrict deletions**: on.
- **Require status checks to pass**: add `Tours branch guard`. (Passes instantly for every non-tours pull request.)
- Leave "Require a pull request before merging" **off** in Tier 1.

### Tier 2: only after you confirm your normal workflow (changes how work reaches `main`)
- **Require a pull request before merging**: on. This blocks direct pushes to `main`, which have been used for recent changes (for example "Preview workflow" commits).
- **Required approvals: 0.** Do not require 1 or more approvals: you are the only reviewer and GitHub does not let you approve your own pull request, and the existing auto-merge workflow merges with the built-in GitHub Actions token, which cannot approve. A required approval would stop both.
- Bypass list: add yourself (Repository admin) so you can still act in an emergency.
- **Require review from Code Owners**: leave off unless you accept the same limitation.

## Check after applying (owner)
1. Open a throwaway pull request from a branch named `cursor/test-a1`: it should still be auto-merge eligible as before (do not leave it open).
2. A pull request from a branch named `tours/test` into `main` should show `Tours branch guard` failing until the label `tours-go-live-approved` is added.
3. A normal `claude/...` or `feature/...` pull request shows `Tours branch guard` passing.

## Rollback
Delete the ruleset in GitHub (instant). To remove the repository guards, revert this change; no data, secret or production setting is involved.
