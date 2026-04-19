import * as THREE from "three";
import { AudioEngine } from "@audiorective/core";

type EngineOrWrapper = AudioEngine | { core: AudioEngine };

export function attach(engine: EngineOrWrapper, renderer: THREE.WebGLRenderer): () => void {
  const core = "core" in engine ? engine.core : engine;
  THREE.AudioContext.setContext(core.context);
  return core.autoStart(renderer.domElement);
}
