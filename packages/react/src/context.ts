import { createContext, useContext } from "react";
import type { AudioProcessor } from "@audiorective/signals";

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
