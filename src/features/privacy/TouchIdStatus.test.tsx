import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../app/providers";
import {
  disableTouchId,
  enableTouchId,
  getTouchIdSupport,
  hasPrivateNotesPassword,
  isTouchIdEnabled,
} from "./privateNotePassword";
import TouchIdStatus from "./TouchIdStatus";

vi.mock("./privateNotePassword", () => ({
  disableTouchId: vi.fn(),
  enableTouchId: vi.fn(),
  getTouchIdSupport: vi.fn(),
  hasPrivateNotesPassword: vi.fn(),
  isTouchIdEnabled: vi.fn(),
}));

function renderStatus() {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <dl>
        <TouchIdStatus />
      </dl>
    </QueryClientProvider>,
  );
}

describe("TouchIdStatus", () => {
  beforeEach(() => {
    vi.mocked(hasPrivateNotesPassword).mockReset().mockResolvedValue(true);
    vi.mocked(isTouchIdEnabled).mockReset().mockResolvedValue(false);
    vi.mocked(getTouchIdSupport)
      .mockReset()
      .mockResolvedValue({ available: true, biometrics: true });
    vi.mocked(enableTouchId).mockReset();
    vi.mocked(disableTouchId).mockReset().mockResolvedValue();
  });

  it("stays hidden on a Mac that cannot protect the key", async () => {
    vi.mocked(getTouchIdSupport).mockResolvedValue({
      available: false,
      biometrics: false,
    });
    renderStatus();

    await vi.waitFor(() => expect(getTouchIdSupport).toHaveBeenCalled());
    expect(screen.queryByText("Touch ID")).toBeNull();
  });

  it("turns Touch ID on with the password and off without it", async () => {
    const user = userEvent.setup();
    renderStatus();

    expect(
      await screen.findByText(/Off\. Private notes open only/),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Open private notes with Touch ID" }),
    );
    vi.mocked(enableTouchId).mockResolvedValueOnce(false);
    await user.type(
      screen.getByLabelText("Private-notes password"),
      "wrong password",
    );
    await user.click(screen.getByRole("button", { name: "Use Touch ID" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Incorrect password.",
    );

    vi.mocked(enableTouchId).mockResolvedValueOnce(true);
    vi.mocked(isTouchIdEnabled).mockResolvedValue(true);
    await user.click(screen.getByRole("button", { name: "Use Touch ID" }));
    expect(
      await screen.findByText(/On\. Touch ID can open private notes/),
    ).toBeInTheDocument();

    vi.mocked(isTouchIdEnabled).mockResolvedValue(false);
    await user.click(
      screen.getByRole("button", { name: "Stop using Touch ID" }),
    );
    expect(disableTouchId).toHaveBeenCalledOnce();
    expect(
      await screen.findByText(/Off\. Private notes open only/),
    ).toBeInTheDocument();
  });
});
