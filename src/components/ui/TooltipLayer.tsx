import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const GAP = 7;
const EDGE = 8;

interface Tip {
  text: string;
  anchor: HTMLElement;
}

interface Placement {
  left: number;
  top: number;
}

/**
 * Shows every `[data-tooltip]` label in a layer on the document body, so no
 * pane or sidebar with overflow clipping can cut it off.
 */
function TooltipLayer() {
  const [tip, setTip] = useState<Tip | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let current: HTMLElement | null = null;

    function anchorOf(target: EventTarget | null) {
      return target instanceof Element
        ? target.closest<HTMLElement>("[data-tooltip]")
        : null;
    }

    function show(anchor: HTMLElement) {
      const text = anchor.dataset.tooltip ?? "";
      if (anchor === current || text === "") return;
      current = anchor;
      setTip({ text, anchor });
    }

    function hide() {
      current = null;
      setTip(null);
    }

    function onPointerOver(event: PointerEvent) {
      const anchor = anchorOf(event.target);
      if (anchor) show(anchor);
    }

    function onPointerOut(event: PointerEvent) {
      const anchor = anchorOf(event.target);
      if (anchor && !anchor.contains(event.relatedTarget as Node | null)) {
        hide();
      }
    }

    function onFocusIn(event: FocusEvent) {
      const anchor = anchorOf(event.target);
      if (anchor) show(anchor);
    }

    function onFocusOut(event: FocusEvent) {
      if (anchorOf(event.target)) hide();
    }

    document.addEventListener("pointerover", onPointerOver);
    document.addEventListener("pointerout", onPointerOut);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    // A moved or scrolled anchor would leave the label in the wrong place.
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);

    return () => {
      document.removeEventListener("pointerover", onPointerOver);
      document.removeEventListener("pointerout", onPointerOut);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, []);

  // Runs before paint, so the label never appears at the wrong spot.
  useLayoutEffect(() => {
    if (!tip || !tipRef.current) {
      setPlacement(null);
      return;
    }

    const anchor = tip.anchor.getBoundingClientRect();
    const box = tipRef.current.getBoundingClientRect();
    const maxLeft = Math.max(EDGE, window.innerWidth - box.width - EDGE);
    const left = Math.min(
      Math.max(anchor.left + anchor.width / 2 - box.width / 2, EDGE),
      maxLeft,
    );
    let top = anchor.bottom + GAP;
    if (top + box.height > window.innerHeight - EDGE) {
      top = anchor.top - GAP - box.height;
    }

    setPlacement({ left, top });
  }, [tip]);

  if (!tip) return null;

  return createPortal(
    <div
      ref={tipRef}
      className="tooltip-layer"
      aria-hidden="true"
      style={{
        left: placement?.left ?? 0,
        top: placement?.top ?? 0,
        visibility: placement ? "visible" : "hidden",
      }}
    >
      {tip.text}
    </div>,
    document.body,
  );
}

export default TooltipLayer;
