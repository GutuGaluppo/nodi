import { useEffect, useRef, useState } from "react";
import type { RecoveryKeyDraft } from "./privateNotePassword";

interface RecoveryKeyPanelProps {
  draft: RecoveryKeyDraft;
  /** Runs after the key is stored. */
  onSaved: () => void | Promise<void>;
  /** Offered only when skipping is safe to allow; the key is not stored then. */
  onLater?: () => void;
}

/**
 * Shows a new recovery key once and stores it only after the user proves they
 * kept it by typing its last group.
 */
function RecoveryKeyPanel({ draft, onSaved, onLater }: RecoveryKeyPanelProps) {
  const [confirmation, setConfirmation] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const codeRef = useRef<HTMLElement>(null);
  const lastGroup = draft.code.slice(draft.code.lastIndexOf("-") + 1);
  const confirmed = confirmation.trim().toUpperCase() === lastGroup;
  // Two lines of four groups, so the key never breaks inside a group.
  const groups = draft.code.split("-");
  const middle = Math.ceil(groups.length / 2);
  const halves = [
    groups.slice(0, middle).join("-"),
    groups.slice(middle).join("-"),
  ].filter(Boolean);

  useEffect(() => {
    codeRef.current?.focus();
  }, []);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(draft.code);
      setCopyStatus("Copied. Paste it somewhere safe, then clear it.");
    } catch {
      setCopyStatus("Copy failed. Write the key down instead.");
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmed) {
      setError(`Type ${lastGroup.length} characters from the end of the key.`);
      return;
    }
    setError("");
    setPending(true);
    try {
      await draft.save();
      await onSaved();
    } catch {
      setError("The recovery key could not be saved. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="recovery-key-panel"
      onSubmit={(event) => void submit(event)}
    >
      <p className="recovery-key-label">Recovery key</p>
      <code ref={codeRef} className="recovery-key-code" tabIndex={-1}>
        {halves.map((half) => (
          <span key={half} className="recovery-key-line">
            {half}
          </span>
        ))}
      </code>
      <div className="recovery-key-actions">
        <button
          className="subtle-action"
          type="button"
          onClick={() => void copy()}
        >
          Copy key
        </button>
        <span className="data-note" role="status">
          {copyStatus}
        </span>
      </div>
      <p className="recovery-key-hint">
        Keep it outside this Mac, in a password manager or on paper. It is the
        only way to open your private notes if you forget the password, and
        anyone who has it can open them too. NODI will not show it again.
      </p>
      <label>
        To confirm you saved it, type the last {lastGroup.length} characters
        <input
          value={confirmation}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setConfirmation(event.target.value)}
        />
      </label>
      {error ? (
        <p className="inline-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="recovery-key-buttons">
        <button className="primary-button" type="submit" disabled={pending}>
          {pending ? "Saving…" : "I saved my recovery key"}
        </button>
        {onLater ? (
          <button className="text-button" type="button" onClick={onLater}>
            Not now
          </button>
        ) : null}
      </div>
    </form>
  );
}

export default RecoveryKeyPanel;
