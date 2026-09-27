-- On-device sentence embeddings for related notes (REL-001). A vector is
-- derived from a note's text, so private notes never keep one.
CREATE TABLE note_embeddings (
  note_id TEXT PRIMARY KEY,
  language TEXT,
  vector TEXT NOT NULL,
  source_updated_at TEXT NOT NULL,
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);

CREATE TRIGGER notes_private_drop_embedding
AFTER UPDATE OF is_private ON notes
WHEN NEW.is_private = 1
BEGIN
  DELETE FROM note_embeddings WHERE note_id = NEW.id;
END;
