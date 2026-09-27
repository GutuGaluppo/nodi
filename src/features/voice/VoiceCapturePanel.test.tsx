import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { VoiceAction } from "./useVoiceActions";
import type { VoiceCaptureState } from "./useVoiceCapture";
import VoiceCapturePanel from "./VoiceCapturePanel";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => ({ maxDurationSecs: 120 })),
}));

const completed: VoiceCaptureState = {
  phase: "completed",
  sessionId: "s1",
  noteId: "note-1",
  level: 0,
  progress: null,
  error: null,
  result: {
    sessionId: "s1",
    noteId: "note-1",
    language: "pt",
    text: "Crie uma lista de compras no caderno Casa com a tag mercado: leite e pão",
    durationMs: 4000,
    segments: [],
    limitReached: false,
  },
};

const actions: VoiceAction[] = [
  { key: "title", kind: "title", value: "Mercado" },
  { key: "notebook", kind: "notebook", target: { id: "nb-1", name: "Casa" } },
  { key: "tag:mercado", kind: "tag", target: { name: "mercado" } },
];

function renderPanel(overrides = {}) {
  const props = {
    voiceState: completed,
    canInsertHere: true,
    onStop: vi.fn(),
    onCancel: vi.fn(),
    onInsert: vi.fn(),
    onDismiss: vi.fn(),
    plan: {
      kind: "list" as const,
      listType: "bullet" as const,
      items: ["leite", "pão"],
    },
    actions,
    onRemoveAction: vi.fn(),
    ...overrides,
  };
  render(<VoiceCapturePanel {...props} />);
  return props;
}

describe("VoiceCapturePanel preview", () => {
  it("lists what will happen on insert, marking new names", () => {
    renderPanel();

    const preview = screen.getByRole("list", { name: "Ao inserir" });
    expect(preview).toHaveTextContent("Título: Mercado");
    expect(preview).toHaveTextContent("Caderno: Casa");
    expect(preview).toHaveTextContent("Tag: mercado");
    expect(screen.getAllByText("nova")).toHaveLength(1);
    expect(screen.queryByText("novo")).not.toBeInTheDocument();
    expect(screen.getByText("leite")).toBeInTheDocument();
  });

  it("lets the user remove any part before inserting", async () => {
    const user = userEvent.setup();
    const { onRemoveAction } = renderPanel();

    await user.click(
      screen.getByRole("button", { name: "Remover Caderno: Casa" }),
    );

    expect(onRemoveAction).toHaveBeenCalledWith("notebook");
  });

  it("disables inserting while actions are applied", () => {
    renderPanel({ isApplying: true });

    expect(screen.getByRole("button", { name: "Inserir" })).toBeDisabled();
  });

  it("hides the text preview when a dictation holds only directives", () => {
    renderPanel({ plan: { kind: "text", text: "" } });

    expect(
      screen.getByRole("list", { name: "Ao inserir" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Inserir" })).toBeEnabled();
  });

  it("offers to keep the audio and reports the choice", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderPanel({ keepAudio: { checked: false, onChange } });

    await user.click(
      screen.getByRole("checkbox", { name: "Guardar o áudio na nota" }),
    );

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("explains why the audio cannot be kept", () => {
    renderPanel({
      audioUnavailableReason: "O áudio não é guardado em notas privadas.",
    });

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(
      screen.getByText("O áudio não é guardado em notas privadas."),
    ).toBeInTheDocument();
  });
});
