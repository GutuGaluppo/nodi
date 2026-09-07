import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  it("renders the NODI baseline", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "NODI" })).toBeInTheDocument();
    expect(
      screen.getByText("Local notes, ready for what comes next."),
    ).toBeInTheDocument();
  });

  it("opens and closes the visual history", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "About" }));

    expect(
      screen.getByRole("heading", { name: "The making of NODI" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: "NODI implementation history" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("img")).toHaveLength(3);

    await user.click(screen.getByRole("button", { name: "Back to NODI" }));

    expect(screen.getByRole("heading", { name: "NODI" })).toBeInTheDocument();
  });
});
