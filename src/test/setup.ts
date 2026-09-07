import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom does not implement the layout APIs ProseMirror calls on pointer events.
// Minimal stubs keep the Tiptap editor from throwing during component tests.
if (!document.elementFromPoint) {
  document.elementFromPoint = () => null;
}

if (!Range.prototype.getClientRects) {
  const emptyRect = {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    toJSON: () => "",
  } as DOMRect;

  Range.prototype.getClientRects = () =>
    ({ item: () => null, length: 0 }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => emptyRect;
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});
