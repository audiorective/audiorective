import { useEffect, useRef } from "react";
import { useEngine } from "../audio/engine";
import { SpatialScene } from "../scene/SpatialScene";

export function SpatialPanner() {
  const { tracks, selectedTrackId } = useEngine();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const scene = new SpatialScene({ tracks, selectedTrackId });
    scene.mount(container);
    return () => scene.dispose();
  }, [tracks, selectedTrackId]);

  return <div ref={containerRef} style={styles.container} />;
}

const styles = {
  container: {
    width: "100%",
    height: "100%",
    minHeight: 0,
    position: "relative" as const,
    background: "#0a0a0a",
  },
};
