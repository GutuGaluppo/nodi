import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { countEncryptedPrivateNotes } from "../../db/repositories/noteRepository";
import PrivateNoteGate from "./PrivateNoteGate";
import {
  getTouchIdSupport,
  hasPrivateNotesPassword,
  hasRecoveryKey,
  isTouchIdEnabled,
  prepareRecoveryKey,
  recoverPrivateNotes,
  resetPasswordWithTouchId,
  setPrivateNotesPassword,
  startPrivateNotesOver,
  unlockPrivateNotes,
  unlockWithTouchId,
} from "./privateNotePassword";

vi.mock("./privateNotePassword", () => ({
  getTouchIdSupport: vi.fn(),
  isTouchIdEnabled: vi.fn(),
  resetPasswordWithTouchId: vi.fn(),
  unlockWithTouchId: vi.fn(),
  hasPrivateNotesPassword: vi.fn(),
  hasRecoveryKey: vi.fn(),
  prepareRecoveryKey: vi.fn(),
  recoverPrivateNotes: vi.fn(),
  setPrivateNotesPassword: vi.fn(),
  startPrivateNotesOver: vi.fn(),
  unlockPrivateNotes: vi.fn(),
}));

vi.mock("../../db/repositories/noteRepository", () => ({
  countEncryptedPrivateNotes: vi.fn(),
}));

const CODE = "7KQ2-M9XD-4TFH-A1B2-C3D4-E5F6-G7H8-J9KM";
const save = vi.fn();

function renderGate(
  props: Partial<Parameters<typeof PrivateNoteGate>[0]> = {},
) {
  const onUnlocked = props.onUnlocked ?? vi.fn();
  const onStartedOver = props.onStartedOver ?? vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PrivateNoteGate onUnlocked={onUnlocked} onStartedOver={onStartedOver} />
    </QueryClientProvider>,
  );
  return { onUnlocked, onStartedOver };
}

describe("PrivateNoteGate", () => {
  beforeEach(() => {
    vi.mocked(hasPrivateNotesPassword).mockReset().mockResolvedValue(true);
    vi.mocked(isTouchIdEnabled).mockReset().mockResolvedValue(false);
    vi.mocked(getTouchIdSupport)
      .mockReset()
      .mockResolvedValue({ available: true, biometrics: true });
    vi.mocked(unlockWithTouchId).mockReset();
    vi.mocked(resetPasswordWithTouchId).mockReset();
    vi.mocked(hasRecoveryKey).mockReset().mockResolvedValue(true);
    vi.mocked(setPrivateNotesPassword).mockReset().mockResolvedValue();
    vi.mocked(unlockPrivateNotes).mockReset();
    vi.mocked(recoverPrivateNotes).mockReset();
    vi.mocked(startPrivateNotesOver).mockReset().mockResolvedValue(3);
    vi.mocked(countEncryptedPrivateNotes).mockReset().mockResolvedValue(3);
    save.mockReset().mockResolvedValue(undefined);
    vi.mocked(prepareRecoveryKey)
      .mockReset()
      .mockResolvedValue({ code: CODE, save });
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
    renderGate({ onUnlocked });

    await user.type(await screen.findByLabelText("Password"), "correct horse");
    await user.click(screen.getByRole("button", { name: "Unlock note" }));

    expect(unlockPrivateNotes).toHaveBeenCalledWith("correct horse");
    expect(onUnlocked).toHaveBeenCalledOnce();
    expect(prepareRecoveryKey).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Checking…" })).toBeDisabled();
    finishLoading();
    expect(
      await screen.findByRole("button", { name: "Unlock note" }),
    ).toBeEnabled();
  });

  it("rejects a wrong password without unlocking", async () => {
    vi.mocked(unlockPrivateNotes).mockResolvedValue(false);
    const user = userEvent.setup();
    const { onUnlocked } = renderGate();

    await user.type(await screen.findByLabelText("Password"), "wrong password");
    await user.click(screen.getByRole("button", { name: "Unlock note" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Incorrect password. Try again.",
    );
    expect(onUnlocked).not.toHaveBeenCalled();
  });

  it("gives a recovery key during setup and stores it only once confirmed", async () => {
    vi.mocked(hasPrivateNotesPassword).mockResolvedValue(false);
    const user = userEvent.setup();
    const { onUnlocked } = renderGate();

    await user.type(await screen.findByLabelText("Password"), "correct horse");
    await user.type(screen.getByLabelText("Confirm password"), "correct horse");
    await user.click(
      screen.getByRole("button", { name: "Protect private notes" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Save your recovery key" }),
    ).toBeInTheDocument();
    expect(screen.getByText(CODE.slice(0, 19))).toBeInTheDocument();
    // Setup cannot skip the key.
    expect(screen.queryByRole("button", { name: "Not now" })).toBeNull();

    const saveButton = screen.getByRole("button", {
      name: "I saved my recovery key",
    });
    await user.type(
      screen.getByLabelText(/type the last 4 characters/),
      "0000",
    );
    await user.click(saveButton);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Type 4 characters from the end of the key.",
    );
    expect(save).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText(/type the last 4 characters/));
    await user.type(
      screen.getByLabelText(/type the last 4 characters/),
      "j9km",
    );
    await user.click(saveButton);

    expect(save).toHaveBeenCalledOnce();
    expect(onUnlocked).toHaveBeenCalledOnce();
  });

  it("offers a recovery key after unlocking notes that have none", async () => {
    vi.mocked(unlockPrivateNotes).mockResolvedValue(true);
    vi.mocked(hasRecoveryKey).mockResolvedValue(false);
    const user = userEvent.setup();
    const { onUnlocked } = renderGate();

    await user.type(await screen.findByLabelText("Password"), "correct horse");
    await user.click(screen.getByRole("button", { name: "Unlock note" }));

    expect(await screen.findByText(/no recovery key yet/)).toBeInTheDocument();
    expect(prepareRecoveryKey).toHaveBeenCalledWith("correct horse");
    await user.click(screen.getByRole("button", { name: "Not now" }));

    expect(save).not.toHaveBeenCalled();
    expect(onUnlocked).toHaveBeenCalledOnce();
  });

  it("resets the password with the recovery key and replaces the key", async () => {
    vi.mocked(recoverPrivateNotes).mockResolvedValueOnce(false);
    vi.mocked(recoverPrivateNotes).mockResolvedValueOnce(true);
    const user = userEvent.setup();
    renderGate();

    await user.click(
      await screen.findByRole("button", { name: "Forgot password?" }),
    );
    await user.type(await screen.findByLabelText("Recovery key"), "bad key");
    await user.type(screen.getByLabelText("New password"), "new password");
    await user.type(
      screen.getByLabelText("Confirm new password"),
      "new password",
    );
    await user.click(screen.getByRole("button", { name: "Reset password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That recovery key does not match.",
    );

    await user.click(screen.getByRole("button", { name: "Reset password" }));

    expect(recoverPrivateNotes).toHaveBeenLastCalledWith(
      "bad key",
      "new password",
    );
    expect(
      await screen.findByText(/old one stops working/),
    ).toBeInTheDocument();
    expect(prepareRecoveryKey).toHaveBeenCalledWith("new password");
  });

  it("explains when no recovery key exists and only offers starting over", async () => {
    vi.mocked(hasRecoveryKey).mockResolvedValue(false);
    const user = userEvent.setup();
    renderGate();

    await user.click(
      await screen.findByRole("button", { name: "Forgot password?" }),
    );

    expect(
      await screen.findByText(/No recovery key was saved/),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Recovery key")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Start private notes over" }),
    ).toBeInTheDocument();
  });

  it("starts over only after the confirmation word is typed", async () => {
    const user = userEvent.setup();
    const { onStartedOver } = renderGate();

    await user.click(
      await screen.findByRole("button", { name: "Forgot password?" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "I lost my recovery key too" }),
    );
    expect(
      await screen.findByText(/3 encrypted private notes will be deleted/),
    ).toBeInTheDocument();

    const confirm = screen.getByRole("button", {
      name: "Delete private notes and start over",
    });
    await user.click(confirm);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Type DELETE to confirm.",
    );
    expect(startPrivateNotesOver).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Type DELETE to confirm"), "delete");
    await user.click(confirm);

    expect(startPrivateNotesOver).toHaveBeenCalledOnce();
    expect(
      await screen.findByRole("heading", { name: "Set a password" }),
    ).toBeInTheDocument();
    expect(onStartedOver).toHaveBeenCalledOnce();
  });

  it("offers Touch ID only once it is turned on", async () => {
    renderGate();
    expect(await screen.findByLabelText("Password")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Unlock with Touch ID/ }),
    ).toBeNull();
  });

  it("unlocks with Touch ID, and stays locked when the prompt is cancelled", async () => {
    vi.mocked(isTouchIdEnabled).mockResolvedValue(true);
    vi.mocked(unlockWithTouchId)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const user = userEvent.setup();
    const { onUnlocked } = renderGate();

    const touch = await screen.findByRole("button", {
      name: "Unlock with Touch ID",
    });
    await user.click(touch);
    expect(onUnlocked).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();

    await user.click(touch);
    expect(onUnlocked).toHaveBeenCalledOnce();
  });

  it("names the Mac password when Touch ID is not enrolled", async () => {
    vi.mocked(isTouchIdEnabled).mockResolvedValue(true);
    vi.mocked(getTouchIdSupport).mockResolvedValue({
      available: true,
      biometrics: false,
    });
    renderGate();

    expect(
      await screen.findByRole("button", {
        name: "Unlock with your Mac password",
      }),
    ).toBeInTheDocument();
  });

  it("explains a Touch ID failure and keeps the password route", async () => {
    vi.mocked(isTouchIdEnabled).mockResolvedValue(true);
    vi.mocked(unlockWithTouchId).mockRejectedValue(new Error("other Mac"));
    const user = userEvent.setup();
    renderGate();

    await user.click(
      await screen.findByRole("button", { name: "Unlock with Touch ID" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Touch ID could not open private notes. Use your password.",
    );
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("resets a forgotten password with Touch ID when there is no recovery key", async () => {
    vi.mocked(isTouchIdEnabled).mockResolvedValue(true);
    vi.mocked(hasRecoveryKey).mockResolvedValue(false);
    vi.mocked(resetPasswordWithTouchId).mockResolvedValue(true);
    const user = userEvent.setup();
    renderGate();

    await user.click(
      await screen.findByRole("button", { name: "Forgot password?" }),
    );
    expect(screen.queryByLabelText("Recovery key")).toBeNull();
    await user.type(
      screen.getByLabelText("New password", { exact: true }),
      "new password",
    );
    await user.type(
      screen.getByLabelText("Confirm new password"),
      "new password",
    );
    await user.click(
      screen.getByRole("button", { name: "Reset with Touch ID" }),
    );

    expect(resetPasswordWithTouchId).toHaveBeenCalledWith("new password");
    // Without a recovery key, NODI offers one for the new password.
    expect(await screen.findByText(/no recovery key yet/)).toBeInTheDocument();
    expect(prepareRecoveryKey).toHaveBeenCalledWith("new password");
  });
});
