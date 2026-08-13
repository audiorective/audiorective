import { useEffect, useRef } from "react";
import { PanningScene } from "../panning/PanningScene";

export function PanningPanel() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const scene = new PanningScene();
    scene.mount(ref.current);
    return () => scene.dispose();
  }, []);
  return <div ref={ref} style={{ width: "100%", height: "100%", minHeight: 0 }} />;
}
