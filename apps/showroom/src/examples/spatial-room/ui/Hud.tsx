import type { CSSProperties } from "react";
import { useValue } from "@audiorective/react";
import type { EngineState } from "@audiorective/core";
import { engine, useEngine } from "../audio/engine";

const overlayBase: CSSProperties = {
  position: "fixed",
  pointerEvents: "none",
  userSelect: "none",
};

export function Hud() {
  const { ui } = useEngine();
  const { popupOpen, cdHover } = useValue(ui);
  const engineState = useValue<EngineState>(engine.core.state);

  let hint: string;
  if (engineState !== "running") {
    hint = "Click anywhere to enable audio";
  } else if (popupOpen) {
    hint = "ESC or Close to return to the room";
  } else if (cdHover) {
    hint = "Click the CD player to open controls";
  } else {
    hint = "Click to look around — WASD to move — find the CD player";
  }

  return (
    <>
      {!popupOpen && (
        <div
          style={{
            ...overlayBase,
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "#ffffff",
            mixBlendMode: "difference",
            opacity: 0.85,
          }}
        />
      )}
      <div
        style={{
          ...overlayBase,
          bottom: 24,
          left: "50%",
          transform: "translateX(-50%)",
          padding: "8px 14px",
          background: "rgba(8, 10, 14, 0.55)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 6,
          fontSize: 13,
          letterSpacing: 0.2,
        }}
      >
        {hint}
      </div>
    </>
  );
}
