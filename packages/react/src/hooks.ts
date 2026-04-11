import { useState, useEffect } from "react";
import { effect as alienEffect } from "alien-signals";
import { type Readable, type ComputedAccessor } from "@audiorective/core";

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
