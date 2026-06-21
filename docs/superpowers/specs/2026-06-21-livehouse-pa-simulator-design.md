# Livehouse PA Simulator — Design

**Date:** 2026-06-21
**Status:** Draft for review
**Supersedes:** the three standalone showroom demos (Step Sequencer, Spatial Music Room, Spatial Music Room PlayCanvas)

## 1. Concept

A single cyber-livehouse showcase app. The player is the PA tech for tonight's gig. Each audio channel is a glowing **robot drone** emitting one instrument, flying in 3D through the venue. The player:

- **Walks the room** (first-person) — the listener moves, so the mix shifts (true Web Audio HRTF spatialization).
- **Flies each drone** in 3D via a three.js panning widget on the iPad — the source moves, reshaping the spatial mix.
- **Mixes each channel** from a toggleable, semi-transparent iPad HUD — EQ, volume (fader), solo/mute, plus a level meter.
- **Triggers the sampler** drone's one-shots via on-screen pads and the keyboard.
- **Monitors on headphones** — a global toggle that drops all room ambience (3D HRTF, distance, reverb) and collapses to a stable dry stereo mix.

The drone metaphor deliberately replaces the literal mixing-desk analogy: a real console sums to stereo, so "3D panning" there is fake. Drones make 3D spatialization _literally_ true — moving one genuinely changes what you hear.

This app **merges all three current demos**: the Sequencer's synth instruments + spatial-per-track model, the Spatial Music Room's walkable first-person world + StreamPlayer + EQ, and the PlayCanvas renderer port.

**Two deliverables.** This task produces (1) the app itself, and (2) a **skill enhancement** — a new "Designing Audio Apps" guide in the audiorective skill that teaches the _methodology_ this very project followed (collaborative design → gap-finding → plan → headless audio core first). The app is the worked example the guide points at. See §11.

## 2. Why this app (showcase goals)

The merged app exercises the full audiorective surface in one cohesive scene:

| Primitive / package                      | How it's demonstrated                                           |
| ---------------------------------------- | --------------------------------------------------------------- |
| `AudioProcessor`                         | `Channel` — a source-agnostic channel strip                     |
| `StreamPlayer`                           | Guitar 1, Guitar 2, Drums, Bass channels (streamed stems)       |
| `SoundPlayer` / `Voice`                  | Sampler channel (looping bed + polyphonic one-shots)            |
| Synth source (`AudioProcessor` subclass) | Synth channel (reuses a sequencer instrument + small pattern)   |
| `Spatial`                                | One per channel — the drone's 3D panner                         |
| `Param` / `SchedulableParam`             | Volume faders, 3-band EQ gains                                  |
| `Cell`                                   | Drone position, selection, shared view state                    |
| `createEngine`, `effect`, `computed`     | Engine assembly, solo/mute resolution, metering                 |
| `AnalyserNode` tap                       | Per-channel level meter (audio → visual)                        |
| `@audiorective/react`                    | The entire HUD (`EngineProvider`, `useEngine`, `useValue`)      |
| `@audiorective/playcanvas`               | `attach` (shared context + autostart), `bindPanner` (per-drone) |

**Open consideration — `@audiorective/threejs` coverage:** three.js renders the EQ and panning UI (a _controller_, no audio in that scene), so the `@audiorective/threejs` _bindings_ (`PannerAnchor`, `attach`) are not exercised by the merged app — PlayCanvas owns the world and the panners. This is a coverage regression versus today's two three.js demos. Recommendation: accept it (the panning widget is genuinely a control surface, and double-driving a panner from both renderers would be wrong). Flagged here for the reviewer to confirm.

## 3. The three renderers, one source of truth

```
                 ┌─────────────────────────── engine (one AudioContext) ───────────────────────────┐
                 │  Mixer: channels[], headphone, master, solo/mute resolution, metering loop        │
                 │  Channel ×6: source → EQ3 → fader → analyser → { Spatial(room) | StereoPan(phones)}│
                 │  Shared view state (Cells): selectedChannelId, dronePositions[], ui.hudOpen        │
                 └───────────────▲───────────────────────▲───────────────────────▲───────────────────┘
                                 │ observe/mutate         │ observe/mutate         │ observe/mutate
        ┌────────────────────────┴───────┐   ┌────────────┴───────────┐   ┌────────┴──────────────────┐
        │ PlayCanvas (world)             │   │ React (iPad HUD)        │   │ three.js (panning + EQ UI)│
        │ • livehouse + drones           │   │ • menu / channel strip  │   │ • selected-drone 3D pad   │
        │ • PA camera = AudioListener     │   │ • mixer / pads / toggles│   │ • drag → writes position  │
        │ • bindPanner per drone          │   │ useValue ↔ engine       │   │ • EQ curve view           │
        │ effect() reads position/select  │   └─────────────────────────┘   │ effect() reads engine     │
        └─────────────────────────────────┘                                 └───────────────────────────┘
```

- **One `AudioContext`**, created by `createEngine`. `attach(engine, pcApp)` installs it into PlayCanvas's SoundManager before any sound plays. The three.js widget creates **no** audio nodes and **no** `THREE.AudioListener` (which would call `THREE.AudioContext.setContext` and risk a context conflict) — it is purely a visual controller.
- **No state duplication, no back-channels.** Anything two views read or write lives on the engine as a `Cell`/`Param`. React reads with `useValue`, writes with `.value`/`.update`. Imperative renderers read with alien-signals `effect` and write with the same setters. This follows the established `selectedTrackId`/`ui` pattern in the current demos.

## 4. Audio architecture

### 4.1 Channel (one per drone)

`Channel extends AudioProcessor`. Source-agnostic: it accepts any node that produces output (a `StreamPlayer`, `SoundPlayer`, or synth — all expose `.output`). Signal chain:

```
source.output
  → EQ3 (low / mid / high)
  → fader gain          (volume Param, bound to GainNode.gain)
  → analyser (tap)      (AnalyserNode for the meter; does not alter signal)
  → split:
      ROOM path:      → Spatial.input → Spatial.panner (HRTF, position = drone) ─┐
      HEADPHONE path: → StereoPanner (pan = drone azimuth, fixed frame) ─────────┤
                                                                                  ↓
                                                            (see Mixer master routing)
```

- **params:** `volume` (SchedulableParam → fader gain), `eqLow` / `eqMid` / `eqHigh` (gains on EQ3), `muted` (Param<boolean>), `soloed` (Param<boolean>).
- **cells:** `position` (`Cell<{x,y,z}>` — the drone's intended world position, the shared source of truth), `level` (`Cell<number>` — meter value, written by the engine metering loop).
- Both paths always feed their respective master bus; the headphone toggle switches which **bus** is audible (see 4.3), so no per-channel send switching is needed. EQ and volume always apply (they precede the split).

### 4.2 Sources

- **StreamSource** (Guitar 1/2, Drums, Bass) — thin wrapper around `StreamPlayer`, one streamed stem each. Transport (play/stop) is driven globally when the gig "starts."
- **SamplerSource** (Sampler) — a `SoundPlayer` (polyphony > 1, `steal: "oldest"`). Plays a looping bed voice and fires one-shot pads (`boom`, `riser`, `airhorn`, `applause`) on demand. Pads triggerable from the HUD and from keyboard keys (e.g. `1`–`4`).
- **SynthSource** (Synth) — reuses a sequencer instrument (e.g. `StepSynth`/pad synth) driven by a small internal pattern/arp so it "plays" continuously. Sample-accurate (ctx clock).

**Sync (accepted tradeoff):** StreamPlayer stems run on independent HTMLMedia clocks and will drift relative to each other and to the ctx-clocked synth/sampler. The demo showcases mixing/spatial tech, not a locked performance. Mitigations: start all stems together; keep parts musically forgiving (pads/atmosphere absorb drift). Documented as a known limitation, not a bug to chase.

### 4.3 Mixer (master + routing + solo/mute + metering)

A `Mixer` (engine-level `AudioProcessor` or controller) owns:

- **Master routing.** Two summing buses: a **room bus** (channels' Spatial outputs → light **convolver reverb** → master gain) and a **headphone bus** (channels' StereoPanner outputs → master gain, dry). The global `headphone` toggle (`Param<boolean>`) crossfades/switches which bus is audible. Headphone ON = headphone bus only (no spatial, no distance, no reverb).
- **Headphone stereo "mixdown."** Each channel's StereoPanner `pan` is derived from the drone's horizontal position in a **fixed stage-center frame** (azimuth → −1..+1), independent of where the player walks/looks — so the monitor image is stable, the hallmark of "headphones, not the room." Computed per channel via `computed()`/`effect()` from its `position` cell.
- **Solo/mute resolution.** A `computed`/`effect` over all channels' `muted`/`soloed`: if any channel is soloed, only soloed channels' effective gain is non-zero; otherwise muted channels are silenced. Writes each channel's effective mix gain.
- **Metering loop.** A single RAF loop (engine-side) reads every channel's analyser (RMS/peak) and writes `channel.level` cells (~30 Hz). One loop for all channels, mirroring how `ParamSync` centralizes its RAF.
- **Master:** master gain (+ master meter for the Mixer panel's master strip).

### 4.4 Spatial model (single source of truth per drone)

- Each `Channel` owns one `Spatial`; its `panner.position` is the **realized** transform.
- `channel.position` (`Cell`) is the **intended** position the player sets — the shared source of truth across views. (Intent vs. realized transform — a deliberate split, not accidental duplication.)
- **PlayCanvas** reads `channel.position` via `effect`, places the drone entity there (plus a gentle idle hover/drift), and `bindPanner(app, droneEntity, channel.spatial.panner)` syncs the entity's world transform onto the panner each frame. PlayCanvas is the **only** writer of the panner.
- **three.js panning widget** reads `channel.position` to render the selected drone's dot; dragging writes `channel.position`. The change flows position → PlayCanvas entity → panner.
- **Listener:** the PA camera carries an `audiolistener` component → drives the shared `ctx.listener` as the player walks.

## 5. Renderer responsibilities

### 5.1 PlayCanvas — `LivehouseScene` (the world)

First-person controller (WASD + pointer-lock mouse-look), reused/adapted from `PCRoomScene`. Builds the venue + empty stage. For each channel: a drone entity (channel color), idle hover, position driven by `channel.position`, panner driven by `bindPanner`. Highlights the `selectedChannelId` drone (emissive bump). Releases pointer-lock when `ui.hudOpen` is true (reads the shared cell), so the mouse drives the HUD instead of the camera.

**Keep the 3D deliberately minimal.** This is a showcase of the audio + cross-framework state model, **not** of 3D engine power. Use built-in primitives only (boxes/spheres/planes, à la the existing demos), flat materials with a little emissive glow, basic lights. No imported models, no custom shaders, no post-processing, no texture work. Visual effort goes only as far as making drones/selection legible.

### 5.2 React — the iPad HUD

Toggleable (icon click or keystroke, e.g. `Tab`), semi-transparent over the live scene. State machine for the open panel is **React-local** (PlayCanvas/three.js don't need it); `ui.hudOpen` is **shared** (scene needs it for pointer-lock).

- **`ChannelMenu`** (bottom-left): drone list (Guitar 1, Guitar 2, Drums, Bass, Synth, Sampler) + a `Mixer` entry. Selecting a drone sets `selectedChannelId` and opens the channel strip; `Mixer` opens the mixer panel.
- **`ChannelStrip`** (compact, Cubase-style): compact `PAN ▸` and `EQ ▸` headers (open the big panels), `M`/`S`, fader with dB scale beside a segmented level meter, value readout, colored name.
- **`EqPanel`**: large graphic EQ (rendered with three.js per the tech requirement) — drag band points, writes `eqLow/Mid/High`.
- **`PanningPanel`**: hosts the three.js `PanningScene` for the selected drone.
- **`MixerPanel`**: content-width floating panel (each channel ~30px: fader + meter + M/S + colored name) + master strip. Not full-bleed.
- **`PadPanel`**: sampler one-shot pads (also bound to keyboard).
- **Top-right cluster** (always visible): `🎧 Phones` toggle + HUD `Hide`.

### 5.3 three.js — `PanningScene` (the 3D pan widget)

Adapted from the Sequencer's `SpatialScene`. A small orbit view: listener at center, the **selected** drone as a draggable dot (others faint, read-only, for context). Drag maps to a bounded world volume and writes `channel.position`. Pure visual three.js (`WebGLRenderer` + scene); **no audio nodes**. Reads `selectedChannelId` and positions via `effect`.

### 5.4 Keybindings (configurable)

All keyboard input goes through a single keymap rather than hardcoded key checks — keys are configurable; the user supplies the defaults.

- **`config/keymap.ts`** maps **actions** → key(s): `{ action: KeyCode | KeyCode[] }`. Actions cover at least: movement (`forward`/`back`/`left`/`right`), `toggleHud`, `toggleHeadphone`, and the sampler pads (`pad1`…`pad4` / `boom`/`riser`/`airhorn`/`applause`). An action may bind multiple keys (e.g. `W` and `ArrowUp`).
- **Defaults: TBD — to be provided by the user.** Until then the map holds placeholder defaults; the structure is fixed, the values are not.
- Consumers resolve through the keymap, never literal codes: the PlayCanvas controller (movement), the HUD (`toggleHud`/`toggleHeadphone`), and the sampler pads (trigger). A small `matchAction(event, keymap)` helper does the lookup so every consumer reads keys the same way.
- The keymap is plain config (no audio meaning) — it is **not** engine state. It can be imported directly, or swapped at runtime later if we ever add a settings UI (out of scope now).

## 6. Module layout

The showroom becomes a single-page app (drop the MPA picker + per-demo entries).

```
apps/showroom/
  index.html                      # single entry (the PA simulator)
  vite.config.ts                  # SPA (remove MPA rollup inputs)
  src/
    main.tsx
    config/
      keymap.ts                   # central action→key map + defaults (see §5.4)
    audio/
      engine.ts                   # createEngine: Mixer + 6 Channels + shared cells; EngineProvider/useEngine
      Mixer.ts                    # master buses, headphone routing, solo/mute, metering loop, reverb
      Channel.ts                  # source-agnostic channel strip (AudioProcessor)
      EQ3.ts                      # reused
      reverb.ts                   # convolver impulse for room ambience
      sources/
        StreamSource.ts           # StreamPlayer stem wrapper
        SynthSource.ts            # synth instrument + pattern (reuse sequencer instruments)
        SamplerSource.ts          # SoundPlayer: loop bed + pad one-shots
      sceneConfig.ts              # drone defs: id, label, color, default position, source kind
      tracks.ts                   # asset manifest loader (reused/extended)
    scene/
      LivehouseScene.ts           # PlayCanvas world (adapt PCRoomScene)
    panning/
      PanningScene.ts             # three.js pan widget (adapt SpatialScene)
    ui/
      App.tsx, Hud.tsx, ChannelMenu.tsx, ChannelStrip.tsx,
      EqPanel.tsx, PanningPanel.tsx, MixerPanel.tsx, PadPanel.tsx,
      Fader.tsx, Meter.tsx, HeadphoneToggle.tsx
  public/
    stems/   guitar1 guitar2 drums bass            # streamed stems (one song)
    sfx/     boom riser airhorn applause + loop bed # sampler
    ir/      room impulse response                  # reverb
```

**Removed:** `src/App.tsx` (picker), `src/examples/**`, the `sequencer/`, `spatial-room/`, `spatial-room-playcanvas/` html entry folders, `src/shared/audio/MusicPlayer.ts` (StreamPlayer is used directly). Reused/migrated: `EQ3`, the sequencer synth instruments, `SpatialScene` → `PanningScene`, `PCRoomScene` → `LivehouseScene`, `tracks` loader.

## 7. Audio assets (provided by the user)

The user supplies all audio. The app loads them via the asset manifest (`tracks.ts` extended); code references stable paths/keys and degrades gracefully if a file is missing (silent channel, no crash). Expected set:

- **4 instrument stems** (Guitar 1, Guitar 2, Drums, Bass) for the streamed channels.
- **Sampler** assets: a **looping bed** + one-shots (`boom`, `riser`, `airhorn`, `applause`).
- **One room impulse response** for the reverb (if omitted, fall back to a synthesized IR so the headphone contrast still works).

No asset sourcing on our side — just the manifest, loaders, and graceful-missing handling.

## 8. Testing strategy

Per the architecture rule — audio behaviors must run headless:

- **Channel:** EQ/volume/mute/solo affect the signal; path split routes correctly. No DOM.
- **Mixer:** headphone toggle switches buses; solo/mute resolution (any-solo → only-soloed); headphone stereo pan is position-derived and listener-independent; metering writes level cells.
- **Sources:** StreamSource transport, SamplerSource trigger/polyphony/steal, SynthSource pattern scheduling.
- **Spatial wiring:** writing `channel.position` reaches the panner via the render path (integration-level; PlayCanvas frame sync covered by `bindPanner`'s own tests).
- **UI:** thin — components read cells/params and call methods; covered by light React tests where valuable.

## 9. Out of scope (YAGNI)

- Recording/exporting the mix.
- More than 6 channels, channel add/remove, routing matrix.
- Aux sends beyond the single room-reverb bus.
- Per-channel EQ beyond 3 bands; compressors/dynamics.
- Mobile/touch controls (desktop keyboard + mouse first).
- Diegetic 3D tablet (decided against — overlay HUD).

## 10. Decisions captured

1. Cyber **audio-drone** theme; drones are the whole show (no human band); empty neon stage.
2. **6 channels:** Guitar 1, Guitar 2, Drums, Bass = StreamPlayer stems; Synth = synth source; Sampler = SoundPlayer (loop + key/pad one-shots).
3. **Unified spatial model:** one `Spatial` per channel; `position` cell = shared source of truth; PlayCanvas renders + `bindPanner`, three.js widget controls.
4. **Headphone = full dry mix (Option A)** but with a **stereo mixdown** (per-channel `StereoPanner` from fixed-frame azimuth); bypasses HRTF, distance, and a light **master room reverb**.
5. **iPad HUD:** toggleable, semi-transparent; bottom-left menu → compact Cubase-style channel strip → `[EQ]`/`[Panning]` open dedicated panels; `[Mixer]` → content-width compact mixer; `🎧 Phones` + `Hide` top-right.
6. **Meter** = per-channel `AnalyserNode` tap, centralized metering loop.
7. **Replace** all three existing showroom demos with this single app; update README/docs accordingly.
8. Renderers: **PlayCanvas** = world, **React** = HUD, **three.js** = EQ + panning controllers; one shared `AudioContext`; no audio state in any UI layer.
9. **Keybindings + audio paths configurable** via a single editable `apps/showroom/public/config.json` (`{ keybindings, audio }`), loaded at boot by `config/appConfig.ts` with typed defaults + graceful fallback. `matchAction` resolves all keyboard input; `engine.applyAudioConfig` points stems / decodes sampler bed+pads / swaps the reverb IR. Edit the file + refresh — no rebuild. (Supersedes the earlier `config/keymap.ts` and the hardcoded stem paths in `sceneConfig.ts`.)
10. **Minimal 3D** — primitives + flat/emissive materials only; not a 3D-engine showcase. Visual effort limited to legibility.
11. **Audio assets provided by the user**; our work is the manifest/loaders + graceful handling of a missing file.
12. **Second deliverable:** a "Designing Audio Apps" guide added to the audiorective skill, using this app as the worked example (see §11).

## 11. Skill enhancement — "Designing Audio Apps" guide (deliverable)

A new reference that teaches skill users _how to design a whole audio app_ (not just call the API). It captures the methodology this project followed, generalized, with this app as the running example.

**Where it lives.** `docs/designing-audio-apps.md`, symlinked into `skills/audiorective/references/designing-audio-apps.md` (the existing references are symlinks to `docs/*.md`), plus a pointer row in `skills/audiorective/SKILL.md` "What to read next" (e.g. _"Designing a whole audio app (not just one processor) → `references/designing-audio-apps.md`"_). The bundled/published skill is versioned, so this also implies a skill version bump when released.

**The methodology to teach (the arc of this thread):**

1. **Design collaboratively, find the gaps first.** Before code, pin down UX/features and interrogate the metaphor until the audio model is _honest_. Worked example: a literal mixing console sums to stereo, so a "3D pan" knob there is fake — switching the metaphor to **audio drones** made 3D spatialization literally true. Lesson: when the UI metaphor and the audio reality disagree, change the metaphor, not the audio.
2. **Map every feature to a primitive.** Turn the feature list into a coverage table (feature → `StreamPlayer`/`SoundPlayer`/`Spatial`/`Param`/`Cell`/…). Gaps and over-reach surface immediately. (Mirror of §2.)
3. **Decide state ownership up front.** The engine owns all audio state _and_ any view state shared across renderers (`Cell`/`Param`); UIs only observe and mutate. With multiple renderers (PlayCanvas + React + three.js), the engine is the single meeting point — no back-channels, no duplicated state. (Reinforces `architecture.md`; this app is the multi-renderer worked example.)
4. **Build the headless audio core first.** Implement and unit-test the entire audio graph — channels, buses, routing, scheduling, metering — with **no DOM and no renderer** (litmus: it runs in a browser-mode unit test). Only then layer renderers and UI on top. This is exactly the Phase 1 / Phase 2-3 split of the implementation plan.
5. **Choose the right source per role.** `StreamPlayer` for long-form/streamed parts, `SoundPlayer`/`Voice` for one-shots and loops, an `AudioProcessor` synth for generated parts — unified behind a source-agnostic channel strip. Note the tradeoffs (e.g. cross-source clock drift).
6. **Integrate renderers via the binding packages.** One `AudioContext`; `attach` to share it; `bindPanner`/`PannerAnchor` to drive panners from scene transforms; keep control-only views (the three.js widget) free of audio nodes.

**Authoring.** Written with the `superpowers:writing-skills` skill. Sequenced **last** (after the headless core exists), so the guide can point at real, tested code as its worked example. It is its own phase/plan in the implementation arc.
