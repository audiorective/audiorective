import { useValue } from "@audiorective/react";
import { useEngine } from "../audio/engine";
import type { Track } from "../audio/trackConfig";
import { TrackRow } from "./TrackRow";

interface TrackMatrixProps {
  selectedTrack: Track;
  onSelectTrack: (track: Track) => void;
}

export function TrackMatrix({ selectedTrack, onSelectTrack }: TrackMatrixProps) {
  const { masterSeq, tracks } = useEngine();
  const currentStep = useValue(masterSeq.currentStep);

  return (
    <div style={styles.matrix}>
      {tracks.map((track: Track) => (
        <TrackRow key={track.id} track={track} currentStep={currentStep} isSelected={selectedTrack === track} onSelect={() => onSelectTrack(track)} />
      ))}
    </div>
  );
}

const styles = {
  matrix: {
    background: "#111",
    borderRadius: "8px",
    border: "1px solid #1e1e1e",
    overflow: "hidden",
  },
};
