import Icon from "../../components/ui/Icon";
import type { VoiceCapturePhase } from "./useVoiceCapture";

interface VoiceCaptureButtonProps {
  phase: VoiceCapturePhase;
  disabled: boolean;
  onStart: () => void;
  onStop: () => void;
}

const BUSY_PHASES: VoiceCapturePhase[] = [
  "starting",
  "stopping",
  "transcribing",
  "cancelling",
];

/**
 * Toggles a voice-capture session: mic to start, stop-square to stop and
 * hand the recording off for transcription. Sits in `EditorPane`'s action
 * row next to the lock/trash icon buttons, matching their exact pattern.
 */
function VoiceCaptureButton({
  phase,
  disabled,
  onStart,
  onStop,
}: VoiceCaptureButtonProps) {
  const isRecording = phase === "recording";
  const isBusy = BUSY_PHASES.includes(phase);
  const label = isRecording ? "Parar gravação" : "Ditar nota";

  return (
    <button
      className="icon-action voice-capture-button"
      type="button"
      aria-label={label}
      aria-pressed={isRecording}
      title={label}
      data-tooltip={label}
      disabled={disabled || isBusy}
      onClick={isRecording ? onStop : onStart}
    >
      <Icon name={isRecording ? "square" : "mic"} />
    </button>
  );
}

export default VoiceCaptureButton;
