import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TooltipLayer from "./TooltipLayer";

function Fixture() {
  return (
    <>
      <TooltipLayer />
      <div style={{ overflow: "hidden" }}>
        <button type="button" data-tooltip="Collapse Library">
          Collapse
        </button>
      </div>
    </>
  );
}

describe("TooltipLayer", () => {
  it("shows a hovered label in a layer on the body, outside any clipping container", () => {
    render(<Fixture />);

    fireEvent.pointerOver(screen.getByRole("button", { name: "Collapse" }));

    expect(screen.getByText("Collapse Library").parentElement).toBe(
      document.body,
    );
  });

  it("hides the label when the pointer leaves the control", () => {
    render(<Fixture />);
    const button = screen.getByRole("button", { name: "Collapse" });

    fireEvent.pointerOver(button);
    fireEvent.pointerOut(button);

    expect(screen.queryByText("Collapse Library")).toBeNull();
  });

  it("shows the label on keyboard focus and hides it on blur", () => {
    render(<Fixture />);
    const button = screen.getByRole("button", { name: "Collapse" });

    fireEvent.focusIn(button);
    expect(screen.getByText("Collapse Library")).toBeInTheDocument();

    fireEvent.focusOut(button);
    expect(screen.queryByText("Collapse Library")).toBeNull();
  });
});
