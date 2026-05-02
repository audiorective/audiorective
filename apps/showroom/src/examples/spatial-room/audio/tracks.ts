export interface Track {
  title: string;
  artist?: string;
  src: string;
}

export async function loadTracksJson(url = "/tracks/tracks.json"): Promise<Track[]> {
  try {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.filter((t): t is Track => t && typeof t === "object" && typeof t.title === "string" && typeof t.src === "string");
  } catch {
    return [];
  }
}
