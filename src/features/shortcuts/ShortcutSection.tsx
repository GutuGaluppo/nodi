import Icon from "../../components/ui/Icon";
import { useShortcuts, useToggleShortcut } from "./shortcutQueries";

interface ShortcutSectionProps {
  onOpenNote: (id: string) => void;
  onOpenNotebook: (id: string) => void;
}

function ShortcutSection({ onOpenNote, onOpenNotebook }: ShortcutSectionProps) {
  const shortcuts = useShortcuts();
  const toggle = useToggleShortcut();

  if (!shortcuts.data || shortcuts.data.length === 0) return null;

  return (
    <section className="shortcut-section" aria-labelledby="shortcuts-label">
      <p className="section-label" id="shortcuts-label">
        Shortcuts
      </p>
      <ul className="shortcut-list">
        {shortcuts.data.map((shortcut) => (
          <li key={shortcut.id}>
            <button
              className="shortcut-link"
              type="button"
              onClick={() =>
                shortcut.targetType === "note"
                  ? onOpenNote(shortcut.targetId)
                  : onOpenNotebook(shortcut.targetId)
              }
            >
              <span aria-hidden="true">
                {shortcut.targetType === "note" ? "◆" : "□"}
              </span>
              {shortcut.label}
            </button>
            <button
              className="shortcut-remove"
              type="button"
              aria-label={`Remove ${shortcut.label} from shortcuts`}
              onClick={() =>
                toggle.mutate({
                  targetType: shortcut.targetType,
                  targetId: shortcut.targetId,
                  active: true,
                })
              }
            >
              <Icon name="trash" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default ShortcutSection;
