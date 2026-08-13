import { App } from "./ui/App";

/**
 * Island entry for the step-sequencer demo. Replaces the standalone
 * `main.tsx` bootstrap: Astro's runtime mounts this component, so there is no
 * top-level `createRoot`. Everything else — `EngineProvider`, `autoStart`, the
 * module-scope engine — is unchanged from the standalone app.
 */
export default function SequencerApp() {
  return <App />;
}
