import { useEffect, useRef } from "react";
import { PCRoomScene } from "../scene/PCRoomScene";

export function SceneHost() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    const scene = new PCRoomScene(hostRef.current);
    return () => scene.dispose();
  }, []);

  return <div ref={hostRef} style={{ position: "fixed", inset: 0 }} />;
}
