import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("NODI app", () => {
  it("renders the NODI baseline", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "NODI" })).toBeInTheDocument();
    expect(
      screen.getByRole("complementary", { name: "Sidebar" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Notes" })).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Nothing selected" }),
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
    expect(screen.getAllByRole("img")).toHaveLength(8);

    await user.click(screen.getByRole("button", { name: "Back to NODI" }));

    expect(screen.getByRole("heading", { name: "NODI" })).toBeInTheDocument();
  });

  it("applies and stores an explicit theme preference", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Dark" }));

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(window.localStorage.getItem("nodi.theme")).toBe("dark");
  });
});
