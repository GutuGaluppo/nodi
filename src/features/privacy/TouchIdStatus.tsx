import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  disableTouchId,
  enableTouchId,
  getTouchIdSupport,
  hasPrivateNotesPassword,
  isTouchIdEnabled,
} from "./privateNotePassword";

const QUERY_KEY = ["private-notes-touch-id"];

/**
 * The "Touch ID" row of Your data (PRIV-REC-004): an optional way to open
 * private notes on this Mac, turned on with the private-notes password.
 */
function TouchIdStatus() {
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => ({
      password: await hasPrivateNotesPassword(),
      enabled: await isTouchIdEnabled(),
      support: await getTouchIdSupport(),
    }),
  });
  const [asking, setAsking] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const data = status.data;
  if (!data?.password || !data.support.available) return null;
  const name = data.support.biometrics ? "Touch ID" : "your Mac password";

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  }

  async function turnOn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      if (await enableTouchId(password)) {
        setAsking(false);
        setPassword("");
        await refresh();
      } else {
        setError("Incorrect password. Try again.");
      }
    } catch {
      setError("Touch ID could not be turned on. Nothing was changed.");
    } finally {
      setPending(false);
    }
  }

  async function turnOff() {
    setError("");
    setPending(true);
    try {
      await disableTouchId();
      await refresh();
    } catch {
      setError("Touch ID could not be turned off. Try again.");
    } finally {
      setPending(false);
    }
  }

  function cancel() {
    setAsking(false);
    setPassword("");
    setError("");
  }

  return (
    <div className="data-row">
      <dt>Touch ID</dt>
      <dd>
        <span>
          {data.enabled
            ? `On. ${data.support.biometrics ? "Touch ID" : "Your Mac password"} can open private notes on this Mac.`
            : "Off. Private notes open only with their password."}
        </span>
        {asking ? (
          <form
            className="recovery-password-form"
            onSubmit={(event) => void turnOn(event)}
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
                {pending ? "Checking…" : `Use ${name}`}
              </button>
              <button className="text-button" type="button" onClick={cancel}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            {error ? (
              <p className="inline-error" role="alert">
                {error}
              </p>
            ) : null}
            <button
              className="subtle-action"
              type="button"
              disabled={pending}
              onClick={() => (data.enabled ? void turnOff() : setAsking(true))}
            >
              {data.enabled
                ? `Stop using ${name}`
                : `Open private notes with ${name}`}
            </button>
          </>
        )}
        <span className="data-note">
          A copy of the private-notes key is sealed by this Mac's Secure Enclave
          and works on no other Mac. Anyone who can pass {name} here can open
          private notes, so leave this off on a shared Mac.
        </span>
      </dd>
    </div>
  );
}

export default TouchIdStatus;
