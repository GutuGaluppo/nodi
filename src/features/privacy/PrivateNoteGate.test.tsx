import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PrivateNoteGate from "./PrivateNoteGate";
import {
  hasPrivateNotesPassword,
  setPrivateNotesPassword,
  unlockPrivateNotes,
} from "./privateNotePassword";

vi.mock("./privateNotePassword", () => ({
  hasPrivateNotesPassword: vi.fn(),
  setPrivateNotesPassword: vi.fn(),
  unlockPrivateNotes: vi.fn(),
}));

describe("PrivateNoteGate", () => {
  beforeEach(() => {
    vi.mocked(hasPrivateNotesPassword).mockReset().mockResolvedValue(true);
    vi.mocked(setPrivateNotesPassword).mockReset().mockResolvedValue();
    vi.mocked(unlockPrivateNotes).mockReset();
  });

  it("stays busy until the unlocked note is ready", async () => {
    vi.mocked(unlockPrivateNotes).mockResolvedValue(true);
    let finishLoading: () => void = () => {};
    const onUnlocked = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishLoading = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<PrivateNoteGate onUnlocked={onUnlocked} />);

    await user.type(await screen.findByLabelText("Password"), "correct horse");
    await user.click(screen.getByRole("button", { name: "Unlock note" }));

    expect(unlockPrivateNotes).toHaveBeenCalledWith("correct horse");
    expect(onUnlocked).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Checking…" })).toBeDisabled();
    finishLoading();
    expect(
      await screen.findByRole("button", { name: "Unlock note" }),
    ).toBeEnabled();
  });

  it("rejects a wrong password without unlocking", async () => {
    vi.mocked(unlockPrivateNotes).mockResolvedValue(false);
    const onUnlocked = vi.fn();
    const user = userEvent.setup();
    render(<PrivateNoteGate onUnlocked={onUnlocked} />);

    await user.type(await screen.findByLabelText("Password"), "wrong password");
    await user.click(screen.getByRole("button", { name: "Unlock note" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Incorrect password. Try again.",
    );
    expect(onUnlocked).not.toHaveBeenCalled();
  });

  it("warns that a forgotten password cannot be recovered during setup", async () => {
    vi.mocked(hasPrivateNotesPassword).mockResolvedValue(false);
    render(<PrivateNoteGate onUnlocked={vi.fn()} />);

    expect(
      await screen.findByText(/cannot be recovered if you forget it/),
    ).toBeInTheDocument();
  });
});
