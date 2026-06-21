# Livehouse PA Simulator — Phase 4: "Designing Audio Apps" Skill Guide — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: this phase authors skill content — use **`superpowers:writing-skills`** to draft and verify the new reference, not the TDD execution skills. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new "Designing Audio Apps" reference to the audiorective skill that teaches users the _methodology_ for designing a whole audio app (collaborative design → gap-finding → plan → headless audio core first), using the Livehouse PA Simulator as the worked example.

**Architecture:** A new `docs/designing-audio-apps.md`, symlinked into `skills/audiorective/references/` (matching the existing reference symlinks), plus a pointer row in `skills/audiorective/SKILL.md` "What to read next". Prose only — no code changes to the app.

**Tech Stack:** Markdown; the `superpowers:writing-skills` skill for authoring discipline.

**Depends on:** Phases 1–3 complete (so the guide can point at real, tested code as its example). This is **Phase 4 of 4**. Spec: `docs/superpowers/specs/2026-06-21-livehouse-pa-simulator-design.md` §11.

---

## File Structure

| File                                                                       | Responsibility                             |
| -------------------------------------------------------------------------- | ------------------------------------------ |
| `docs/designing-audio-apps.md` (create)                                    | The methodology guide                      |
| `skills/audiorective/references/designing-audio-apps.md` (create, symlink) | `-> ../../../docs/designing-audio-apps.md` |
| `skills/audiorective/SKILL.md` (modify)                                    | Add a "What to read next" pointer row      |

---

## Task 1: Invoke writing-skills and draft the guide

**Files:**

- Create: `docs/designing-audio-apps.md`

- [ ] **Step 1: Load the authoring discipline**

Invoke `superpowers:writing-skills` and follow it while drafting (concrete, example-driven, no fluff; the skill's quality checklist gates the result).

- [ ] **Step 2: Write `docs/designing-audio-apps.md`**

Structure (each section grounded in the PA simulator as the running example; keep it concrete, not abstract):

1. **Title + when to read** — "Designing Audio Apps": read when building a whole app (multiple sources, multiple UIs, spatial), not just calling one processor. Point back to `architecture.md` for the audio/UI rule this builds on.
2. **The shape of the process** — a short ordered list: (a) design collaboratively & find gaps, (b) map features → primitives, (c) decide state ownership, (d) build the headless audio core first, (e) choose sources per role, (f) integrate renderers. Each expanded below.
3. **Design first; make the metaphor honest.** Pin down UX/features before code; interrogate the metaphor until the audio model is truthful. **Worked example:** a literal mixing console sums to stereo, so a "3D pan" knob there is fake — switching to **audio drones** made 3D spatialization literally true. _Rule: when the UI metaphor and the audio reality disagree, change the metaphor, not the audio._
4. **Map every feature to a primitive.** Build a coverage table (feature → `StreamPlayer`/`SoundPlayer`/`Voice`/`Spatial`/`Param`/`Cell`/`AnalyserNode`/`createEngine`). Show the PA simulator's table. Gaps and over-reach surface here.
5. **Decide state ownership up front.** Engine owns all audio state _and_ any cross-renderer view state (`Cell`/`Param`); UIs only observe + mutate. With multiple renderers (PlayCanvas + React + three.js), the engine is the single meeting point — no back-channels. Show `selectedChannelId` / `ui.hudOpen` / `position` as the shared cells, and contrast the wrong (React-owns-state-with-refs) vs right pattern (link to `architecture.md`'s UI/UI section).
6. **Build the headless audio core first.** Implement & unit-test the entire graph — channels, buses, routing, scheduling, metering — with no DOM/renderer. **Litmus:** it runs in a browser-mode unit test. Then layer renderers/UI. Reference the PA simulator's Phase 1 (audio core) vs Phase 2–3 (renderers/UI) split as the concrete embodiment.
7. **Choose the right source per role.** `StreamPlayer` (long-form/streamed), `SoundPlayer`/`Voice` (one-shots + loops), an `AudioProcessor` synth (generated) — unified behind a source-agnostic channel strip. Note the tradeoff captured in this project: cross-source clock drift is accepted for a demo.
8. **Integrate renderers via the binding packages.** One `AudioContext`; `attach` to share it; `bindPanner`/`PannerAnchor` to drive panners from scene transforms; keep control-only views (the three.js EQ/pan widgets) free of audio nodes (no `THREE.AudioListener`).
9. **A short checklist** the reader can apply to their own app (one line per step above).

Keep it tight and skimmable (tables, short code/pseudocode snippets pulled from the real app where they clarify). Cross-link `core.md`, `architecture.md`, `react.md`, `playcanvas.md`, `threejs.md`.

- [ ] **Step 3: Commit the draft**

```bash
git add docs/designing-audio-apps.md
git commit -m "docs: Designing Audio Apps methodology guide"
```

---

## Task 2: Wire it into the skill

**Files:**

- Create (symlink): `skills/audiorective/references/designing-audio-apps.md`
- Modify: `skills/audiorective/SKILL.md`

- [ ] **Step 1: Create the symlink (matching the existing references)**

```bash
ln -s ../../../docs/designing-audio-apps.md apps/../skills/audiorective/references/designing-audio-apps.md
```

Verify: `readlink skills/audiorective/references/designing-audio-apps.md` prints `../../../docs/designing-audio-apps.md`, and `cat skills/audiorective/references/designing-audio-apps.md` shows the guide.

- [ ] **Step 2: Add a "What to read next" pointer in `skills/audiorective/SKILL.md`**

Add a row to the "What to read next" table:

```md
| Designing a whole audio app (multiple sources, multiple UIs, spatial) | `references/designing-audio-apps.md` |
```

- [ ] **Step 3: Commit**

```bash
git add skills/audiorective/references/designing-audio-apps.md skills/audiorective/SKILL.md
git commit -m "skill(audiorective): link Designing Audio Apps guide"
```

---

## Task 3: Verify + version note

- [ ] **Step 1: Run the writing-skills quality checks** from the skill (concrete? example-driven? no placeholders? links resolve?). Fix inline.

- [ ] **Step 2: Confirm links resolve** — open the guide and click through its cross-links to `core.md`/`architecture.md`/etc. (all are sibling files in `docs/` and `references/`).

- [ ] **Step 3: Version-bump note (do NOT bump here unless releasing).** The audiorective skill/plugin is versioned (currently `1.1.2`). A new reference is a content addition — bump the skill/plugin version as part of the next coordinated release, not in this plan. Leave a one-line note in the PR description so the releaser knows.

---

## Self-Review notes (for the implementer)

- **Spec coverage (§11):** new `docs/designing-audio-apps.md` ✓; symlinked into `references/` ✓; SKILL.md pointer ✓; methodology = the six steps from this thread, PA simulator as worked example ✓; version-bump flagged ✓.
- **Authoring discipline:** use `superpowers:writing-skills` (Task 1 Step 1) — concrete, example-first, no abstract filler; this is the audiorective skill's own house style (see the existing `architecture.md`).
- **Dependency:** author last, after Phases 1–3, so every code reference in the guide points at real, shipped files.

```

```
