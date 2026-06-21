import { createEngine, cell, StreamPlayer, loadAudioBuffer } from "@audiorective/core";
import { createEngineContext } from "@audiorective/react";
import { MasterSequencer } from "../examples/sequencer/audio/MasterSequencer";
import { Channel } from "./Channel";
import { Mixer } from "./Mixer";
import { SynthSource } from "./sources/SynthSource";
import { SamplerSource, PAD_IDS } from "./sources/SamplerSource";
import { CHANNELS } from "./sceneConfig";
import type { SourceLike } from "./Channel";
import type { AudioConfig } from "../config/appConfig";

const SPATIAL_OPTS = { distanceModel: "inverse" as const, refDistance: 1.5, maxDistance: 25, rolloffFactor: 1.4 };

export interface UiState {
  hudOpen: boolean;
}

/** Build the whole PA-simulator audio engine. */
export function createPaEngine() {
  return createEngine((ctx) => {
    const transport = new MasterSequencer(ctx);
    const streams: StreamPlayer[] = [];
    const streamById: Record<string, StreamPlayer> = {};
    let sampler: SamplerSource | null = null;
    const channels: Channel[] = [];

    for (const def of CHANNELS) {
      let source: SourceLike;
      if (def.kind === "stream") {
        // src is set later from config.json via applyAudioConfig().
        const sp = new StreamPlayer(ctx, { loop: true });
        streams.push(sp);
        streamById[def.id] = sp;
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
      /**
       * Apply user-editable audio paths (from config.json): point each stream
       * channel at its stem, decode the sampler bed + pads, and swap the reverb IR.
       * Each asset is loaded independently and missing files are skipped (silent),
       * never throwing.
       */
      async applyAudioConfig(audio: AudioConfig): Promise<void> {
        for (const [id, sp] of Object.entries(streamById)) {
          const url = audio.stems[id];
          if (url) sp.src = url;
        }
        const decode = async (url: string | undefined): Promise<AudioBuffer | null> => {
          if (!url) return null;
          try {
            return await loadAudioBuffer(ctx, url);
          } catch {
            return null;
          }
        };
        if (capturedSampler) {
          const bed = await decode(audio.sampler.bed);
          if (bed) capturedSampler.setBedBuffer(bed);
          for (const id of PAD_IDS) {
            const buf = await decode(audio.sampler[id]);
            if (buf) capturedSampler.setPadBuffer(id, buf);
          }
        }
        const ir = await decode(audio.reverbIR);
        if (ir) mixer.setReverbBuffer(ir);
      },
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
