import { createEngine, cell, StreamPlayer, loadAudioBuffer } from "@audiorective/core";
import { createEngineContext } from "@audiorective/react";
import { Channel } from "./Channel";
import { Mixer } from "./Mixer";
import { SamplerSource } from "./sources/SamplerSource";
import { CHANNELS, FX_TARGET_CHANNEL } from "./sceneConfig";
import type { AudioConfig } from "../config/appConfig";

const SPATIAL_OPTS = { distanceModel: "inverse" as const, refDistance: 1.5, maxDistance: 25, rolloffFactor: 1.4 };

export interface UiState {
  hudOpen: boolean;
}

/** Build the whole PA-simulator audio engine. */
export function createPaEngine() {
  return createEngine((ctx) => {
    const streams: StreamPlayer[] = [];
    const streamById: Record<string, StreamPlayer> = {};
    const channels: Channel[] = [];

    for (const def of CHANNELS) {
      // src is set later from config.json via applyAudioConfig().
      const sp = new StreamPlayer(ctx, { loop: true });
      streams.push(sp);
      streamById[def.id] = sp;
      channels.push(new Channel(ctx, { id: def.id, label: def.label, color: def.color, source: sp, position: def.position, spatial: SPATIAL_OPTS }));
    }

    // The FX sampler isn't its own channel — its pads are Vox content triggered by
    // hand. Route its output into the Vox channel's input so it shares Vox's EQ,
    // fader, spatial position, and panning.
    const sampler = new SamplerSource(ctx);
    const fxTarget = channels.find((c) => c.id === FX_TARGET_CHANNEL);
    if (fxTarget) sampler.output.connect(fxTarget.eq.input);

    const mixer = new Mixer(ctx, channels);
    const selectedChannelId = cell<string>(channels[0].id);
    const ui = cell<UiState>({ hudOpen: false });

    return {
      mixer,
      channels,
      sampler,
      selectedChannelId,
      ui,
      /**
       * Apply user-editable audio from config.json: point each stream channel at
       * its stem, decode the FX pads, and swap the reverb IR + amount. Each asset is
       * loaded independently and missing files are skipped (silent), never throwing.
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
        for (const pad of audio.fx) {
          const buf = await decode(pad.url);
          if (buf) sampler.setPadBuffer(pad.id, buf);
        }
        const ir = await decode(audio.reverbIR);
        if (ir) mixer.setReverbBuffer(ir);
        if (typeof audio.reverb === "number") mixer.setReverbWet(audio.reverb);
      },
      /** Start the gig: play all stems + metering. */
      start(): void {
        for (const s of streams) void s.play();
        mixer.startMetering();
      },
      /** Stop the gig. */
      stop(): void {
        for (const s of streams) s.pause();
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
