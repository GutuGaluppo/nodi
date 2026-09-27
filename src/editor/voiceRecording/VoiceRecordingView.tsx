import { convertFileSrc } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";
import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import type { VoiceSegment } from "./VoiceRecordingNode";

export function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`;
}

/** Resolves a stored relative path to a URL the webview may play. */
async function resolveAudioUrl(src: string): Promise<string> {
  return convertFileSrc(await join(await appDataDir(), src));
}

/**
 * Plays a kept recording (VOICE-AUD-003). Each transcript sentence is a
 * button that plays from the moment it was spoken; the sentence being heard
 * is highlighted while the audio plays.
 */
function VoiceRecordingView({ node }: ReactNodeViewProps) {
  const src = node.attrs.src as string | null;
  const segments = node.attrs.segments as VoiceSegment[];
  const durationMs = node.attrs.durationMs as number;
  const audioRef = useRef<HTMLAudioElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [currentMs, setCurrentMs] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    if (!src) {
      setUnavailable(true);
      return;
    }
    resolveAudioUrl(src)
      .then((resolved) => {
        if (active) setUrl(resolved);
      })
      .catch(() => {
        if (active) setUnavailable(true);
      });
    return () => {
      active = false;
    };
  }, [src]);

  function playFrom(startMs: number): void {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = startMs / 1000;
    void audio.play().catch(() => setUnavailable(true));
  }

  const activeIndex =
    currentMs === null
      ? -1
      : segments.findIndex(
          (segment) =>
            currentMs >= segment.startMs && currentMs < segment.endMs,
        );

  return (
    <NodeViewWrapper
      className="voice-recording"
      contentEditable={false}
      data-drag-handle=""
    >
      <div className="voice-recording-header">
        <span className="voice-recording-label">Gravação</span>
        <span className="voice-recording-duration">
          {formatTimestamp(durationMs)}
        </span>
      </div>
      {unavailable ? (
        <p className="voice-recording-missing" role="status">
          O áudio desta gravação não está disponível neste Mac.
        </p>
      ) : (
        // biome-ignore lint/a11y/useMediaCaption: the timed transcript below is the caption.
        <audio
          ref={audioRef}
          className="voice-recording-audio"
          controls
          preload="metadata"
          src={url ?? undefined}
          onTimeUpdate={(event) =>
            setCurrentMs(event.currentTarget.currentTime * 1000)
          }
          onPause={() => setCurrentMs(null)}
          onEnded={() => setCurrentMs(null)}
          onError={() => setUnavailable(true)}
        />
      )}
      {segments.length > 0 ? (
        <ol className="voice-recording-transcript" aria-label="Transcrição">
          {segments.map((segment, index) => (
            <li key={`${segment.startMs}-${segment.endMs}-${segment.text}`}>
              <button
                type="button"
                className="voice-recording-segment"
                aria-current={index === activeIndex ? "true" : undefined}
                disabled={unavailable || url === null}
                onClick={() => playFrom(segment.startMs)}
              >
                <span className="voice-recording-time">
                  {formatTimestamp(segment.startMs)}
                </span>
                <span>{segment.text}</span>
              </button>
            </li>
          ))}
        </ol>
      ) : null}
    </NodeViewWrapper>
  );
}

export default VoiceRecordingView;
