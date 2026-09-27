import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../app/providers";
import {
  hasPrivateNotesPassword,
  hasRecoveryKey,
  prepareRecoveryKey,
} from "./privateNotePassword";
import RecoveryKeyStatus from "./RecoveryKeyStatus";

vi.mock("./privateNotePassword", () => ({
  hasPrivateNotesPassword: vi.fn(),
  hasRecoveryKey: vi.fn(),
  prepareRecoveryKey: vi.fn(),
}));

const CODE = "7KQ2-M9XD-4TFH-A1B2-C3D4-E5F6-G7H8-J9KM";
const save = vi.fn();

function renderStatus() {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <dl>
        <RecoveryKeyStatus />
      </dl>
    </QueryClientProvider>,
  );
}

describe("RecoveryKeyStatus", () => {
  beforeEach(() => {
    vi.mocked(hasPrivateNotesPassword).mockReset().mockResolvedValue(true);
    vi.mocked(hasRecoveryKey).mockReset().mockResolvedValue(false);
    save.mockReset().mockResolvedValue(undefined);
    vi.mocked(prepareRecoveryKey)
      .mockReset()
      .mockResolvedValue({ code: CODE, save });
  });

  it("stays hidden until private notes have a password", async () => {
    vi.mocked(hasPrivateNotesPassword).mockResolvedValue(false);
    renderStatus();

    await vi.waitFor(() => expect(hasPrivateNotesPassword).toHaveBeenCalled());
    expect(screen.queryByText("Recovery")).toBeNull();
  });

  it("warns without a recovery key and creates one after the password", async () => {
    const user = userEvent.setup();
    renderStatus();

    expect(await screen.findByText(/No recovery key/)).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Create a recovery key" }),
    );
    vi.mocked(prepareRecoveryKey).mockResolvedValueOnce(null);
    await user.type(
      screen.getByLabelText("Private-notes password"),
      "wrong password",
    );
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Incorrect password.",
    );

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText(CODE.slice(0, 19))).toBeInTheDocument();

    vi.mocked(hasRecoveryKey).mockResolvedValue(true);
    await user.type(
      screen.getByLabelText(/type the last 4 characters/),
      "J9KM",
    );
    await user.click(
      screen.getByRole("button", { name: "I saved my recovery key" }),
    );

    expect(save).toHaveBeenCalledOnce();
    expect(
      await screen.findByText(/previous one no longer works/),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/can reset a forgotten private-notes password/),
    ).toBeInTheDocument();
  });
});
