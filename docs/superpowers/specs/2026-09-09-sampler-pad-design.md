# Sampler as a sample pad (Tone.Player replacement) — design

Source: https://github.com/audiorective/audiorective/issues/31

## Problem

A sample-pad app (single voice, last-trigger-wins, one-shot region) needs
region start, reverse, fade-on-cut, clock-scheduled volume, mute, a completion
signal, URL loading, a `BaseAudioContext` constructor, and a stable `output`
with `latency = 0`. `Sampler` with `polyphony: 1` already provides region
start (`trigger({ when, offset, duration })`), a `SchedulableParam` volume, a
hot-swappable `buffer`, a `BaseAudioContext` constructor, `output`, and
latency 0. Missing: reverse, fades, mute, and a completion signal that ignores
superseded hits.

## Decision

Extend `Sampler` and `Voice`. No new class. The pad is documented as
`Sampler` with `polyphony: 1`, `steal: "oldest"`, and a short `fadeOut`.

## Changes

### `Voice` — `fadeIn` / `fadeOut`

- `VoiceOptions.fadeIn?: number` and `VoiceOptions.fadeOut?: number`, seconds,
  default 0.
- When either fade is non-zero the voice always owns a `GainNode` (the unity
  shortcut only applies when there is nothing to ramp).
- `fadeIn`: every source start (`startSource`) ramps the gain linearly from 0
  to the voice volume over `fadeIn`, starting at the source's `when`.
- `fadeOut`, immediate `stop()`: the source and gain are released to ring out;
  the gain ramps linearly to 0 over `fadeOut` from now and the source stops at
  `now + fadeOut`. The voice is finished immediately for callers: `isPlaying`
  is false, `onEnded` callbacks and the pool's `onDone` fire synchronously.
  The ring-out nodes disconnect themselves when the source ends.
- `fadeOut`, scheduled `stop(when)`: the fade starts at `when` and the source
  stops at `when + fadeOut`; the voice finalizes via `onended` as today.
- `pause()` stays an immediate cut. Fades apply to start and stop only.

### `Sampler` — fade defaults, steal without a count blip, `reverse`, `mute`

- `SamplerOptions.fadeIn` / `fadeOut` are defaults passed to every voice;
  `TriggerOptions` (= `VoiceOptions`) can override per hit.
- Stealing pushes the new voice before stopping the victim, so
  `cells.activeVoices` never passes through 0 during a retrigger. For
  `polyphony: 1` the cell is the pad's completion signal: it is 1 while the
  latest hit plays and drops to 0 when that hit ends or is stopped. A
  superseded hit never produces a 1→0 edge on its own.
- `SamplerOptions.reverse?: boolean` and a `sampler.reverse` accessor. A
  reversed copy of `buffer` is built once and cached until `buffer` changes.
  `trigger({ offset, duration })` keeps measuring the region from the
  original buffer's start; the region is mapped onto the reversed copy.
- `SamplerOptions.mute?: boolean` and `params.mute: Param<boolean>`, driving
  a dedicated `GainNode` placed before the volume gain. Muting never touches
  the volume `AudioParam`, so queued volume automation survives.
- `output` stays the volume gain node.

### `loadAudioBuffer` / `AudioBufferCache`

Accept `BaseAudioContext` (an `OfflineAudioContext` can decode too), so the
same loading code serves live and `renderOffline` paths.

### Docs

- `docs/core.md`: new options, `params.mute`, `reverse`, fades on `Voice`.
- `docs/choosing-playback.md`: a "pad" recipe and a `Tone.Player` migration
  table.
- `CHANGELOG.md` Unreleased entries.

## Out of scope

dB volume (use `dbToGain` from `@audiorective/effects`), `BufferPlayer`
fades, a `Sampler.load(url)` convenience.
