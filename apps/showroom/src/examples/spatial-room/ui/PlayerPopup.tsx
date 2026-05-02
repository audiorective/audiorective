import { useEffect } from "react";
import type { CSSProperties } from "react";
import { useValue } from "@audiorective/react";
import { engine, useEngine } from "../audio/engine";

function fmtTime(t: number): string {
  if (!Number.isFinite(t) || t < 0) return "0:00";
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function PlayerPopup() {
  const { player, ui } = useEngine();
  const { popupOpen } = useValue(ui);
  const transport = useValue(player.cells.transport);
  const tracks = useValue(player.cells.tracks);
  const masterVolume = useValue(player.params.masterVolume);
  const eqLow = useValue(player.params.eqLow);
  const eqMid = useValue(player.params.eqMid);
  const eqHigh = useValue(player.params.eqHigh);

  useEffect(() => {
    if (!popupOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        engine.ui.update((d) => {
          d.popupOpen = false;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [popupOpen]);

  if (!popupOpen) return null;

  const current = tracks[transport.currentTrackIndex];
  const close = () => {
    engine.ui.update((d) => {
      d.popupOpen = false;
    });
  };
  const togglePlay = () => {
    if (transport.isPlaying) player.pause();
    else void player.play();
  };

  const noTracks = tracks.length === 0;
  const seekMax = Number.isFinite(transport.duration) ? transport.duration : 0;
  const seekDisabled = !current || !Number.isFinite(transport.duration);

  return (
    <>
      <div
        onClick={close}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(3px)",
          zIndex: 10,
        }}
      />
      <div
        role="dialog"
        aria-label="Music player"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 420,
          maxWidth: "92vw",
          background: "#15151b",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 10,
          padding: 20,
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
          zIndex: 11,
          color: "#eaeaea",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.55, textTransform: "uppercase", letterSpacing: 1 }}>Now playing</div>
            <div style={{ fontSize: 18, fontWeight: 600, marginTop: 2 }}>{current?.title ?? "(no tracks)"}</div>
            {current?.artist && <div style={{ fontSize: 13, opacity: 0.7, marginTop: 2 }}>{current.artist}</div>}
          </div>
          <button onClick={close} style={btnStyle("ghost")}>
            ✕
          </button>
        </div>

        {noTracks && (
          <div style={{ marginTop: 14, fontSize: 12, opacity: 0.7, lineHeight: 1.5 }}>
            Drop audio files into <code>public/tracks/</code> and list them in <code>public/tracks/tracks.json</code> to start playing.
          </div>
        )}

        {/* Transport */}
        <div style={{ marginTop: 18, display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => player.prev()} disabled={tracks.length < 2} style={btnStyle("default")} aria-label="Previous">
            ⏮
          </button>
          <button onClick={togglePlay} disabled={noTracks} style={btnStyle("primary")} aria-label={transport.isPlaying ? "Pause" : "Play"}>
            {transport.isPlaying ? "⏸ Pause" : "▶ Play"}
          </button>
          <button onClick={() => player.next()} disabled={tracks.length < 2} style={btnStyle("default")} aria-label="Next">
            ⏭
          </button>
        </div>

        {/* Seek */}
        <div style={{ marginTop: 18 }}>
          <input
            type="range"
            min={0}
            max={seekMax}
            step={0.1}
            value={Math.min(transport.currentTime, seekMax)}
            onChange={(e) => player.seek(+e.target.value)}
            disabled={seekDisabled}
            style={{ width: "100%" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, opacity: 0.6 }}>
            <span>{fmtTime(transport.currentTime)}</span>
            <span>{fmtTime(transport.duration)}</span>
          </div>
        </div>

        {/* Volume */}
        <Slider
          label="Volume"
          value={masterVolume}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => {
            player.params.masterVolume.value = v;
          }}
          format={(v) => `${Math.round(v * 100)}%`}
        />

        {/* EQ */}
        <div
          style={{
            marginTop: 18,
            paddingTop: 14,
            borderTop: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div style={{ fontSize: 11, opacity: 0.55, textTransform: "uppercase", letterSpacing: 1 }}>3-band EQ</div>
          <Slider
            label="Low (250 Hz)"
            value={eqLow}
            min={-12}
            max={12}
            step={0.1}
            onChange={(v) => {
              player.params.eqLow.value = v;
            }}
            format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} dB`}
          />
          <Slider
            label="Mid (1 kHz)"
            value={eqMid}
            min={-12}
            max={12}
            step={0.1}
            onChange={(v) => {
              player.params.eqMid.value = v;
            }}
            format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} dB`}
          />
          <Slider
            label="High (4 kHz)"
            value={eqHigh}
            min={-12}
            max={12}
            step={0.1}
            onChange={(v) => {
              player.params.eqHigh.value = v;
            }}
            format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} dB`}
          />
        </div>
      </div>
    </>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
}) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
        <span style={{ opacity: 0.85 }}>{label}</span>
        <span style={{ opacity: 0.6, fontVariantNumeric: "tabular-nums" }}>{format(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} style={{ width: "100%" }} />
    </div>
  );
}

function btnStyle(variant: "default" | "primary" | "ghost"): CSSProperties {
  const base: CSSProperties = {
    padding: variant === "ghost" ? "4px 8px" : "8px 14px",
    borderRadius: 6,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "#eaeaea",
    cursor: "pointer",
    fontSize: 14,
    fontFamily: "inherit",
  };
  if (variant === "primary") {
    return { ...base, background: "#3b82f6", borderColor: "#3b82f6", flex: 1 };
  }
  if (variant === "ghost") {
    return { ...base, background: "transparent", border: "none", opacity: 0.7 };
  }
  return base;
}
