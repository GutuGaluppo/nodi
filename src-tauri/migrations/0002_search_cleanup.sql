CREATE VIRTUAL TABLE notes_fts USING fts5(
  note_id UNINDEXED,
  title,
  content_text,
  tags_text,
  notebook_text
);

CREATE TRIGGER notes_cleanup_fts
AFTER DELETE ON notes
BEGIN
  DELETE FROM notes_fts WHERE note_id = OLD.id;
END;
