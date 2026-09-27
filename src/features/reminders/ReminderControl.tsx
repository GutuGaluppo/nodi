import { type FormEvent, useState } from "react";
import Icon from "../../components/ui/Icon";
import {
  useClearReminder,
  useReminder,
  useSetReminder,
} from "./reminderQueries";

interface ReminderControlProps {
  noteId: string;
}

const formatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

/** Formats a date for a `datetime-local` input, in local time. */
export function toLocalInputValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The start of the next hour: a sensible default for a new reminder. */
function nextHour(now = new Date()): Date {
  const next = new Date(now);
  next.setHours(now.getHours() + 1, 0, 0, 0);
  return next;
}

function ReminderControl({ noteId }: ReminderControlProps) {
  const reminder = useReminder(noteId);
  const setReminder = useSetReminder();
  const clearReminder = useClearReminder();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const inputId = `note-reminder-${noteId}`;

  function startEditing(): void {
    const current = reminder.data ? new Date(reminder.data.remindAt) : null;
    setValue(toLocalInputValue(current ?? nextHour()));
    setError("");
    setEditing(true);
  }

  function save(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const remindAt = new Date(value);
    if (Number.isNaN(remindAt.getTime())) {
      setError("Choose a date and time.");
      return;
    }
    if (remindAt.getTime() <= Date.now()) {
      setError("Choose a time in the future.");
      return;
    }
    setReminder.mutate(
      { noteId, remindAt },
      {
        onSuccess: () => setEditing(false),
        onError: () => setError("The reminder could not be saved."),
      },
    );
  }

  if (editing) {
    return (
      <form className="note-reminder-control" onSubmit={save}>
        <label htmlFor={inputId}>Remind me</label>
        <input
          id={inputId}
          type="datetime-local"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <button
          className="text-button"
          type="submit"
          disabled={setReminder.isPending}
        >
          Save reminder
        </button>
        <button
          className="text-button"
          type="button"
          onClick={() => setEditing(false)}
        >
          Cancel
        </button>
        {error ? (
          <span className="inline-error" role="alert">
            {error}
          </span>
        ) : null}
      </form>
    );
  }

  const pending = reminder.data;
  return (
    <div className="note-reminder-control">
      <span className="note-reminder-label">Reminder</span>
      {pending ? (
        <span className="note-reminder">
          <button
            type="button"
            className="note-reminder-time"
            aria-label={`Change reminder, ${formatter.format(new Date(pending.remindAt))}`}
            onClick={startEditing}
          >
            <Icon name="bell" />
            {formatter.format(new Date(pending.remindAt))}
          </button>
          <button
            type="button"
            aria-label="Remove reminder"
            title="Remove reminder"
            disabled={clearReminder.isPending}
            onClick={() => clearReminder.mutate(noteId)}
          >
            ×
          </button>
        </span>
      ) : (
        <button
          type="button"
          className="note-reminder-add"
          onClick={startEditing}
        >
          Add reminder
        </button>
      )}
    </div>
  );
}

export default ReminderControl;
