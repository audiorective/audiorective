import { useEffect, useRef } from "react";
import { RoomScene } from "../scene/RoomScene";

export function SceneHost() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    const scene = new RoomScene(hostRef.current);
    return () => scene.dispose();
  }, []);

  return <div ref={hostRef} style={{ position: "fixed", inset: 0 }} />;
}
