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

## Known direct pushes to `main` (checked 24 Nov 2026)
Two scheduled jobs commit straight to `main` as `github-actions[bot]` using the built-in token (`git pull --rebase origin main`, then a normal `git push`, never a force push):

| Workflow | When | What it commits |
|---|---|---|
| `daily-health-check.yml` | 07:00 UTC daily | Only when it has auto-fixes: `public/sitemap.xml`, the contact vCard files |
| `ots-pricing-check.yml` | 06:00 UTC daily | Only when calibration changes anything: `src/lib/pricing-config.json` (airport pricing) |

These conflict with any rule that requires a pull request **or** a passing status check before a push to `main`: GitHub would reject their pushes. Owner and tool sessions also commit directly to `main` today. This is why the pull-request requirement and the required `Tours branch guard` check are both deferred to Tier 2, until these two jobs are changed to open pull requests or are given a bypass. Nothing here has been changed in either workflow.

## Recommended settings (two tiers)

### Tier 1: apply first (does not change how any workflow or person works today)
GitHub, Settings, Rules, Rulesets, New branch ruleset:
- Name: `main protection`. Enforcement: Active. Target: default branch (`main`).
- **Block force pushes**: on. No workflow in this repository force-pushes (checked).
- **Restrict deletions**: on.
- Leave **"Require a pull request before merging" off** and **"Require status checks to pass" off**. Both would reject the two daily jobs above.

Effect of Tier 1 alone: the `Tours branch guard` check still runs and shows on pull requests, but nothing forces it to pass before a merge. Until Tier 2, the protection for tours work is: tours pull requests target `tours/integration`, not `main`, and the owner is the only person who merges to `main`.

### Tier 2: only after the daily-job conflict is resolved (changes how work reaches `main`)
- Change `daily-health-check.yml` and `ots-pricing-check.yml` to open a pull request instead of pushing, or add the GitHub Actions app to the ruleset bypass list (not yet verified that it can be added).
- Then: **Require a pull request before merging**: on. Required approvals: **0** (you cannot approve your own pull request, and the auto-merge workflow's token cannot approve).
- **Require status checks to pass**: add `Tours branch guard`. It passes for every non-tours pull request.
- Bypass list: add yourself (Repository admin) for emergencies.
- **Require review from Code Owners**: leave off unless you accept the same limitation.

## Check after applying (owner)
1. After Tier 1: the next 06:00 and 07:00 UTC runs still complete (Actions tab); a normal push to `main` still works.
2. A pull request from a branch named `tours/test` into `main` shows `Tours branch guard` failing until the label `tours-go-live-approved` is added (do not leave it open).
3. A normal `claude/...` or `feature/...` pull request shows `Tours branch guard` passing. A `cursor/...` pull request still auto-merges as before.

## Rollback
Delete the ruleset in GitHub (instant). To remove the repository guards, revert this change; no data, secret or production setting is involved.
