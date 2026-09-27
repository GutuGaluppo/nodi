-- Reminders fire as local macOS notifications while NODI is running; a
-- reminder that came due while NODI was closed fires on the next launch.
CREATE TABLE reminders (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL,
  remind_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  delivered_at TEXT,
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);

CREATE INDEX reminders_pending ON reminders (delivered_at, remind_at);
