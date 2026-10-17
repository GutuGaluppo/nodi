import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useSidebarSectionCollapsed } from "./SidebarSection";

const STORAGE_KEY = "nodi.sidebar.collapsed";

describe("useSidebarSectionCollapsed", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("starts expanded and toggles between collapsed and expanded", () => {
    const { result } = renderHook(() => useSidebarSectionCollapsed("tags"));

    expect(result.current[0]).toBe(false);

    act(() => result.current[1]());
    expect(result.current[0]).toBe(true);

    act(() => result.current[1]());
    expect(result.current[0]).toBe(false);
  });

  it("remembers each section's state separately", () => {
    const { result } = renderHook(() => useSidebarSectionCollapsed("tags"));

    act(() => result.current[1]());

    expect(
      JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}"),
    ).toEqual({ tags: true });
  });

  it("restores a collapsed section from storage", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ mainMenu: true }),
    );

    const { result } = renderHook(() => useSidebarSectionCollapsed("mainMenu"));

    expect(result.current[0]).toBe(true);
  });

  it("falls back to expanded when stored data is not valid", () => {
    window.localStorage.setItem(STORAGE_KEY, "not json");

    const { result } = renderHook(() =>
      useSidebarSectionCollapsed("shortcuts"),
    );

    expect(result.current[0]).toBe(false);
  });
});
