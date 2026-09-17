import { useEffect, useRef, useState } from "react";
import Icon from "../../components/ui/Icon";
import {
  hasPrivateNotesPassword,
  setPrivateNotesPassword,
  verifyPrivateNotesPassword,
} from "./privateNotePassword";

interface PrivateNoteGateProps {
  onUnlocked: () => void;
}

function PrivateNoteGate({ onUnlocked }: PrivateNoteGateProps) {
  const [mode, setMode] = useState<"loading" | "setup" | "unlock">("loading");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void hasPrivateNotesPassword().then((exists) =>
      setMode(exists ? "unlock" : "setup"),
    );
  }, []);

  useEffect(() => {
    if (mode !== "loading") inputRef.current?.focus();
  }, [mode]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Use a password with at least 8 characters.");
      return;
    }
    if (mode === "setup" && password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }
    setPending(true);
    try {
      if (mode === "setup") {
        await setPrivateNotesPassword(password);
        onUnlocked();
      } else if (await verifyPrivateNotesPassword(password)) {
        onUnlocked();
      } else {
        setError("Incorrect password. Try again.");
      }
    } catch {
      setError(
        "Private notes could not be unlocked. Your data was not changed.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="private-note-gate" aria-label="Private note">
      <Icon name="lock" />
      <p className="section-label">Private note</p>
      <h2>{mode === "setup" ? "Set a password" : "This note is locked"}</h2>
      <p>
        {mode === "setup"
          ? "Create one password to access private notes on this device."
          : "Enter your password to view and edit this note."}
      </p>
      {mode === "loading" ? null : (
        <form onSubmit={(event) => void submit(event)}>
          <label>
            Password
            <input
              ref={inputRef}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {mode === "setup" ? (
            <label>
              Confirm password
              <input
                type="password"
                autoComplete="new-password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </label>
          ) : null}
          {error ? (
            <p className="inline-error" role="alert">
              {error}
            </p>
          ) : null}
          <button className="primary-button" type="submit" disabled={pending}>
            {pending
              ? "Checking…"
              : mode === "setup"
                ? "Protect private notes"
                : "Unlock note"}
          </button>
        </form>
      )}
    </section>
  );
}

export default PrivateNoteGate;
