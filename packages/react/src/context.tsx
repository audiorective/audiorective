import { createContext, useContext, useEffect, type ReactNode } from "react";
import { effect as alienEffect } from "alien-signals";
import { type AudioEngine } from "@audiorective/core";

export function createEngineContext<T extends { core: AudioEngine }>(engine: T) {
  const Context = createContext<T | null>(null);

  function AutoStartListener() {
    useEffect(() => {
      let gestureCleanup: (() => void) | null = null;

      function armListeners() {
        const handler = () => {
          engine.core.start();
          disarmListeners();
        };

        document.addEventListener("click", handler);
        document.addEventListener("keydown", handler);
        document.addEventListener("touchstart", handler);

        gestureCleanup = () => {
          document.removeEventListener("click", handler);
          document.removeEventListener("keydown", handler);
          document.removeEventListener("touchstart", handler);
          gestureCleanup = null;
        };
      }

      function disarmListeners() {
        gestureCleanup?.();
      }

      const stop = alienEffect(() => {
        const s = engine.core.state();
        if (s !== "running") {
          if (!gestureCleanup) armListeners();
        } else {
          disarmListeners();
        }
      });

      return () => {
        stop();
        disarmListeners();
      };
    }, []);

    return null;
  }

  function EngineProvider({ autoStart = true, children }: { autoStart?: boolean; children: ReactNode }) {
    return (
      <Context.Provider value={engine}>
        {autoStart && <AutoStartListener />}
        {children}
      </Context.Provider>
    );
  }

  function useEngine(): T {
    const ctx = useContext(Context);
    if (!ctx) {
      throw new Error("useEngine must be used within an EngineProvider");
    }
    return ctx;
  }

  return { EngineProvider, useEngine };
}
