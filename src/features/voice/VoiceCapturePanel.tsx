import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import Icon from "../../components/ui/Icon";
import type { VoiceCapturePhase, VoiceCaptureState } from "./useVoiceCapture";
import { parseVoiceCommand } from "./voiceCommandParser";

interface VoiceCapturePanelProps {
  voiceState: VoiceCaptureState;
  /** False when the completed session belongs to a note that isn't the one currently open. */
  canInsertHere: boolean;
  onStop: () => void;
  onCancel: () => void;
  onInsert: () => void;
  onDismiss: () => void;
}

const DEFAULT_MAX_DURATION_SECS = 600;

const RECORDING_PHASES: VoiceCapturePhase[] = ["starting", "recording"];

const LEVEL_BAR_COUNT = 20;
// Caps how often incoming mic-level events repaint the bars. The backend can
// emit these far faster than the eye needs; this keeps the animation smooth
// without re-rendering on every single audio callback.
const LEVEL_BAR_MIN_INTERVAL_MS = 80;

interface LevelBar {
  id: number;
  level: number;
}

function emptyLevelBars(): LevelBar[] {
  return Array.from({ length: LEVEL_BAR_COUNT }, (_, id) => ({
    id: -id,
    level: 0,
  }));
}

// RMS amplitude of normal speech typically sits far below 1.0 (often
// 0.01-0.1), so mapping it to bar height linearly barely moves the bars —
// only shouting gets close to clipping. Ears (and eyes, for a level meter)
// perceive loudness roughly logarithmically, so this converts to decibels
// and maps a speech-sized dB range onto the full 0-1 bar height instead.
const METER_FLOOR_DB = -50;
const METER_CEILING_DB = -6;
const MIN_BAR_HEIGHT = 0.05;

function levelToBarHeight(rms: number): number {
  if (rms <= 0) {
    return MIN_BAR_HEIGHT;
  }
  const decibels = 20 * Math.log10(rms);
  const normalized =
    (decibels - METER_FLOOR_DB) / (METER_CEILING_DB - METER_FLOOR_DB);
  return Math.min(Math.max(normalized, MIN_BAR_HEIGHT), 1);
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function VoiceCapturePanel({
  voiceState,
  canInsertHere,
  onStop,
  onCancel,
  onInsert,
  onDismiss,
}: VoiceCapturePanelProps) {
  const [maxDurationSecs, setMaxDurationSecs] = useState(
    DEFAULT_MAX_DURATION_SECS,
  );
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const [levelBars, setLevelBars] = useState<LevelBar[]>(emptyLevelBars);
  const lastLevelBarUpdateRef = useRef(0);
  const nextLevelBarIdRef = useRef(1);

  useEffect(() => {
    invoke<{ maxDurationSecs: number }>("get_transcription_capabilities")
      .then((capabilities) => setMaxDurationSecs(capabilities.maxDurationSecs))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setCopyStatus("idle");
    if (!RECORDING_PHASES.includes(voiceState.phase)) {
      setElapsedSecs(0);
      setLevelBars(emptyLevelBars());
      return;
    }
    const startedAt = Date.now();
    const interval = setInterval(() => {
      setElapsedSecs(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [voiceState.phase]);

  useEffect(() => {
    if (voiceState.phase !== "recording") {
      return;
    }
    const now = Date.now();
    if (now - lastLevelBarUpdateRef.current < LEVEL_BAR_MIN_INTERVAL_MS) {
      return;
    }
    lastLevelBarUpdateRef.current = now;
    const id = nextLevelBarIdRef.current++;
    setLevelBars((bars) => [...bars.slice(1), { id, level: voiceState.level }]);
  }, [voiceState.level, voiceState.phase]);

  async function copyResult(): Promise<void> {
    if (voiceState.result === null) {
      return;
    }
    try {
      await navigator.clipboard.writeText(voiceState.result.text);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  if (voiceState.phase === "idle") {
    return null;
  }

  const copyLabel =
    copyStatus === "copied"
      ? "Copiado"
      : copyStatus === "failed"
        ? "Não foi possível copiar"
        : "Copiar";

  if (voiceState.phase === "error") {
    return (
      <div className="voice-capture-panel voice-capture-error" role="alert">
        <p>{voiceState.error?.message ?? "Não foi possível ditar a nota."}</p>
        <button
          className="icon-action"
          type="button"
          aria-label="Fechar"
          title="Fechar"
          data-tooltip="Fechar"
          onClick={onDismiss}
        >
          <Icon name="x" />
        </button>
      </div>
    );
  }

  if (voiceState.phase === "completed" && voiceState.result !== null) {
    const plan = parseVoiceCommand(voiceState.result.text);
    return (
      <div className="voice-capture-panel voice-capture-result">
        {plan.kind === "list" ? (
          <>
            <p className="voice-capture-result-hint">
              {plan.listType === "task"
                ? "Lista de tarefas detectada"
                : "Lista detectada"}
            </p>
            <ul className="voice-capture-result-list">
              {plan.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </>
        ) : (
          <p className="voice-capture-result-text">{plan.text}</p>
        )}
        {!canInsertHere ? (
          <p role="alert">
            Esta transcrição pertence a outra nota. Volte para ela para inserir,
            ou copie o texto agora.
          </p>
        ) : null}
        <div className="voice-capture-actions">
          {canInsertHere ? (
            <button
              className="icon-action"
              type="button"
              aria-label="Inserir"
              title="Inserir"
              data-tooltip="Inserir"
              onClick={onInsert}
            >
              <Icon name="check" />
            </button>
          ) : null}
          <button
            className="icon-action"
            type="button"
            aria-label={copyLabel}
            title={copyLabel}
            data-tooltip={copyLabel}
            onClick={copyResult}
          >
            <Icon name="copy" />
          </button>
          <button
            className="icon-action danger-action"
            type="button"
            aria-label="Descartar"
            title="Descartar"
            data-tooltip="Descartar"
            onClick={onDismiss}
          >
            <Icon name="x" />
          </button>
        </div>
      </div>
    );
  }

  const statusLabel =
    voiceState.phase === "starting"
      ? "Solicitando microfone…"
      : voiceState.phase === "recording"
        ? "Gravando"
        : voiceState.phase === "stopping"
          ? "Finalizando gravação…"
          : voiceState.phase === "transcribing"
            ? "Transcrevendo…"
            : "Cancelando…";

  return (
    <div className="voice-capture-panel" aria-live="polite">
      <div className="voice-capture-status">
        <Icon name="mic" />
        <span>{statusLabel}</span>
        {voiceState.phase === "recording" ? (
          <span className="voice-capture-timer">
            {formatDuration(elapsedSecs)} / {formatDuration(maxDurationSecs)}
          </span>
        ) : null}
      </div>
      {voiceState.phase === "recording" ? (
        <div className="voice-capture-bars" aria-hidden="true">
          {levelBars.map((bar) => (
            <span
              key={bar.id}
              className="voice-capture-bar"
              style={{
                transform: `scaleY(${levelToBarHeight(bar.level)})`,
              }}
            />
          ))}
        </div>
      ) : null}
      {voiceState.phase === "transcribing" ? (
        <div className="voice-transcribing-animation" aria-hidden="true">
          <div className="voice-transcribing-wave">
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="voice-transcribing-lines">
            <span />
            <span />
            <span />
          </div>
        </div>
      ) : null}
      {voiceState.phase === "recording" ? (
        <div className="voice-capture-actions">
          <button
            className="icon-action"
            type="button"
            aria-label="Parar gravação"
            title="Parar gravação"
            data-tooltip="Parar gravação"
            onClick={onStop}
          >
            <Icon name="square" />
          </button>
          <button
            className="icon-action danger-action"
            type="button"
            aria-label="Cancelar"
            title="Cancelar"
            data-tooltip="Cancelar"
            onClick={onCancel}
          >
            <Icon name="x" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default VoiceCapturePanel;
