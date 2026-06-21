import { createEngine, cell, StreamPlayer } from "@audiorective/core";
import { createEngineContext } from "@audiorective/react";
import { MasterSequencer } from "../examples/sequencer/audio/MasterSequencer";
import { Channel } from "./Channel";
import { Mixer } from "./Mixer";
import { SynthSource } from "./sources/SynthSource";
import { SamplerSource } from "./sources/SamplerSource";
import { CHANNELS } from "./sceneConfig";
import type { SourceLike } from "./Channel";

const SPATIAL_OPTS = { distanceModel: "inverse" as const, refDistance: 1.5, maxDistance: 25, rolloffFactor: 1.4 };

export interface UiState {
  hudOpen: boolean;
}

/** Build the whole PA-simulator audio engine. */
export function createPaEngine() {
  return createEngine((ctx) => {
    const transport = new MasterSequencer(ctx);
    const streams: StreamPlayer[] = [];
    let sampler: SamplerSource | null = null;
    const channels: Channel[] = [];

    for (const def of CHANNELS) {
      let source: SourceLike;
      if (def.kind === "stream") {
        const sp = new StreamPlayer(ctx, { src: def.src, loop: true });
        streams.push(sp);
        source = sp;
      } else if (def.kind === "synth") {
        source = new SynthSource(ctx, transport);
      } else {
        sampler = new SamplerSource(ctx);
        source = sampler;
      }
      channels.push(new Channel(ctx, { id: def.id, label: def.label, color: def.color, source, position: def.position, spatial: SPATIAL_OPTS }));
    }

    const mixer = new Mixer(ctx, channels);
    const selectedChannelId = cell<string>(channels[0].id);
    const ui = cell<UiState>({ hudOpen: false });

    const capturedSampler = sampler;
    return {
      transport,
      mixer,
      channels,
      sampler,
      selectedChannelId,
      ui,
      /** Start the gig: transport (synth), stems, sampler bed, and metering. */
      start(): void {
        transport.start();
        for (const s of streams) void s.play();
        capturedSampler?.startBed();
        mixer.startMetering();
      },
      /** Stop the gig. */
      stop(): void {
        transport.stop();
        for (const s of streams) s.pause();
        capturedSampler?.stopBed();
      },
    };
  });
}

export const engine = createPaEngine();

export const { EngineProvider, useEngine } = createEngineContext(engine);

declare global {
  interface Window {
    __paEngine?: typeof engine;
  }
}
if (typeof window !== "undefined") {
  window.__paEngine = engine;
}
