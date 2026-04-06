import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { effect as alienEffect } from "alien-signals";
import { type Param, type AudioProcessor, type Readable, type ComputedAccessor } from "@audiorective/core";

export function useValue<T>(source: Readable<T>): T {
  const [value, setValue] = useState(() => source.value);

  useEffect(() => {
    const stop = alienEffect(() => {
      source.$();
      setValue(source.value);
    });
    return () => stop();
  }, [source]);

  return value;
}

export function useComputed<T>(computed: ComputedAccessor<T>): T {
  const [value, setValue] = useState(() => computed());

  useEffect(() => {
    const stop = alienEffect(() => {
      setValue(computed());
    });
    return () => stop();
  }, [computed]);

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

export function useParam<T>(param: Param<T>): [value: T, setValue: (v: T) => void] {
  const value = useValue(param);
  const setValue = useCallback(
    (v: T) => {
      param.value = v;
    },
    [param],
  );
  return [value, setValue];
}
