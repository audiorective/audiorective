import type { CSSProperties } from "react";
import { useValue } from "@audiorective/react";
import type { EngineState } from "@audiorective/core";
import { EngineProvider, engine } from "../audio/engine";
import { SceneHost } from "./SceneHost";

function Hint() {
  const state = useValue<EngineState>(engine.core.state);
  const text = state !== "running" ? "Click to enter the livehouse (enables audio)" : "WASD to move · click a drone to select it";
  return <div style={hintStyle}>{text}</div>;
}

export function App() {
  return (
    <EngineProvider>
      <SceneHost />
      <Hint />
    </EngineProvider>
  );
}

const hintStyle: CSSProperties = {
  position: "fixed",
  bottom: 24,
  left: "50%",
  transform: "translateX(-50%)",
  padding: "8px 14px",
  background: "rgba(8,10,14,0.55)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 6,
  color: "#cde",
  fontFamily: "system-ui, sans-serif",
  fontSize: 13,
  pointerEvents: "none",
  userSelect: "none",
};
