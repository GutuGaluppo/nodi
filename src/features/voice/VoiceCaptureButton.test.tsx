import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import VoiceCaptureButton from "./VoiceCaptureButton";

describe("VoiceCaptureButton", () => {
  it("starts a capture when idle", async () => {
    const onStart = vi.fn();
    const user = userEvent.setup();
    render(
      <VoiceCaptureButton
        phase="idle"
        disabled={false}
        onStart={onStart}
        onStop={vi.fn()}
      />,
    );

    const button = screen.getByRole("button", { name: "Ditar nota" });
    expect(button).toHaveAttribute("aria-pressed", "false");

    await user.click(button);
    expect(onStart).toHaveBeenCalledOnce();
  });

  it("stops a capture when recording, and reflects the pressed state", async () => {
    const onStop = vi.fn();
    const user = userEvent.setup();
    render(
      <VoiceCaptureButton
        phase="recording"
        disabled={false}
        onStart={vi.fn()}
        onStop={onStop}
      />,
    );

    const button = screen.getByRole("button", { name: "Parar gravação" });
    expect(button).toHaveAttribute("aria-pressed", "true");

    await user.click(button);
    expect(onStop).toHaveBeenCalledOnce();
  });

  it("disables itself while the backend is busy transcribing", () => {
    render(
      <VoiceCaptureButton
        phase="transcribing"
        disabled={false}
        onStart={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    expect(screen.getByRole("button")).toBeDisabled();
  });
});
