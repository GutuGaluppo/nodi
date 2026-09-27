import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../app/providers";
import {
  getStorageReport,
  type StorageReport,
} from "../../db/repositories/storageRepository";
import { describeNetworkPolicy } from "./networkPolicy";
import YourData from "./YourData";

vi.mock("../../db/repositories/storageRepository", () => ({
  getStorageReport: vi.fn(),
}));

vi.mock("./privateNotePassword", () => ({
  hasPrivateNotesPassword: vi.fn(async () => false),
  hasRecoveryKey: vi.fn(async () => false),
  isTouchIdEnabled: vi.fn(async () => false),
  getTouchIdSupport: vi.fn(async () => ({
    available: false,
    biometrics: false,
  })),
  prepareRecoveryKey: vi.fn(),
}));

vi.mock("@tauri-apps/api/path", () => ({
  appDataDir: vi.fn(
    async () => "/Users/me/Library/Application Support/com.nodi.app",
  ),
  join: vi.fn(async (...parts: string[]) => parts.join("/")),
}));

const getStorageReportMock = vi.mocked(getStorageReport);

function report(overrides: Partial<StorageReport> = {}): StorageReport {
  return {
    sizeBytes: 5 * 1024 * 1024,
    integrity: ["ok"],
    activeNotes: 12,
    trashedNotes: 2,
    encryptedPrivateNotes: 3,
    pendingPrivateNotes: 0,
    ...overrides,
  };
}

function renderYourData() {
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={createQueryClient()}>
      <YourData onClose={onClose} />
    </QueryClientProvider>,
  );
  return { onClose };
}

describe("YourData", () => {
  beforeEach(() => {
    getStorageReportMock.mockReset();
  });

  it("shows the live location, size, counts, integrity, and network state", async () => {
    getStorageReportMock.mockResolvedValue(report());
    renderYourData();

    expect(
      await screen.findByText(
        "/Users/me/Library/Application Support/com.nodi.app/nodi.db",
      ),
    ).toBeInTheDocument();
    expect(await screen.findByText("5 MB")).toBeInTheDocument();
    expect(screen.getByText("12 notes · 2 in Trash")).toBeInTheDocument();
    expect(screen.getByText("3 encrypted notes")).toBeInTheDocument();
    expect(
      screen.getByText("Healthy. SQLite found no problems."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Blocked. NODI cannot reach the internet."),
    ).toBeInTheDocument();
  });

  it("warns about private notes that are not encrypted yet", async () => {
    getStorageReportMock.mockResolvedValue(report({ pendingPrivateNotes: 1 }));
    renderYourData();

    expect(
      await screen.findByText(/1 private note is not encrypted yet/),
    ).toBeInTheDocument();
  });

  it("lists integrity problems as an alert", async () => {
    getStorageReportMock.mockResolvedValue(
      report({ integrity: ["row 3 missing from index"] }),
    );
    renderYourData();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("SQLite reported problems");
    expect(alert).toHaveTextContent("row 3 missing from index");
  });

  it("explains when the report cannot be read", async () => {
    getStorageReportMock.mockRejectedValue(new Error("disk I/O error"));
    renderYourData();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The storage report could not be read. Your data was not changed.",
    );
  });

  it("copies the database location", async () => {
    getStorageReportMock.mockResolvedValue(report());
    const user = userEvent.setup();
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue();
    renderYourData();

    await user.click(
      await screen.findByRole("button", { name: "Copy location" }),
    );

    expect(writeText).toHaveBeenCalledWith(
      "/Users/me/Library/Application Support/com.nodi.app/nodi.db",
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Location copied.",
    );
  });

  it("returns to the workspace", async () => {
    getStorageReportMock.mockResolvedValue(report());
    const user = userEvent.setup();
    const { onClose } = renderYourData();

    await user.click(screen.getByRole("button", { name: "Back to NODI" }));

    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("describeNetworkPolicy", () => {
  it("reports the network as blocked when only local IPC is allowed", () => {
    expect(
      describeNetworkPolicy({ "connect-src": "ipc: http://ipc.localhost" })
        .blocked,
    ).toBe(true);
  });

  it("names remote hosts the policy allows", () => {
    const summary = describeNetworkPolicy({
      "connect-src": "ipc: https://api.example.com",
    });
    expect(summary.blocked).toBe(false);
    expect(summary.detail).toContain("https://api.example.com");
  });

  it("does not claim a block when no policy is enforced", () => {
    expect(describeNetworkPolicy(null).blocked).toBe(false);
  });
});
