# Goal: Latency Lab demo shipped on PR #27, CI green, Greptile 5/5

> **For an autonomous session:** this is a goal runbook, not a task list. Execute the phases in order; each phase names the skill to drive it and the exit condition that must hold before the next phase starts. Keep a ledger at `.superpowers/goal/latency-lab.md` (git-ignored) with one line per phase transition and per ruling, so a resumed session can pick up where the last one stopped. Never stop to ask "should I continue?" — stop only for the four SDD stop conditions (irreversible/destructive action, security-sensitive action, out-of-worktree side effects beyond those this runbook explicitly authorizes, or a plan so broken every path is a guess).

**Goal:** the Latency Lab demo (spec: `docs/superpowers/specs/2026-09-02-latency-lab-demo-design.md`) is implemented and pushed to the branch of https://github.com/audiorective/audiorective/pull/27, every CI check on that PR is green, and Greptile's review of the PR reports **Confidence Score: 5/5** with no open P1/P2 findings.

**Repo:** `/Users/jcppman/Workspace/audio/audiorective`, branch `feat/graph-pdc-devtools` (the PR's head). Base branch `main`.

**Authorized side effects:** committing to and pushing `feat/graph-pdc-devtools`; commenting on PR #27; re-triggering the Greptile review. Not authorized: merging, force-pushing, rebasing the PR branch, editing CI secrets or workflows beyond fixes needed for green, touching other branches.

## Phase 0 — Orient (every session start)

1. `git fetch origin && git checkout feat/graph-pdc-devtools && git pull --ff-only`.
2. Read the ledger if it exists; resume at the first phase without a `done` line.
3. Read the spec above and, once it exists, the implementation plan at `docs/superpowers/plans/2026-09-02-latency-lab.md`.
4. Snapshot PR state: `gh pr view 27 --json statusCheckRollup,comments` and `gh api repos/audiorective/audiorective/pulls/27/comments`. Record the current Greptile score and open findings in the ledger.

## Phase 1 — Address the existing Greptile findings first

Greptile's last review (commit 8ba544d) scored **3/5** with three findings that predate the demo. They touch code the demo depends on, so they are fixed before the demo is planned:

- **P1 — `packages/core/src/AudioEngine.ts`: disconnected graphs retain stale latency.** When an engine-owned graph's re-solve no longer includes `ctx.destination`, its per-graph record must drop (not keep its previous value), so `engine.latency` reflects only paths that currently reach the destination. Add a test: a reactive edge removal that disconnects a graph from the destination lowers `engine.core.latency`.
- **P1 — `packages/core/src/graph.ts`: `_graphRegistry` retains removed processors.** When an endpoint leaves the edge list (re-solve) or the graph is disposed, its registry entry must be deleted, so `getPathLatency` throws `LatencyUnknownError` — never the internal "node not present in the last solve" error. Add tests for both paths (removal via re-solve; disposal). Also cover the deferred related case: a processor whose only edge is an `AudioParam` sink must throw `LatencyUnknownError` too.
- **P2 — `packages/devtools/src/measureLatency.ts`: per-run processors are never destroyed.** Destroy each built processor after its render (`try/finally`).

Drive this with superpowers:subagent-driven-development on a short plan you write for it (3 tasks, TDD). Exit condition: core + devtools suites green and typechecks clean locally; commits pushed; `## [Unreleased]` changelog notes the behavior fixes under `### Fixed`.

## Phase 2 — Implementation plan for the demo

Invoke superpowers:writing-plans against the demo spec. Save the plan to `docs/superpowers/plans/2026-09-02-latency-lab.md`. Required task shape (adjust only if the spec forces it):

1. core: `GraphHandle.snapshot()` + public `onSolve` (tests, docs/core.md paragraph, changelog).
2. demo audio: `Beat`, `Click` (clock-driven, headless tests).
3. demo audio: `LookaheadLimiter` worklet + processor + `assertLatency` pin test (establish the `apps/web` browser-mode vitest harness if absent).
4. demo audio: root graph `buildGraph(compensate)`, bypass Param, PDC toggle, readings; offline alignment tests.
5. UI: diagram component from `snapshot()`; controls; flash row on `perceivedTime` (pure `flashTime` function + test).
6. Page + README + showroom card + `docs/core.md` link.

Before writing, verify with the code: how `apps/web` runs tests today (`apps/web/package.json`, any vitest config), how worklet modules are loaded under Astro/Vite (`new URL("./limiter.worklet.ts", import.meta.url)` and `ctx.audioWorklet.addModule`), and how existing showroom pages register cards. Put the exact answers into the plan's Global Constraints. Commit the plan.

Exit condition: plan file committed and pushed; its self-review checklist (spec coverage, placeholders, type consistency) passed.

## Phase 3 — Implement the demo

Invoke superpowers:subagent-driven-development on the plan. Model selection per that skill; the solver-adjacent core task (1) and the graph/PDC task (4) get a capable reviewer. Push after each task's review clears (`git push`), so CI runs incrementally and Greptile sees the work in slices.

Exit condition: all plan tasks complete with clean reviews, final whole-branch review clean (or residuals parked with rulings in the ledger), everything pushed.

## Phase 4 — CI green

After each push, watch the PR checks: `gh pr checks 27 --watch` (or poll `gh pr view 27 --json statusCheckRollup` at ~2-minute intervals). For any failing check other than "Greptile Review":

1. Fetch logs: `gh run view <run-id> --log-failed`.
2. Diagnose with superpowers:systematic-debugging — reproduce locally first (`pnpm --filter <pkg> test -- --run`, `pnpm -r typecheck`, `pnpm lint`, `pnpm format`; the pre-commit hook runs prettier repo-wide, CI's `lint-and-format` must match it).
3. Fix on the branch, commit, push, re-watch.

Known environment fact: `packages/playcanvas`'s `bindPanner` test fails locally under headless Chromium with `WebGL not supported`; check whether CI skips or passes it before treating it as yours. The Vercel checks build `apps/web` — a demo that breaks the Astro build shows up there first.

Exit condition: every check on PR #27 except "Greptile Review" is SUCCESS.

## Phase 5 — Greptile loop to 5/5

Greptile reviews each pushed commit automatically (its check stays FAILURE while the score is below its threshold). Loop:

1. Read the latest Greptile summary comment and inline review comments (`gh api repos/audiorective/audiorective/pulls/27/comments`, newest first; the summary comment on `gh pr view 27 --json comments` carries "Confidence Score: N/5" and "Last reviewed commit").
2. If the reviewed commit is behind `HEAD`, re-trigger via the "Re-trigger Greptile" link in the summary (`curl -s "<link>"`) and wait (~3–5 minutes, poll the comment for a new "Last reviewed commit").
3. For every open finding: reproduce or verify it against the code. Fix real ones (TDD; regression test per finding). For a finding you judge incorrect, do not silently ignore it — reply on the thread with the reasoning and evidence (`gh api ... /pulls/27/comments/<id>/replies -f body=...`), record the ruling in the ledger, and re-check on the next review whether Greptile still raises it.
4. Push, wait for the new review, repeat.

Also feed Greptile's "Files Needing Attention" and the deferred-minor list from `docs/superpowers/plans/2026-09-02-graph-pdc-devtools.md`'s SDD ledger history (multi-channel routing test, `GraphOptions` hygiene — hide `owner`, narrow `engine.defineGraph`'s options — registry invalidation) into fixes when Greptile or the score points at them.

Exit condition: the latest Greptile summary on PR #27 reports **Confidence Score: 5/5**, reviews the current `HEAD`, and has no unresolved P1/P2 threads. Cap: if after 6 review rounds the score is stuck at 4/5 with only findings you have ruled incorrect (with replies), stop and report — that is the one legitimate "done but not 5/5" outcome, and it needs a human.

## Phase 6 — Finish

1. Update the PR description (`gh pr edit 27 --body ...`) to add the Latency Lab demo and the Phase 1 fixes to the "What" section, keeping the existing footer.
2. Final ledger line: `goal: done — score 5/5 at <sha>`; leave the branch for the human to merge (merging is not authorized).
3. Report: what shipped, the Greptile trajectory (scores per round), every ruling made, and anything parked.

## Rulings already made by the human (do not re-litigate)

- Diagram data comes from `GraphHandle.snapshot()`, not a demo-side model.
- PDC toggle = dispose + rebuild the root graph; `compensate` stays a creation-time option.
- Latent effect = demo-local lookahead-limiter worklet with a slider-driven latency Param.
- No component render tests; audio core + pure functions carry coverage.
- Demo is standalone (`latency-lab`), not an extension of the sequencer demo.
