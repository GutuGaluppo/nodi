import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  hasPrivateNotesPassword,
  hasRecoveryKey,
  prepareRecoveryKey,
  type RecoveryKeyDraft,
} from "./privateNotePassword";
import RecoveryKeyPanel from "./RecoveryKeyPanel";

const QUERY_KEY = ["private-notes-recovery"];

/**
 * The "Recovery" row of Your data: whether a forgotten private-notes password
 * can be reset, and a way to make a new recovery key with the password.
 */
function RecoveryKeyStatus() {
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => ({
      password: await hasPrivateNotesPassword(),
      recovery: await hasRecoveryKey(),
    }),
  });
  const [asking, setAsking] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [draft, setDraft] = useState<RecoveryKeyDraft | null>(null);
  const [saved, setSaved] = useState(false);

  if (!status.data?.password) return null;

  async function prepare(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      const next = await prepareRecoveryKey(password);
      if (next === null) {
        setError("Incorrect password. Try again.");
      } else {
        setDraft(next);
        setAsking(false);
        setPassword("");
      }
    } catch {
      setError("A recovery key could not be made. Nothing was changed.");
    } finally {
      setPending(false);
    }
  }

  function cancel() {
    setAsking(false);
    setDraft(null);
    setPassword("");
    setError("");
  }

  return (
    <div className="data-row">
      <dt>Recovery</dt>
      <dd>
        {status.data.recovery ? (
          <span className="data-status data-status-ok">
            A recovery key can reset a forgotten private-notes password.
          </span>
        ) : (
          <span className="data-status data-status-problem">
            No recovery key. A forgotten password would lock your private notes
            for good.
          </span>
        )}
        {saved ? (
          <span className="data-note" role="status">
            New recovery key saved. The previous one no longer works.
          </span>
        ) : null}

        {draft ? (
          <RecoveryKeyPanel
            draft={draft}
            onLater={cancel}
            onSaved={async () => {
              setDraft(null);
              setSaved(true);
              await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
            }}
          />
        ) : asking ? (
          <form
            className="recovery-password-form"
            onSubmit={(event) => void prepare(event)}
          >
            <label>
              Private-notes password
              <input
                type="password"
                autoComplete="current-password"
                // biome-ignore lint/a11y/noAutofocus: the field appears because the user asked for it.
                autoFocus
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {error ? (
              <p className="inline-error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="recovery-key-buttons">
              <button
                className="primary-button"
                type="submit"
                disabled={pending}
              >
                {pending ? "Checking…" : "Continue"}
              </button>
              <button className="text-button" type="button" onClick={cancel}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            className="subtle-action"
            type="button"
            onClick={() => {
              setSaved(false);
              setAsking(true);
            }}
          >
            {status.data.recovery
              ? "Make a new recovery key"
              : "Create a recovery key"}
          </button>
        )}
        <span className="data-note">
          The recovery key opens the same encryption key as your password. It is
          stored only in wrapped form, and NODI never shows it twice.
        </span>
      </dd>
    </div>
  );
}

export default RecoveryKeyStatus;
