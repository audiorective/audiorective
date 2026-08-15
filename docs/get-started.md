---
title: Get Started
---

## Install the skill

audiorective ships as an agent skill so LLMs can build with it correctly out of the box.

### Any agent (Claude Code, Cursor, OpenCode, Cline, …)

Install with the [Vercel skills CLI](https://github.com/vercel-labs/skills):

```sh
npx skills add audiorective/audiorective
```

The CLI auto-detects whichever agent you have installed and writes the skill into the right place.

### Claude Code plugin

audiorective also ships as a [Claude Code plugin](https://code.claude.com/docs/en/plugins). Add this repo as a marketplace, then install the plugin from it.

```sh
/plugin marketplace add audiorective/audiorective
/plugin install audiorective@audiorective
```

## Start crafting

Install the core package:

```sh
pnpm add @audiorective/core
```

Here's a minimal processor that owns a gain node and exposes it as a schedulable, reactive param:

```typescript
import { AudioProcessor, Param, SchedulableParam } from "@audiorective/core";

class Synth extends AudioProcessor<{
  volume: SchedulableParam;
  bpm: Param<number>;
}> {
  private readonly _gain: GainNode;

  constructor(ctx: AudioContext) {
    const gain = new GainNode(ctx);
    super(ctx, ({ param }) => ({
      params: {
        volume: param({ default: 0.5, bind: gain.gain }),
        bpm: param({ default: 120 }),
      },
    }));
    this._gain = gain;
  }

  get output() {
    return this._gain;
  }
}

const ctx = new AudioContext();
const synth = new Synth(ctx);
synth.output.connect(ctx.destination);

synth.params.volume.value = 0.8;
synth.params.volume.linearRampToValueAtTime(0, ctx.currentTime + 2);
```

See [Core](/docs/core) for the full API reference.

Sequencing something? Transport, tempo, and look-ahead scheduling live in [`@audiorective/clock`](/docs/clock).
