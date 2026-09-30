import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Note } from "../../db/repositories/noteRepository";
import ImageToTextDialog from "./ImageToTextDialog";
import { createImageTextNote } from "./imageToNote";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../../lib/attachments/attachmentUrl", () => ({
  attachmentUrl: (path: string) => `asset://${path}`,
}));
vi.mock("./imageToNote", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./imageToNote")>()),
  createImageTextNote: vi.fn(),
}));

const stored = {
  relativePath: "attachments/ab/abcdef/image.png",
  sha256: "abcdef",
  size: 1234,
  filename: "image.png",
  mimeType: "image/png",
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("ImageToTextDialog", () => {
  beforeEach(() => {
    vi.mocked(invoke)
      .mockReset()
      .mockResolvedValue({ stored: [stored], rejected: [] });
    vi.mocked(createImageTextNote)
      .mockReset()
      .mockResolvedValue({ id: "note-9" } as Note);
  });

  it("completes the flow: choose → read → review → create", async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    const read = vi
      .fn()
      .mockResolvedValue({ text: "Recibo\nTotal 12.40", doubtfulWords: [] });
    render(
      <ImageToTextDialog
        notebookId="nb-1"
        onClose={vi.fn()}
        onCreated={onCreated}
        read={read}
      />,
      { wrapper },
    );

    expect(screen.getByRole("dialog")).toHaveAccessibleName(
      "Nota a partir de imagem",
    );
    await user.click(screen.getByRole("button", { name: "Escolher imagem" }));

    expect(
      await screen.findByRole("heading", { name: "Revisar texto extraído" }),
    ).toBeInTheDocument();
    expect(read).toHaveBeenCalledWith(stored.relativePath);
    expect(
      screen.getByText("Nenhuma palavra duvidosa encontrada."),
    ).toBeInTheDocument();
    expect(
      screen.getByAltText("A imagem de onde o texto foi lido"),
    ).toHaveAttribute("src", `asset://${stored.relativePath}`);

    const textarea = screen.getByLabelText(/Texto extraído/);
    expect(textarea).toHaveFocus();
    await user.clear(textarea);
    await user.type(textarea, "Texto editado");
    await user.click(screen.getByRole("button", { name: "Gerar nota" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("note-9"));
    expect(createImageTextNote).toHaveBeenCalledWith({
      image: stored,
      text: "Texto editado",
      recognizedText: "Recibo\nTotal 12.40",
      notebookId: "nb-1",
    });
  });

  it("fixes doubtful words with a suggestion, or keeps them", async () => {
    const user = userEvent.setup();
    const read = vi.fn().mockResolvedValue({
      text: "Logo barra de manus\nse estier ativo\nCadence",
      doubtfulWords: [
        { word: "manus", suggestions: ["Manaus", "manos", "menus"] },
        { word: "estier", suggestions: ["estiver", "Ester"] },
        { word: "Cadence", suggestions: ["Cadente"] },
      ],
    });
    render(
      <ImageToTextDialog
        notebookId={null}
        onClose={vi.fn()}
        onCreated={vi.fn()}
        read={read}
      />,
      { wrapper },
    );

    await user.click(screen.getByRole("button", { name: "Escolher imagem" }));
    expect(
      await screen.findByRole("heading", { name: "Palavras duvidosas (3)" }),
    ).toBeInTheDocument();
    const textarea = screen.getByLabelText(/Texto extraído/);

    await user.click(
      screen.getByRole("button", { name: "Trocar estier por estiver" }),
    );
    expect(textarea).toHaveValue(
      "Logo barra de manus\nse estiver ativo\nCadence",
    );
    // Focus moves on to the next word.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Trocar manus por Manaus" }),
      ).toHaveFocus(),
    );

    await user.click(screen.getByRole("button", { name: "Manter Cadence" }));
    expect(
      screen.getByRole("heading", { name: "Palavras duvidosas (1)" }),
    ).toBeInTheDocument();

    // Fixing a word by hand also takes it off the list.
    await user.clear(textarea);
    await user.type(textarea, "Logo barra de menus");
    expect(
      screen.getByText("Todas as palavras duvidosas foram revistas."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gerar nota" })).toBeEnabled();
  });

  it("offers another try when reading fails", async () => {
    const user = userEvent.setup();
    const read = vi
      .fn()
      .mockRejectedValueOnce(new Error("Vision failed"))
      .mockResolvedValueOnce({ text: "Recibo", doubtfulWords: [] });
    render(
      <ImageToTextDialog
        notebookId={null}
        onClose={vi.fn()}
        onCreated={vi.fn()}
        read={read}
      />,
      { wrapper },
    );

    await user.click(screen.getByRole("button", { name: "Escolher imagem" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Vision failed");

    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(
      await screen.findByRole("heading", { name: "Revisar texto extraído" }),
    ).toBeInTheDocument();
  });

  it("keeps the reviewed text when saving fails", async () => {
    const user = userEvent.setup();
    vi.mocked(createImageTextNote).mockRejectedValueOnce(
      new Error("disk full"),
    );
    const read = vi
      .fn()
      .mockResolvedValue({ text: "Recibo", doubtfulWords: [] });
    render(
      <ImageToTextDialog
        notebookId={null}
        onClose={vi.fn()}
        onCreated={vi.fn()}
        read={read}
      />,
      { wrapper },
    );

    await user.click(screen.getByRole("button", { name: "Escolher imagem" }));
    await user.type(await screen.findByLabelText(/Texto extraído/), " editado");
    await user.click(screen.getByRole("button", { name: "Gerar nota" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("disk full");
    await user.click(screen.getByRole("button", { name: "Voltar à revisão" }));
    expect(screen.getByLabelText(/Texto extraído/)).toHaveValue(
      "Recibo editado",
    );
  });

  it("reports a rejected file", async () => {
    const user = userEvent.setup();
    vi.mocked(invoke).mockResolvedValue({
      stored: [],
      rejected: [{ name: "notes.pdf", reason: "not an image" }],
    });
    render(
      <ImageToTextDialog
        notebookId={null}
        onClose={vi.fn()}
        onCreated={vi.fn()}
        read={vi.fn()}
      />,
      { wrapper },
    );

    await user.click(screen.getByRole("button", { name: "Escolher imagem" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "notes.pdf não pôde ser usada: not an image.",
    );
  });

  it("closes with Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <ImageToTextDialog
        notebookId={null}
        onClose={onClose}
        onCreated={vi.fn()}
        read={vi.fn()}
      />,
      { wrapper },
    );

    expect(
      screen.getByRole("button", { name: "Escolher imagem" }),
    ).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });
});
