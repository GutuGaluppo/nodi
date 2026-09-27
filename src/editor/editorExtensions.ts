import { Highlight } from "@tiptap/extension-highlight";
import { Link } from "@tiptap/extension-link";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableRow } from "@tiptap/extension-table-row";
import { TaskItem } from "@tiptap/extension-task-item";
import { TaskList } from "@tiptap/extension-task-list";
import { Underline } from "@tiptap/extension-underline";
import type { Extensions } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { AttachmentImage } from "./attachmentImage";
import { VoiceRecording } from "./voiceRecording/VoiceRecordingNode";

export const EDITOR_PLACEHOLDER = "Start writing…";

/**
 * The fixed NODI editor extension set (IMPLEMENTATION.md §26). StarterKit's
 * bundled Link and Underline are disabled so the standalone extensions own that
 * behaviour explicitly. NODI adds two nodes of its own: `AttachmentImage`, for
 * images stored as attachments, and `VoiceRecording`, a kept dictation with its
 * timed transcript.
 */
export const editorExtensions: Extensions = [
  StarterKit.configure({
    link: false,
    underline: false,
  }),
  Underline,
  Link.configure({
    openOnClick: false,
    autolink: true,
    linkOnPaste: true,
  }),
  AttachmentImage,
  Highlight,
  TaskList,
  TaskItem.configure({ nested: true }),
  Table.configure({ resizable: true }),
  TableRow,
  TableHeader,
  TableCell,
  Placeholder.configure({ placeholder: EDITOR_PLACEHOLDER }),
  VoiceRecording,
];
