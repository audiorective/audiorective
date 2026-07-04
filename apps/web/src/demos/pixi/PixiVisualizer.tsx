import { useEffect, useRef } from "react";
import { mountPixi } from "./main";

export default function PixiVisualizer() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    let dispose = () => {};
    let alive = true;
    mountPixi(ref.current).then((d) => {
      if (alive) dispose = d;
      else d();
    });
    return () => {
      alive = false;
      dispose();
    };
  }, []);
  return <div ref={ref} style={{ width: "100%", height: "100dvh" }} />;
}
