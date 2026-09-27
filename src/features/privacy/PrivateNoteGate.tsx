import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import Icon from "../../components/ui/Icon";
import { countEncryptedPrivateNotes } from "../../db/repositories/noteRepository";
import { notesKeys } from "../notes/useNotes";
import {
  getTouchIdSupport,
  hasPrivateNotesPassword,
  hasRecoveryKey,
  isTouchIdEnabled,
  prepareRecoveryKey,
  type RecoveryKeyDraft,
  recoverPrivateNotes,
  resetPasswordWithTouchId,
  setPrivateNotesPassword,
  startPrivateNotesOver,
  unlockPrivateNotes,
  unlockWithTouchId,
} from "./privateNotePassword";
import RecoveryKeyPanel from "./RecoveryKeyPanel";

interface PrivateNoteGateProps {
  /** Runs after the session opens; the gate stays busy until it settles. */
  onUnlocked: () => void | Promise<void>;
  /** Runs after encrypted private notes were deleted to start over. */
  onStartedOver?: () => void | Promise<void>;
}

type Mode =
  | "loading"
  | "setup"
  | "unlock"
  | "recover"
  | "start-over"
  | "save-key";

/** Why a recovery key is being shown, which decides its wording. */
type KeyReason = "new" | "missing" | "replace";

const MIN_PASSWORD = 8;
const START_OVER_WORD = "DELETE";

const HEADINGS: Record<Mode, string> = {
  loading: "This note is locked",
  setup: "Set a password",
  unlock: "This note is locked",
  recover: "Reset the password",
  "start-over": "Start private notes over",
  "save-key": "Save your recovery key",
};

const KEY_INTROS: Record<KeyReason, string> = {
  new: "Private notes are encrypted with your password. If you forget it, this recovery key is the only way back in.",
  missing:
    "Your private notes have no recovery key yet. Without one, a forgotten password means losing them.",
  replace:
    "Your password was reset with your recovery key. Save this new key: the old one stops working once you do.",
};

function useStartOver() {
  const queryClient = useQueryClient();
  return useMutation<number, Error>({
    mutationFn: startPrivateNotesOver,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notesKeys.all });
      void queryClient.invalidateQueries({ queryKey: ["storage-report"] });
    },
  });
}

function PrivateNoteGate({ onUnlocked, onStartedOver }: PrivateNoteGateProps) {
  const [mode, setMode] = useState<Mode>("loading");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [recoveryInput, setRecoveryInput] = useState("");
  const [startOverWord, setStartOverWord] = useState("");
  const [recoveryAvailable, setRecoveryAvailable] = useState(false);
  const [lockedCount, setLockedCount] = useState<number | null>(null);
  const [draft, setDraft] = useState<RecoveryKeyDraft | null>(null);
  const [keyReason, setKeyReason] = useState<KeyReason>("new");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  /** Touch ID is on for private notes, and what macOS will ask for. */
  const [touchId, setTouchId] = useState<{ biometrics: boolean } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const startOver = useStartOver();

  useEffect(() => {
    void hasPrivateNotesPassword().then((exists) =>
      setMode(exists ? "unlock" : "setup"),
    );
    void (async () => {
      if (!(await isTouchIdEnabled())) return;
      const support = await getTouchIdSupport();
      if (support.available) setTouchId({ biometrics: support.biometrics });
    })().catch(() => undefined);
  }, []);

  const touchIdName = touchId?.biometrics ? "Touch ID" : "your Mac password";

  useEffect(() => {
    if (mode !== "loading" && mode !== "save-key") inputRef.current?.focus();
  }, [mode]);

  function goTo(next: Mode) {
    setError("");
    setPassword("");
    setConfirmation("");
    setRecoveryInput("");
    setStartOverWord("");
    if (next === "recover") {
      // Known before the form appears, so focus lands on its first field.
      void hasRecoveryKey().then((exists) => {
        setRecoveryAvailable(exists);
        setMode(next);
      });
      return;
    }
    setMode(next);
    if (next === "start-over") {
      setLockedCount(null);
      void countEncryptedPrivateNotes().then(setLockedCount);
    }
  }

  function checkNewPassword(): boolean {
    if (password.length < MIN_PASSWORD) {
      setError(`Use a password with at least ${MIN_PASSWORD} characters.`);
      return false;
    }
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return false;
    }
    return true;
  }

  /** Shows a recovery key for `secret`, or finishes when none can be made. */
  async function offerRecoveryKey(
    secret: string,
    reason: KeyReason,
  ): Promise<void> {
    const next = await prepareRecoveryKey(secret);
    if (next === null) {
      await onUnlocked();
      return;
    }
    setDraft(next);
    setKeyReason(reason);
    setMode("save-key");
  }

  async function openWithTouchId() {
    setError("");
    setPending(true);
    try {
      if (await unlockWithTouchId()) await onUnlocked();
    } catch {
      setError(
        `${touchId?.biometrics ? "Touch ID" : "Your Mac password"} could not open private notes. Use your password.`,
      );
    } finally {
      setPending(false);
    }
  }

  async function resetWithTouchId() {
    setError("");
    if (!checkNewPassword()) return;
    setPending(true);
    try {
      if (await resetPasswordWithTouchId(password)) {
        if (await hasRecoveryKey()) {
          await onUnlocked();
        } else {
          await offerRecoveryKey(password, "missing");
        }
      }
    } catch {
      setError("The password could not be reset. Nothing was changed.");
    } finally {
      setPending(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === "recover" && !recoveryAvailable) {
      await resetWithTouchId();
      return;
    }
    setError("");
    if (mode === "unlock" && password.length < MIN_PASSWORD) {
      setError(`Use a password with at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if ((mode === "setup" || mode === "recover") && !checkNewPassword()) {
      return;
    }
    setPending(true);
    try {
      if (mode === "setup") {
        await setPrivateNotesPassword(password);
        await offerRecoveryKey(password, "new");
      } else if (mode === "recover") {
        if (await recoverPrivateNotes(recoveryInput, password)) {
          await offerRecoveryKey(password, "replace");
        } else {
          setError("That recovery key does not match. Check it and try again.");
        }
      } else if (await unlockPrivateNotes(password)) {
        if (await hasRecoveryKey()) {
          await onUnlocked();
        } else {
          await offerRecoveryKey(password, "missing");
        }
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

  async function confirmStartOver(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (startOverWord.trim().toUpperCase() !== START_OVER_WORD) {
      setError(`Type ${START_OVER_WORD} to confirm.`);
      return;
    }
    setError("");
    try {
      await startOver.mutateAsync();
    } catch {
      setError("Starting over did not finish. Try again.");
      return;
    }
    goTo("setup");
    await onStartedOver?.();
  }

  const passwordField = (
    <label>
      {mode === "recover" ? "New password" : "Password"}
      <input
        ref={mode === "recover" && recoveryAvailable ? undefined : inputRef}
        type="password"
        autoComplete={mode === "unlock" ? "current-password" : "new-password"}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
    </label>
  );

  const confirmationField = (
    <label>
      Confirm {mode === "recover" ? "new " : ""}password
      <input
        type="password"
        autoComplete="new-password"
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
      />
    </label>
  );

  const errorMessage = error ? (
    <p className="inline-error" role="alert">
      {error}
    </p>
  ) : null;

  return (
    <section className="private-note-gate" aria-label="Private note">
      <Icon name="lock" />
      <p className="section-label">Private note</p>
      <h2>{HEADINGS[mode]}</h2>

      {mode === "setup" ? (
        <p>
          Create one password to access private notes on this device. Private
          notes are encrypted with it. Next, NODI gives you a recovery key for
          the day you forget it.
        </p>
      ) : mode === "unlock" ? (
        <p>Enter your password to view and edit this note.</p>
      ) : mode === "recover" && recoveryAvailable && touchId ? (
        <p>
          Enter the recovery key you saved, or use {touchIdName} on this Mac,
          then choose a new password. Your notes stay as they are.
        </p>
      ) : mode === "recover" && recoveryAvailable ? (
        <p>
          Enter the recovery key you saved when you set up private notes, then
          choose a new password. Your notes stay as they are.
        </p>
      ) : mode === "recover" && touchId ? (
        <p>
          Choose a new password, then confirm it with {touchIdName} on this Mac.
          Your notes stay as they are.
        </p>
      ) : mode === "recover" ? (
        <p>
          No recovery key was saved for these notes, so they cannot be opened
          without the password.
        </p>
      ) : mode === "start-over" ? (
        <p>
          {lockedCount === null
            ? "Counting private notes…"
            : `${lockedCount} encrypted private ${lockedCount === 1 ? "note" : "notes"} will be deleted for good. Without the password or the recovery key, no one can open them again, not even NODI.`}{" "}
          Your other notes are not touched.
        </p>
      ) : mode === "save-key" ? (
        <p>{KEY_INTROS[keyReason]}</p>
      ) : null}

      {mode === "setup" || mode === "unlock" ? (
        <form onSubmit={(event) => void submit(event)}>
          {passwordField}
          {mode === "setup" ? confirmationField : null}
          {errorMessage}
          <button className="primary-button" type="submit" disabled={pending}>
            {pending
              ? "Checking…"
              : mode === "setup"
                ? "Protect private notes"
                : "Unlock note"}
          </button>
          {mode === "unlock" && touchId ? (
            <button
              className="secondary-button gate-touch-id"
              type="button"
              disabled={pending}
              onClick={() => void openWithTouchId()}
            >
              <Icon name={touchId.biometrics ? "fingerprint" : "lock"} />
              Unlock with {touchIdName}
            </button>
          ) : null}
          {mode === "unlock" ? (
            <button
              className="subtle-action gate-link"
              type="button"
              onClick={() => goTo("recover")}
            >
              Forgot password?
            </button>
          ) : null}
        </form>
      ) : null}

      {mode === "recover" ? (
        <form onSubmit={(event) => void submit(event)}>
          {recoveryAvailable || touchId ? (
            <>
              {recoveryAvailable ? (
                <label>
                  Recovery key
                  <input
                    ref={inputRef}
                    className="recovery-key-input"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
                    value={recoveryInput}
                    onChange={(event) => setRecoveryInput(event.target.value)}
                  />
                </label>
              ) : null}
              {passwordField}
              {confirmationField}
              {errorMessage}
              <div className="gate-buttons">
                {recoveryAvailable ? (
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={pending}
                  >
                    {pending ? "Checking…" : "Reset password"}
                  </button>
                ) : null}
                {touchId ? (
                  <button
                    className={
                      recoveryAvailable ? "secondary-button" : "primary-button"
                    }
                    type={recoveryAvailable ? "button" : "submit"}
                    disabled={pending}
                    onClick={
                      recoveryAvailable
                        ? () => void resetWithTouchId()
                        : undefined
                    }
                  >
                    Reset with {touchIdName}
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
          <div className="gate-links">
            <button
              className="subtle-action gate-link"
              type="button"
              onClick={() => goTo("unlock")}
            >
              Back to password
            </button>
            <button
              className="subtle-action gate-link danger-action"
              type="button"
              onClick={() => goTo("start-over")}
            >
              {recoveryAvailable
                ? "I lost my recovery key too"
                : "Start private notes over"}
            </button>
          </div>
        </form>
      ) : null}

      {mode === "start-over" ? (
        <form onSubmit={(event) => void confirmStartOver(event)}>
          <label>
            Type {START_OVER_WORD} to confirm
            <input
              ref={inputRef}
              autoComplete="off"
              spellCheck={false}
              value={startOverWord}
              onChange={(event) => setStartOverWord(event.target.value)}
            />
          </label>
          {errorMessage}
          <button
            className="danger-button"
            type="submit"
            disabled={startOver.isPending || lockedCount === null}
          >
            {startOver.isPending
              ? "Deleting…"
              : "Delete private notes and start over"}
          </button>
          <button
            className="subtle-action gate-link"
            type="button"
            onClick={() => goTo("recover")}
          >
            Cancel
          </button>
        </form>
      ) : null}

      {mode === "save-key" && draft ? (
        <RecoveryKeyPanel
          draft={draft}
          onSaved={onUnlocked}
          onLater={keyReason === "new" ? undefined : () => void onUnlocked()}
        />
      ) : null}
    </section>
  );
}

export default PrivateNoteGate;
