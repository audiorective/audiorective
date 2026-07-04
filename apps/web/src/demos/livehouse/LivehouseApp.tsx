import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { App } from "./ui/App";
import { engine } from "./audio/engine";
import { loadAppConfig } from "./config/appConfig";

/**
 * Island entry for the Livehouse demo. Replaces the standalone `main.tsx`
 * bootstrap: Astro's runtime mounts this component, so instead of a top-level
 * `createRoot`, the pre-mount config work (load user config, then point the
 * audio engine at the stems/fx assets) happens in an effect and gates the
 * scene behind a ready flag. Matches the old order: load → applyAudioConfig → mount.
 */
export default function LivehouseApp() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadAppConfig().then((cfg) => {
      void engine.applyAudioConfig(cfg.audio);
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!ready) return <div style={loadingStyle}>Loading livehouse…</div>;
  return <App />;
}

const loadingStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#cde",
  fontFamily: "system-ui, sans-serif",
  fontSize: 14,
};
