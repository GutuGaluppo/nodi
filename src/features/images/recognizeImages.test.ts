import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  listPendingImages,
  saveAttachmentText,
} from "../../db/repositories/attachmentTextRepository";
import { recognizePendingImages } from "./recognizeImages";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../../db/repositories/attachmentTextRepository", () => ({
  listPendingImages: vi.fn(),
  saveAttachmentText: vi.fn(),
}));

describe("recognizePendingImages", () => {
  beforeEach(() => {
    vi.mocked(listPendingImages).mockResolvedValue([
      { attachmentId: "a1", relativePath: "attachments/aa/1/image.png" },
      { attachmentId: "a2", relativePath: "attachments/bb/2/image.png" },
    ]);
    vi.mocked(saveAttachmentText).mockReset().mockResolvedValue();
  });

  it("reads each waiting image and reports progress", async () => {
    const recognize = vi.fn(async (path: string) => `text of ${path}`);
    const progress = vi.fn();

    await expect(recognizePendingImages(recognize, progress)).resolves.toBe(2);

    expect(saveAttachmentText).toHaveBeenCalledWith(
      "a1",
      "text of attachments/aa/1/image.png",
    );
    expect(progress.mock.calls).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  it("stores no text for an unreadable image so it is not retried forever", async () => {
    const recognize = vi
      .fn()
      .mockRejectedValueOnce(new Error("the image file is missing"))
      .mockResolvedValueOnce("receipt");
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await recognizePendingImages(recognize);

    expect(saveAttachmentText).toHaveBeenCalledWith("a1", "");
    expect(saveAttachmentText).toHaveBeenCalledWith("a2", "receipt");
    consoleError.mockRestore();
  });
});
