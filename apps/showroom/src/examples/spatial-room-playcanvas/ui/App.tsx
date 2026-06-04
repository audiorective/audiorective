import { EngineProvider } from "../audio/engine";
import { SceneHost } from "./SceneHost";
import { Hud } from "./Hud";
import { PlayerPopup } from "./PlayerPopup";

export function App() {
  return (
    <EngineProvider>
      <SceneHost />
      <Hud />
      <PlayerPopup />
    </EngineProvider>
  );
}
