# Audiorective — Landing Page Copy Deck

_Working document. Captures locked copy, structure, and open questions as of this session._

_Canonical source for the landing page's content spine. Refine here; diffs against
this file drive copy updates. See the site design at
`docs/superpowers/specs/2026-06-29-audiorective-website-design.md`._

---

## Status legend

- ✅ **Locked** — agreed, final-ish wording
- 🟡 **Draft** — direction agreed, wording still in play
- ⚪ **Open** — not yet written / to revisit

---

## 1. Above the fold ✅

**Hero**

> # Delightful Web Audio primitives that you — and your LLM — actually love to use.
>
> ### State · Clock · Analysis · Bindings
>
> Audiorective takes care of the cumbersome plumbing that almost every web audio app rebuilds from scratch — so your precious brain and your valuable tokens can go where they actually matter: the idea.
>
> `[ Get Started → ]` `[ View Showroom ]`

Notes:

- Sub-line `State · Clock · Analysis · Bindings` teases real packages; "Bindings" quietly signals framework-agnostic story.
- Two CTAs: primary → docs/get-started, secondary → showroom.

---

## 2. Page structure 🟡

Nav bar: **logo · Docs · Showroom · GitHub**
(Showroom + Docs live in nav/hero only — _not_ body sections. The landing page itself will eventually be an audio app; that's out of scope for now.)

Body flow:

1. **Hero** — slogan, sub-line, paragraph, CTAs.
2. **The problem & the goal** — the thesis. Core message: _you can vibe out audio apps with an LLM now, but audiorective is the solid ground that eliminates the common errors and bad practices._
3. **Pain points** — foldable cards (State + Clock). See §3.
4. **Composability + solid ground** — the turn: take only what you need; the easy path stays correct. See §4.
5. **Agent skill / LLM-native** — the "and your LLM" promise made real. See §5.
6. **Closing send-off** — the door out to Docs · Showroom · GitHub. See §6.

**The landing page is a trailer, not a manual.** Its only job: make someone think "wait, what is this?" and click through to Docs / Showroom / GitHub. Anything that _informs_ (package list, roadmap, footer) lives on the other side of that click.

- ❌ **No footer** — the page ends on the send-off CTA, not a colophon.
- ❌ **No package list / grid** — package _names_ surface as texture in copy, never as a catalog.
- ❌ **No roadmap** — belongs in Docs/GitHub.

Guiding spine (the message the whole page promotes):

> "Yes, you can vibe out audio apps with an LLM easily now — but audiorective provides a solid ground that eliminates most common errors and bad practices. The easy path stays the correct path."

Positioning guardrails:

- **No JUCE comparison** for now — audiorective diverges (JUCE = monolithic one-stop; audiorective = loosely coupled, take only what you need). Still requires a light shared foundation — not 100% decoupled.
- Tone.js is respected (reference for future effects porting). Jokes punch at _coupling_, never at the project.

---

## 3. Pain points section 🟡

**Section header:** _A few of the most significant pain points_
(The hedge lets us ship just two cards without it feeling thin.)

### Interaction model

- Foldable cards. Collapsed by default.
- Collapsed = short cheeky title + one-liner + an animated diagram looping quietly. **The collapsed state must land the point on its own** — never hide the whole argument behind a click.
- Click/tap → expands the detailed reasoning beneath; diagram stays visible.
- Accordion (one open at a time) reads cleanest, esp. on mobile.
- Obvious fold affordance (chevron or "Why this happens →").
- The diagrams carry real persuasive weight — tiny truthful simulations, not decorative SVG. Eventually the scheduling diagram could be driven by the _actual_ audiorective clock (the diagram explaining the problem, powered by the solution). Optional muted audio cue on the scheduling card (hear the drift vs the lock).

### House voice for pain cards

**"Name the conflict as if the components have beef."** Personify the parts. Cheeky on the surface, real technical point underneath; the humor earns the click.

---

### Card 1 — State ✅ (voice locked, expanded copy 🟡)

**Collapsed**

> **According to my state, you're wrong.**
> Two owners, one value, and a sync bug with your name on it.

**Diagram:** two labelled boxes — **UI Framework** and **Audio Engine** — each showing the same value (e.g. a gain number). Drag a slider → UI box updates instantly → Audio box stays stale (tinted red) → a manual "sync" pulse travels across to catch it up, with a visible lag gap. Loop so the desync gap is what the eye catches. Optional second beat: an "audiorective" toggle collapses the two boxes into one shared node both read from — gap gone.

**Expanded (reasoning)**

> State ends up owned twice. Your UI framework wants to be the source of truth — React, Vue, Svelte all expect to own state and re-render from it. But the audio graph already owns state too: an `AudioParam` _has_ a value, a node _has_ its settings. So the same value lives in two places, and you're hand-writing sync code to keep them agreed — update the store, then remember to push it to the audio node, every time. Nothing structurally enforces that contract, so months and a few features later, a slider moves and the sound doesn't follow. Worse, your audio logic is now fused to one framework — and frameworks churn, unlike the stable Web Audio API standard — so switching means rewriting the audio layer too.

Resolves to → `@audiorective/core`.

---

### Card 2 — Clock / Scheduling ✅ (voice locked, expanded copy 🟡)

**Collapsed**

> **Two clocks. One of them is lying.**
> The audio clock keeps perfect time. `setTimeout` flinches at every layout and GC — and that's the one most apps schedule on.

**Diagram:** two stacked timelines. **Audio clock** on top — beats land dead on the grid, evenly. **JS clock (`setTimeout`)** below — beats jitter; when a red **layout / GC** block slams the main thread, a beat visibly slips late and the rhythm drifts. Resolution beat: the JS timer wakes periodically and places notes _ahead_ onto the audio grid (the lookahead), so even as it jitters, beats still land locked. (Metronome drifting vs staying tight — practically animates itself. Optional: let it play the wobble vs the lock.)

**Expanded (reasoning)**

> Scheduling gets reinvented — usually wrong. The web has two clocks: the sample-accurate audio clock that actually plays your sound, and the jittery JavaScript clock (`setTimeout`) that's at the mercy of layout and garbage collection. The fix — a lookahead scheduler bridging the two — was [spelled out by Chris Wilson in 2013](https://web.dev/articles/audio-scheduling), yet a remarkable number of apps _still_ fire notes straight off `setTimeout` and wonder why the rhythm wobbles. Then swing, count-in, and a second independent loop each get their own ad-hoc patch on top.

Connector line (ties to the package):

> Audiorective's clock implements that lookahead model once, correctly — so "two clocks" stops being trivia you're expected to rediscover and becomes something the API just handles.

Resolves to → `@audiorective/clock`.

Note: the 2013 date does real rhetorical work — frames the problem as _long-solved-yet-still-missed_, flattering the reader who knew and educating the one who didn't.

---

### Tone.js bridge 🟡 (prose, NOT a card)

Sits after the two cards, bridging "here's the pain" → composability. Affectionate tone.

> **Tone.js: you wanted a clock, you adopted a framework.**
> A great library — but it's all-or-nothing: adopt the whole tightly-coupled model, or build from scratch. And even with it, your audio logic ends up fused to whatever UI framework you happen to use. Audiorective lets you take just the piece you need.

This line does double duty — funny _and_ pre-sells composability (the point being you _can_ just take the clock).

---

## 4. Composability + solid ground ✅

**Header:** _Take what you need. Come back for more whenever._

**Body**

> Audiorective isn't one big thing you adopt. It's a pile of small, independent pieces — take just the clock today, add reactive state when you need it, reach for the bindings when a framework shows up. Each piece stands on its own, snapping onto a featherweight shared **baseplate** only where they need to meet. Even the framework bindings are just another brick — your headless engine never learns whether React or Vue sits on top. No monolith to swallow, no lock-in to regret. Start with one brick. Come back for more whenever you fancy.

Vocabulary decision ✅ → **"baseplate"** for the not-100%-decoupled shared core (the thin board Lego snaps onto). Playful, instantly legible.

**Lego animation (automated, looping)**

- Loose scattering of distinct Lego piles, gently idle.
- One brick lifts from a pile, drifts to center; bricks from _different_ piles join and snap together with a click-settle; the little assembly forms an abstract shape and glides out of frame (shipped).
- Each loop pulls from different piles → different shape. Variety is the message: same pieces, endless combinations, you choose.

Refinements (locked):

- Bricks stay **abstract/unlabeled** — no "clock"/"state" text. Labels turn it into a diagram and invite "where's the rest of the list?" (which we're avoiding).
- Pace **slow and calm** — a breather between the tense pain cards and the skill pitch.
- The shipped shape **very faintly echoes a waveform or play button** — a whisper that what you're building is audio, never literal.

**Binding message — status: ✅ RESOLVED.** Folded into the composability body as one line: _"Even the framework bindings are just another brick — your headless engine never learns whether React or Vue sits on top."_ This keeps the warm composability voice (bindings = just another brick, reinforcing the model) and captures the headless/framework-agnostic idea without reintroducing the "beef" voice or needing a standalone section. The framework-coupling _pain_ remains in the State card's expanded copy; the fuller "headless engine, happy framework" narrative lives in Docs.

---

## 5. Agent skill / LLM-native ✅

**Header:** _Sustainable Vibe Coding_
("Sustainable" carries the whole thesis — works today _and_ keeps working. Positive/aspirational rather than scolding, and still bookends "yes you can vibe it now, but…")

**Body**

> Vibe coding doesn't have to mean throwaway code. Audiorective ships an agent skill that drops the right patterns straight into your assistant's context: how the clock actually schedules, how state stays in sync, how `core`, `clock`, and the bindings fit together. Instead of reinventing plumbing from raw Web Audio API every session, your LLM reaches for the pieces that already work. The easy path, finally the correct one.

**Hook**

> `[ Install the skill → ]` _(links to the installation page in Docs)_

Notes:

- Package names (`core`, `clock`, bindings) surface here as texture — the one spot they appear without a grid.
- "The easy path, finally the correct one" deliberately echoes the thesis closer → bookend.
- Real install command lives in Docs; landing page just links out. (Placeholder for now.)

---

## 6. Closing send-off ✅

The most important CTA on the page — everything funnels here. An open door, not a footer.

**Header:** _Go make some noise._ (playful, audio-native, an invitation to act — matches the page's voice; sub-line carries the concrete doors so the header is free to be pure energy)

**Layout**

> ## Go make some noise.
>
> Poke around the showroom, skim the docs, or dig into the source. Whatever kind of curious you are.
>
> `[ Showroom ]` `[ Docs ]` `[ GitHub ★ ]`

Notes:

- **Showroom first** ✅ — for a visual/audible project, "see it working" is the strongest final pull; docs/source are for people already sold. (Assumes the Showroom lands well; flip to Docs-first if the Showroom is still thin.)
- `★` on GitHub = soft nudge toward starring, no begging.
- No footer beneath. Page ends on three open doors.

---

## 7. Open items ⚪

All copy sections are locked. Remaining is implementation-side:

- Diagram detailed specs (states, timing, what animates) for the two pain cards + the Lego animation — for Claude Code / implementation to nail down or interpret.
- Final tone pass once laid out in real design (currently: warm hero → measured thesis → cheeky pain cards → warm composability → cheeky skill → playful send-off).

---

## Reference links

- Two-clocks article (Chris Wilson, 2013): https://web.dev/articles/audio-scheduling
- Repo: https://github.com/audiorective/audiorective
- Vibe-evaluation research (step sequencer fragility): backs the State + Clock pain points with concrete failure modes.
