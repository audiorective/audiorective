import { useEffect, useRef, useState, type ReactNode, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

interface Pos {
  x: number;
  y: number;
}

function loadPos(id: string, fallback: Pos): Pos {
  try {
    const s = localStorage.getItem(`pa-panel:${id}`);
    if (s) {
      const p = JSON.parse(s) as Pos;
      if (typeof p.x === "number" && typeof p.y === "number") return p;
    }
  } catch {
    // ignore
  }
  return fallback;
}

/** Floating panel draggable by its header; remembers its last position in localStorage. */
export function DraggablePanel({
  id,
  title,
  onClose,
  defaultPos,
  width = 360,
  height = 300,
  children,
}: {
  id: string;
  title: string;
  onClose: () => void;
  defaultPos: Pos;
  width?: number;
  height?: number;
  children: ReactNode;
}) {
  const [pos, setPos] = useState<Pos>(() => loadPos(id, defaultPos));
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(`pa-panel:${id}`, JSON.stringify(pos));
    } catch {
      // ignore
    }
  }, [id, pos]);

  const onPointerDown = (e: ReactPointerEvent) => {
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (!drag.current) return;
    const x = Math.max(0, Math.min(window.innerWidth - 60, e.clientX - drag.current.dx));
    const y = Math.max(0, Math.min(window.innerHeight - 30, e.clientY - drag.current.dy));
    setPos({ x, y });
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    drag.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };

  return (
    <div style={{ ...panel, left: pos.x, top: pos.y, width, height }}>
      <div style={header} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
        <span style={{ color: "#22d3ee", fontSize: 12 }}>{title}</span>
        <button style={closeBtn} onPointerDown={(e) => e.stopPropagation()} onClick={onClose}>
          ✕
        </button>
      </div>
      <div style={body}>{children}</div>
    </div>
  );
}

const panel: CSSProperties = {
  position: "fixed",
  background: "rgba(8,10,18,0.92)",
  border: "1px solid #22d3ee66",
  borderRadius: 8,
  display: "flex",
  flexDirection: "column",
  pointerEvents: "auto",
  fontFamily: "system-ui, sans-serif",
  boxShadow: "0 8px 28px rgba(0,0,0,0.5)",
};
const header: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "6px 10px",
  cursor: "move",
  borderBottom: "1px solid #ffffff14",
  touchAction: "none",
};
const closeBtn: CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#9be",
  cursor: "pointer",
  fontSize: 13,
};
const body: CSSProperties = { flex: 1, minHeight: 0, padding: 8 };
