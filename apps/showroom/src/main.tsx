import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import { engine } from "./audio/engine";
import { loadAppConfig } from "./config/appConfig";

// Load user config (keybindings + audio paths) before mounting, so the active
// keymap is in place and stems/sampler/reverb assets start loading.
void loadAppConfig().then((cfg) => {
  void engine.applyAudioConfig(cfg.audio);
  createRoot(document.getElementById("root")!).render(<App />);
});
