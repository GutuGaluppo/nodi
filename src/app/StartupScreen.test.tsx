import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import StartupScreen from "./StartupScreen";

describe("StartupScreen", () => {
  it("shows a non-destructive database error and permits retry", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();

    render(<StartupScreen status="error" onRetry={onRetry} />);

    expect(
      screen.getByRole("heading", { name: "Could not open your library" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Your data was not changed.", { exact: false }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(onRetry).toHaveBeenCalledOnce();
  });
});
