import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../app/providers";
import SpotlightStatus from "./SpotlightStatus";
import {
  getLastSpotlightRun,
  isSpotlightEnabled,
  setSpotlightEnabled,
} from "./spotlight";

vi.mock("./spotlight", () => ({
  getLastSpotlightRun: vi.fn(),
  isSpotlightEnabled: vi.fn(),
  setSpotlightEnabled: vi.fn(),
}));

function renderStatus() {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <dl>
        <SpotlightStatus />
      </dl>
    </QueryClientProvider>,
  );
}

describe("SpotlightStatus", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.mocked(isSpotlightEnabled).mockReset().mockResolvedValue(false);
    vi.mocked(getLastSpotlightRun).mockReset().mockResolvedValue(null);
    vi.mocked(setSpotlightEnabled).mockReset().mockResolvedValue(0);
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("reads the setting on its own, without Spotlight sync mounted", async () => {
    vi.mocked(isSpotlightEnabled).mockResolvedValue(true);
    renderStatus();

    expect(await screen.findByText("On")).toBeInTheDocument();
    expect(isSpotlightEnabled).toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("reads the setting again after it is toggled", async () => {
    const user = userEvent.setup();
    renderStatus();
    await vi.waitFor(() => expect(isSpotlightEnabled).toHaveBeenCalledOnce());

    vi.mocked(isSpotlightEnabled).mockResolvedValue(true);
    await user.click(
      await screen.findByRole("button", { name: "Show notes in Spotlight" }),
    );

    expect(vi.mocked(setSpotlightEnabled).mock.calls[0][0]).toBe(true);
    expect(await screen.findByText("On")).toBeInTheDocument();
    expect(consoleError).not.toHaveBeenCalled();
  });
});
