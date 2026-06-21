export interface RoomBounds {
  halfW: number;
  halfD: number;
  margin: number;
}

/** Clamp a horizontal (x, z) position to stay inside the room walls. */
export function clampToRoom(x: number, z: number, b: RoomBounds): { x: number; z: number } {
  const limX = b.halfW - b.margin;
  const limZ = b.halfD - b.margin;
  return {
    x: Math.max(-limX, Math.min(limX, x)),
    z: Math.max(-limZ, Math.min(limZ, z)),
  };
}
