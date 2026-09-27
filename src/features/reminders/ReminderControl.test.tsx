import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../app/providers";
import {
  clearReminder,
  getPendingReminder,
  setReminder,
} from "../../db/repositories/reminderRepository";
import ReminderControl, { toLocalInputValue } from "./ReminderControl";

vi.mock("../../db/repositories/reminderRepository", () => ({
  getPendingReminder: vi.fn(),
  setReminder: vi.fn(),
  clearReminder: vi.fn(),
}));

function renderControl() {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <ReminderControl noteId="note-1" />
    </QueryClientProvider>,
  );
}

describe("ReminderControl", () => {
  beforeEach(() => {
    vi.mocked(getPendingReminder).mockReset().mockResolvedValue(null);
    vi.mocked(setReminder).mockReset();
    vi.mocked(clearReminder).mockReset().mockResolvedValue();
  });

  it("adds a reminder at a chosen future time", async () => {
    const future = new Date(Date.now() + 2 * 86_400_000);
    future.setSeconds(0, 0);
    vi.mocked(setReminder).mockResolvedValue({
      id: "r1",
      noteId: "note-1",
      remindAt: future.toISOString(),
      createdAt: new Date().toISOString(),
      deliveredAt: null,
    });
    const user = userEvent.setup();
    renderControl();

    await user.click(
      await screen.findByRole("button", { name: "Add reminder" }),
    );
    fireEvent.change(screen.getByLabelText("Remind me"), {
      target: { value: toLocalInputValue(future) },
    });
    await user.click(screen.getByRole("button", { name: "Save reminder" }));

    expect(setReminder).toHaveBeenCalledWith("note-1", future);
  });

  it("refuses a time in the past", async () => {
    const user = userEvent.setup();
    renderControl();

    await user.click(
      await screen.findByRole("button", { name: "Add reminder" }),
    );
    fireEvent.change(screen.getByLabelText("Remind me"), {
      target: { value: "2020-01-01T09:00" },
    });
    await user.click(screen.getByRole("button", { name: "Save reminder" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose a time in the future.",
    );
    expect(setReminder).not.toHaveBeenCalled();
  });

  it("shows a pending reminder and removes it", async () => {
    vi.mocked(getPendingReminder).mockResolvedValue({
      id: "r1",
      noteId: "note-1",
      remindAt: "2030-10-01T10:00:00.000Z",
      createdAt: "2026-09-27T10:00:00.000Z",
      deliveredAt: null,
    });
    const user = userEvent.setup();
    renderControl();

    expect(
      await screen.findByRole("button", { name: /Change reminder/ }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove reminder" }));

    expect(clearReminder).toHaveBeenCalledWith("note-1");
  });
});
