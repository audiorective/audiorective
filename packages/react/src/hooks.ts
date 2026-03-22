import { useState, useEffect, useMemo, useRef } from "react";
import { effect as alienEffect } from "alien-signals";
import { type Param, type AudioProcessor, type Computed } from "@audiorective/signals";

export function useValue<T>(param: Param<T>): T {
  const [value, setValue] = useState(() => param.value);

  useEffect(() => {
    const eff = alienEffect(() => {
      param.$.get();
      setValue(param.value);
    });
    return () => eff.stop();
  }, [param]);

  return value;
}

export function useComputed<T>(computed: Computed<T>): T {
  const [value, setValue] = useState(() => computed.get());

  useEffect(() => {
    const eff = alienEffect(() => {
      setValue(computed.get());
    });
    return () => eff.stop();
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
