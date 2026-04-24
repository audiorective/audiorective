import { useValue } from "@audiorective/react";
import { useEngine } from "../audio/engine";
import type { Track } from "../audio/trackConfig";
import { TrackRow } from "./TrackRow";

export function TrackMatrix() {
  const { masterSeq, tracks, selectedTrackId } = useEngine();
  const currentStep = useValue(masterSeq.params.currentStep);
  const selectedId = useValue(selectedTrackId);

  return (
    <div style={styles.matrix}>
      {tracks.map((track: Track) => (
        <TrackRow
          key={track.id}
          track={track}
          currentStep={currentStep}
          isSelected={selectedId === track.id}
          onSelect={() => {
            selectedTrackId.value = track.id;
          }}
        />
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
