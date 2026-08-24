export class EngineEnvironmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineEnvironmentError";
  }
}

/** Internal — not exported from the package index. */
export function assertAudioContextAvailable(): void {
  if (typeof AudioContext !== "undefined") return;
  throw new EngineEnvironmentError(
    typeof window === "undefined"
      ? "createEngine() is client-only: this environment has no AudioContext (a server or build-time render). " +
        "audiorective does not run under SSR — render the audio subtree client-only " +
        "(next/dynamic with ssr: false, Astro client:only) so its modules are never evaluated on the server. " +
        "See the docs guide on server-rendered frameworks."
      : "createEngine() found no AudioContext constructor in this environment (a DOM without Web Audio, e.g. jsdom). " +
        "Pass a context explicitly — createEngine(setup, { context }) — or run in a browser.",
  );
}
