import type { ShortcutTargetType } from "../../db/repositories/shortcutRepository";
import { useShortcuts, useToggleShortcut } from "./shortcutQueries";

interface ShortcutToggleProps {
  targetType: ShortcutTargetType;
  targetId: string;
  label: string;
}

function ShortcutToggle({ targetType, targetId, label }: ShortcutToggleProps) {
  const shortcuts = useShortcuts();
  const toggle = useToggleShortcut();
  const active =
    shortcuts.data?.some(
      (shortcut) =>
        shortcut.targetType === targetType && shortcut.targetId === targetId,
    ) ?? false;
  const actionLabel = `${active ? "Remove" : "Add"} ${label} ${active ? "from" : "to"} shortcuts`;

  return (
    <button
      className="shortcut-toggle"
      type="button"
      aria-label={actionLabel}
      title={actionLabel}
      data-tooltip={active ? "Remove shortcut" : "Add shortcut"}
      aria-pressed={active}
      disabled={toggle.isPending}
      onClick={() => toggle.mutate({ targetType, targetId, active })}
    >
      {active ? "★" : "☆"}
    </button>
  );
}

export default ShortcutToggle;
