import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Note } from "../../db/repositories/noteRepository";
import {
  type HandwritingClient,
  HandwritingError,
} from "../handwriting/client";
import ImageToTextDialog from "./ImageToTextDialog";
import { createImageTextNote } from "./imageToNote";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  isTauri: () => true,
}));
vi.mock("./imageToNote", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./imageToNote")>()),
  createImageTextNote: vi.fn(),
}));
const stored = {
  relativePath: "attachments/ab/abcdef/image.png",
  sha256: "abcdef",
  size: 12,
  filename: "image.png",
  mimeType: "image/png",
};
function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      {children}
    </QueryClientProvider>
  );
}
function service(): HandwritingClient {
  return {
    available: true,
    usage: vi.fn().mockResolvedValue({
      plan: "free",
      monthlyRemaining: 0,
      trialRemaining: 1,
      additional: [],
      renewalAt: null,
      model: "gpt-5.4",
      paymentsAvailable: false,
      restoreAvailable: false,
    }),
    quote: vi.fn().mockResolvedValue({
      id: "quote1",
      pages: 1,
      credits: 1,
      expiresAt: "2026-10-02T12:00:00Z",
    }),
    submit: vi.fn().mockResolvedValue({ id: "job1" }),
    status: vi.fn().mockResolvedValue({
      id: "job1",
      pages: 1,
      status: "processed",
      text: "Grap conpilence\nExact text",
    }),
    jobs: vi.fn().mockResolvedValue([]),
    lookup: vi.fn().mockResolvedValue({ id: "job1" }),
    checkout: vi.fn(),
    restore: vi.fn(),
  };
}
async function chooseAndConfirm(
  client: HandwritingClient,
  onCreated = vi.fn(),
  onOpenPlanUsage?: () => void,
) {
  const user = userEvent.setup();
  render(
    <ImageToTextDialog
      notebookId="nb-1"
      onClose={vi.fn()}
      onCreated={onCreated}
      onOpenPlanUsage={onOpenPlanUsage}
      client={client}
    />,
    { wrapper },
  );
  await user.upload(
    screen.getByLabelText("Escolher imagem ou PDF"),
    new File(["image bytes"], "source.png", { type: "image/png" }),
  );
  const validate = screen.getByRole("button", { name: "Validar páginas" });
  expect(validate).toBeDisabled();
  expect(client.quote).not.toHaveBeenCalled();
  await user.click(screen.getByRole("checkbox"));
  await user.click(validate);
  await screen.findByText("1 página(s) · 1 crédito(s)");
  expect(client.submit).not.toHaveBeenCalled();
  return user;
}

describe("Handwriting image-to-text", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "URL",
      Object.assign(URL, {
        createObjectURL: vi.fn(() => "blob:preview"),
        revokeObjectURL: vi.fn(),
      }),
    );
    vi.mocked(invoke).mockReset().mockResolvedValue(stored);
    vi.mocked(createImageTextNote)
      .mockReset()
      .mockResolvedValue({ id: "note-9" } as Note);
  });
  it("requires consent and cost confirmation, preserves exact provider text, saves after review", async () => {
    const client = service();
    const onCreated = vi.fn();
    const user = await chooseAndConfirm(client, onCreated);
    await user.click(
      screen.getByRole("button", { name: "Transcrever · 1 crédito(s)" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Consultar processamento" }),
    );
    const text = await screen.findByLabelText(
      "Texto extraído — edite conforme necessário",
    );
    expect(text).toHaveValue("Grap conpilence\nExact text");
    expect(text).toHaveFocus();
    await user.clear(text);
    await user.type(text, "Reviewed note");
    await user.click(screen.getByRole("button", { name: "Gerar nota" }));
    expect(onCreated).toHaveBeenCalledWith("note-9");
    expect(createImageTextNote).toHaveBeenCalledWith({
      image: stored,
      text: "Reviewed note",
      recognizedText: "Grap conpilence\nExact text",
      notebookId: "nb-1",
    });
    expect(invoke).toHaveBeenCalledWith(
      "import_handwriting_bytes",
      expect.any(Uint8Array),
    );
    expect(client.submit).toHaveBeenCalledTimes(1);
    expect(client.submit).toHaveBeenCalledWith("quote1", "none");
  });
  it("compares the credits of each effort and sends the chosen one", async () => {
    const client = service();
    vi.mocked(client.quote).mockResolvedValue({
      id: "quote1",
      pages: 2,
      credits: 2,
      expiresAt: "2026-10-02T12:00:00Z",
    });
    vi.mocked(client.usage).mockResolvedValue({
      plan: "plus",
      monthlyRemaining: 7,
      trialRemaining: 0,
      additional: [],
      renewalAt: null,
      model: "gpt-5.4",
      effort: "medium",
      paymentsAvailable: false,
      restoreAvailable: false,
    });
    const user = userEvent.setup();
    render(
      <ImageToTextDialog
        notebookId={null}
        onClose={vi.fn()}
        onCreated={vi.fn()}
        client={client}
      />,
      { wrapper },
    );
    await screen.findByText(/^Equilibrado: 2 crédito\(s\) por página/);
    expect(screen.getByRole("radio", { name: /Equilibrado/ })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: /Cuidadoso/ }));
    expect(
      screen.getByText(/^Cuidadoso: 3 crédito\(s\) por página/),
    ).toHaveTextContent("3× o custo do Rápido");
    await user.upload(
      screen.getByLabelText("Escolher imagem ou PDF"),
      new File(["image bytes"], "source.png", { type: "image/png" }),
    );
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Validar páginas" }));
    await screen.findByText("2 página(s) · 6 crédito(s)");
    expect(
      screen.getByRole("radio", { name: "Máximo, 10 crédito(s)" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/\(\+4 crédito\(s\)\)/)).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /Máximo/ }));
    const transcribe = screen.getByRole("button", {
      name: "Transcrever · 10 crédito(s)",
    });
    expect(transcribe).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: /Rápido/ }));
    await user.click(
      screen.getByRole("button", { name: "Transcrever · 2 crédito(s)" }),
    );
    expect(client.submit).toHaveBeenCalledWith("quote1", "none");
  });
  it("shows explanations only after the help button is pressed", async () => {
    const user = userEvent.setup();
    render(
      <ImageToTextDialog
        notebookId={null}
        onClose={vi.fn()}
        onCreated={vi.fn()}
        client={service()}
      />,
      { wrapper },
    );
    const help = screen.getByRole("button", { name: "Como funciona" });
    expect(help).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/registros de segurança/)).not.toBeVisible();
    await user.click(help);
    expect(help).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/registros de segurança/)).toBeVisible();
  });
  it("copies and exports the reviewed text without another transcription", async () => {
    const client = service();
    const user = await chooseAndConfirm(client);
    await user.click(
      screen.getByRole("button", { name: "Transcrever · 1 crédito(s)" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Consultar processamento" }),
    );
    await screen.findByLabelText("Texto extraído — edite conforme necessário");
    await user.click(screen.getByRole("button", { name: "Copiar" }));
    expect(await navigator.clipboard.readText()).toBe(
      "Grap conpilence\nExact text",
    );
    await user.click(screen.getByRole("button", { name: "Exportar TXT" }));
    expect(invoke).toHaveBeenCalledWith("export_handwriting_text", {
      text: "Grap conpilence\nExact text",
    });
    expect(client.submit).toHaveBeenCalledTimes(1);
  });

  it("keeps timeout pending and consults the same job without submitting again", async () => {
    const client = service();
    vi.mocked(client.submit).mockRejectedValueOnce(
      new HandwritingError("provider_timeout"),
    );
    const user = await chooseAndConfirm(client);
    await user.click(
      screen.getByRole("button", { name: "Transcrever · 1 crédito(s)" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Consultar processamento" }),
    );
    expect(client.lookup).toHaveBeenCalledWith("quote1");
    await user.click(
      await screen.findByRole("button", { name: "Consultar processamento" }),
    );
    await screen.findByLabelText("Texto extraído — edite conforme necessário");
    expect(client.submit).toHaveBeenCalledTimes(1);
  });
  it("never offers a charge when credits are insufficient", async () => {
    const client = service();
    vi.mocked(client.usage).mockResolvedValue({
      plan: "free",
      monthlyRemaining: 0,
      trialRemaining: 0,
      additional: [],
      renewalAt: null,
      model: "gpt-5.4",
      paymentsAvailable: false,
      restoreAvailable: false,
    });
    const openPlanUsage = vi.fn();
    const user = await chooseAndConfirm(client, vi.fn(), openPlanUsage);
    const transcribe = screen.getByRole("button", {
      name: "Transcrever · 1 crédito(s)",
    });
    expect(transcribe).toBeDisabled();
    expect(transcribe).toHaveAccessibleDescription(
      "Saldo insuficiente: este arquivo usa 1 crédito(s) e você tem 0. Escolha um esforço menor, compre páginas ou mude de plano em Settings › Plan and usage",
    );
    expect(client.submit).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "Settings › Plan and usage" }),
    );
    expect(openPlanUsage).toHaveBeenCalledTimes(1);
  });
  it("preserves edited text after a save failure and retries without another charge", async () => {
    const client = service();
    const user = await chooseAndConfirm(client);
    vi.mocked(createImageTextNote).mockRejectedValueOnce(
      new Error("disk full"),
    );
    await user.click(
      screen.getByRole("button", { name: "Transcrever · 1 crédito(s)" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Consultar processamento" }),
    );
    const text = await screen.findByLabelText(
      "Texto extraído — edite conforme necessário",
    );
    await user.clear(text);
    await user.type(text, "Keep edits");
    await user.click(screen.getByRole("button", { name: "Gerar nota" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("disk full");
    expect(text).toHaveValue("Keep edits");
    await user.click(screen.getByRole("button", { name: "Gerar nota" }));
    expect(client.submit).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledTimes(1);
  });
  it("fails closed without a backend, traps focus and restores opener", async () => {
    const user = userEvent.setup();
    const client = service();
    client.available = false;
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const close = vi.fn();
    const view = render(
      <ImageToTextDialog
        notebookId={null}
        onClose={close}
        onCreated={vi.fn()}
        client={client}
      />,
      { wrapper },
    );
    expect(screen.getByRole("dialog")).toHaveFocus();
    expect(
      screen.getByRole("button", { name: "Validar páginas" }),
    ).toBeDisabled();
    await user.tab({ shift: true });
    await user.keyboard("{Escape}");
    expect(close).toHaveBeenCalled();
    view.unmount();
    expect(opener).toHaveFocus();
    opener.remove();
    expect(client.usage).not.toHaveBeenCalled();
  });
});
