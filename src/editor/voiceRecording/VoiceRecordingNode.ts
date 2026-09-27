import { mergeAttributes, Node, ReactNodeViewRenderer } from "@tiptap/react";
import VoiceRecordingView from "./VoiceRecordingView";

export interface VoiceSegment {
  startMs: number;
  endMs: number;
  text: string;
}

export interface VoiceRecordingAttributes {
  attachmentId: string | null;
  /** Relative to the app data directory, e.g. `attachments/ab/…/recording.wav`. */
  src: string | null;
  durationMs: number;
  segments: VoiceSegment[];
}

/**
 * A kept voice recording with its timed transcript (VOICE-AUD-002). The audio
 * file lives in attachment storage; the transcript and its timings live in the
 * note's Tiptap JSON, which is canonical note content, so they are saved,
 * searched, and (for private notes) encrypted with the rest of the note.
 */
export const VoiceRecording = Node.create({
  name: "voiceRecording",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      attachmentId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-attachment-id"),
        renderHTML: (attributes) => ({
          "data-attachment-id": attributes.attachmentId,
        }),
      },
      src: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-src"),
        renderHTML: (attributes) => ({ "data-src": attributes.src }),
      },
      durationMs: {
        default: 0,
        parseHTML: (element) =>
          Number(element.getAttribute("data-duration-ms") ?? 0),
        renderHTML: (attributes) => ({
          "data-duration-ms": attributes.durationMs,
        }),
      },
      segments: {
        default: [],
        parseHTML: (element) => {
          try {
            return JSON.parse(element.getAttribute("data-segments") ?? "[]");
          } catch {
            return [];
          }
        },
        renderHTML: (attributes) => ({
          "data-segments": JSON.stringify(attributes.segments),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-voice-recording]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-voice-recording": "" }),
    ];
  },

  /** The transcript is the recording's text for previews and search. */
  renderText({ node }) {
    return (node.attrs.segments as VoiceSegment[])
      .map((segment) => segment.text)
      .join(" ");
  },

  addNodeView() {
    return ReactNodeViewRenderer(VoiceRecordingView);
  },
});
