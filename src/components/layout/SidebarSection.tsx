import { useState } from "react";
import Icon from "../ui/Icon";

const STORAGE_KEY = "nodi.sidebar.collapsed";

export type SidebarSectionId = "shortcuts" | "mainMenu" | "tags";

function readCollapsed(): Partial<Record<SidebarSectionId, boolean>> {
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "{}",
    );
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function writeCollapsed(value: Partial<Record<SidebarSectionId, boolean>>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage can be unavailable; the choice then lasts for this session only.
  }
}

/** Collapsed state of one sidebar section, remembered for this viewer. */
export function useSidebarSectionCollapsed(id: SidebarSectionId) {
  const [collapsed, setCollapsed] = useState(
    () => readCollapsed()[id] === true,
  );

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    writeCollapsed({ ...readCollapsed(), [id]: next });
  }

  return [collapsed, toggle] as const;
}

interface SidebarSectionToggleProps {
  id: string;
  controlsId: string;
  label: string;
  collapsed: boolean;
  onToggle: () => void;
}

/** Section title that shows and hides the section's content. */
export function SidebarSectionToggle({
  id,
  controlsId,
  label,
  collapsed,
  onToggle,
}: SidebarSectionToggleProps) {
  return (
    <button
      id={id}
      className="sidebar-section-toggle"
      type="button"
      aria-expanded={!collapsed}
      aria-controls={controlsId}
      onClick={onToggle}
    >
      <span className="section-label">{label}</span>
      <Icon name="chevron" />
    </button>
  );
}
