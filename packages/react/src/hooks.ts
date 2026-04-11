import { useState, useEffect, useMemo, useRef } from "react";
import { effect as alienEffect } from "alien-signals";
import { type AudioProcessor, type Readable, type ComputedAccessor } from "@audiorective/core";

export function useValue<T>(source: Readable<T>): T;
export function useValue<T>(source: ComputedAccessor<T>): T;
export function useValue<T>(source: Readable<T> | ComputedAccessor<T>): T {
  const [value, setValue] = useState(() => (typeof source === "function" ? source() : source.value));

  useEffect(() => {
    const stop = alienEffect(() => {
      if (typeof source === "function") {
        setValue(source());
      } else {
        source.$();
        setValue(source.value);
      }
    });
    return () => stop();
  }, [source]);

  return value;
}

export function useProcessor<T extends AudioProcessor>(factory: () => T, deps: unknown[]): T {
  const ref = useRef<T | null>(null);

  const processor = useMemo(() => {
    if (ref.current) {
      ref.current.destroy();
    }
    const p = factory();
    ref.current = p;
    return p;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    return () => {
      if (ref.current) {
        ref.current.destroy();
        ref.current = null;
      }
    };
  }, []);

  return processor;
}
