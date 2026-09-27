import { QueryClientProvider, useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../app/providers";
import { listExportableNotes } from "../../db/repositories/exportRepository";
import { setSetting } from "../../db/repositories/settingsRepository";
import MirrorSync from "./MirrorSync";
import { runMirror } from "./markdownMirror";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../../db/repositories/exportRepository", () => ({
  listExportableNotes: vi.fn(),
}));
vi.mock("../../db/repositories/settingsRepository", () => ({
  getSetting: vi.fn(async () => null),
  setSetting: vi.fn(async () => undefined),
}));

const invokeMock = vi.mocked(invoke);

const notes = [
  {
    id: "n-1",
    title: "Launch plan",
    contentJson: '{"type":"doc","content":[{"type":"paragraph"}]}',
    contentText: "",
    notebook: "Product",
    tags: [],
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z",
  },
];

beforeEach(() => {
  invokeMock.mockReset();
  vi.mocked(listExportableNotes).mockReset().mockResolvedValue(notes);
  vi.mocked(setSetting).mockClear();
});

describe("runMirror", () => {
  it("sends the notes as files and records the outcome", async () => {
    invokeMock.mockResolvedValue({
      written: 1,
      unchanged: 0,
      deleted: 0,
      failures: [],
    });

    const run = await runMirror(true);

    const [command, args] = invokeMock.mock.calls[0];
    expect(command).toBe("write_mirror");
    expect(args).toMatchObject({ force: true });
    expect((args as { files: { path: string }[] }).files[0].path).toBe(
      "Product/Launch plan.md",
    );
    expect(run).toMatchObject({ files: 1, written: 1 });
    expect(setSetting).toHaveBeenCalledWith(
      "markdown_mirror_last_run",
      expect.stringContaining('"written":1'),
    );
  });

  it("records a failed pass instead of throwing", async () => {
    invokeMock.mockRejectedValue("the mirror folder no longer exists");

    const run = await runMirror();

    expect(run.error).toBe("the mirror folder no longer exists");
    expect(setSetting).toHaveBeenCalledOnce();
  });
});

describe("MirrorSync", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function Editor({ meta }: { meta?: Record<string, unknown> }) {
    const mutation = useMutation({ meta, mutationFn: async () => "saved" });
    return (
      <button type="button" onClick={() => mutation.mutate()}>
        edit
      </button>
    );
  }

  function mirrorPasses(): number {
    return invokeMock.mock.calls.filter(
      ([command]) => command === "write_mirror",
    ).length;
  }

  async function mount(meta?: Record<string, unknown>) {
    invokeMock.mockImplementation(async (command) =>
      command === "get_mirror_folder"
        ? "/Users/me/Notes"
        : { written: 0, unchanged: 1, deleted: 0, failures: [] },
    );
    render(
      <QueryClientProvider client={createQueryClient()}>
        <MirrorSync />
        <Editor meta={meta} />
      </QueryClientProvider>,
    );
    await vi.waitFor(() => expect(mirrorPasses()).toBe(1));
  }

  it("mirrors at launch and again two seconds after a change", async () => {
    await mount();
    vi.useFakeTimers();

    await act(async () => screen.getByRole("button").click());
    await act(async () => vi.advanceTimersByTime(1_900));
    expect(mirrorPasses()).toBe(1);
    await act(async () => vi.advanceTimersByTime(200));

    expect(mirrorPasses()).toBe(2);
  });

  it("ignores its own mirror mutations", async () => {
    await mount({ mirror: true });
    vi.useFakeTimers();

    await act(async () => screen.getByRole("button").click());
    await act(async () => vi.advanceTimersByTime(5_000));

    expect(mirrorPasses()).toBe(1);
  });

  it("does nothing while no folder is set", async () => {
    invokeMock.mockResolvedValue(null);
    render(
      <QueryClientProvider client={createQueryClient()}>
        <MirrorSync />
      </QueryClientProvider>,
    );

    await vi.waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("get_mirror_folder"),
    );
    expect(mirrorPasses()).toBe(0);
  });
});
