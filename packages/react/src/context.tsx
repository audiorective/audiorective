import { createContext, useContext, useEffect, type ReactNode } from "react";
import { type AudioEngine } from "@audiorective/core";

export function createEngineContext<T extends { core: AudioEngine }>(engine: T) {
  const Context = createContext<T | null>(null);

  function AutoStartListener() {
    useEffect(() => engine.core.autoStart(document), []);
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
