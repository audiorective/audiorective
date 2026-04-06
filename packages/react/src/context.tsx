import { createContext, useContext, useEffect, Suspense, type ReactNode } from "react";
import { effect as alienEffect } from "alien-signals";
import { type AudioProcessor, type AudioEngine } from "@audiorective/core";

export function createProcessorContext<T extends AudioProcessor>() {
  const Context = createContext<T | null>(null);

  function useProcessor(): T {
    const processor = useContext(Context);
    if (!processor) {
      throw new Error("useProcessor must be used within a Provider");
    }
    return processor;
  }

  return {
    Provider: Context.Provider,
    useProcessor,
  };
}

export function createEngineContext<T extends { core: AudioEngine }>(engine: T) {
  const Context = createContext<T | null>(null);

  function EngineGate({ children }: { children: ReactNode }) {
    if (engine.core.state() !== "running") {
      throw engine.core.untilReady();
    }
    return <Context.Provider value={engine}>{children}</Context.Provider>;
  }

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

  function EngineProvider({ fallback, autoStart, children }: { fallback?: ReactNode; autoStart?: boolean; children: ReactNode }) {
    const shouldAutoStart = autoStart ?? fallback === undefined;
    const autoStartEl = shouldAutoStart ? <AutoStartListener /> : null;

    if (fallback !== undefined) {
      return (
        <>
          {autoStartEl}
          <Suspense fallback={fallback}>
            <EngineGate>{children}</EngineGate>
          </Suspense>
        </>
      );
    }

    return (
      <Context.Provider value={engine}>
        {autoStartEl}
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
