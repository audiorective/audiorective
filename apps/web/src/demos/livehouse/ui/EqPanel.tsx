import { useEffect, useRef } from "react";
import { EqScene } from "../eq/EqScene";

export function EqPanel() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const scene = new EqScene();
    scene.mount(ref.current);
    return () => scene.dispose();
  }, []);
  return <div ref={ref} style={{ width: "100%", height: "100%", minHeight: 0 }} />;
}
