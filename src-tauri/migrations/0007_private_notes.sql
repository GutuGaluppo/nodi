ALTER TABLE notes ADD COLUMN is_private INTEGER NOT NULL DEFAULT 0;

DELETE FROM notes_fts;

INSERT INTO notes_fts (note_id, title, content_text, tags_text, notebook_text)
SELECT
  notes.id,
  notes.title,
  notes.content_text,
  COALESCE((
    SELECT group_concat(tags.name, ' ')
    FROM note_tags
    INNER JOIN tags ON tags.id = note_tags.tag_id
    WHERE note_tags.note_id = notes.id
  ), ''),
  COALESCE(notebooks.name, '')
FROM notes
LEFT JOIN notebooks ON notebooks.id = notes.notebook_id
WHERE notes.is_private = 0;

DROP TRIGGER notes_insert_fts;
DROP TRIGGER notes_update_fts;

CREATE TRIGGER notes_insert_fts
AFTER INSERT ON notes
WHEN NEW.is_private = 0
BEGIN
  INSERT INTO notes_fts (note_id, title, content_text, tags_text, notebook_text)
  VALUES (NEW.id, NEW.title, NEW.content_text, '', COALESCE((SELECT name FROM notebooks WHERE id = NEW.notebook_id), ''));
END;

CREATE TRIGGER notes_update_fts
AFTER UPDATE OF title, content_text, notebook_id, is_private ON notes
BEGIN
  DELETE FROM notes_fts WHERE note_id = NEW.id;
  INSERT INTO notes_fts (note_id, title, content_text, tags_text, notebook_text)
  SELECT NEW.id, NEW.title, NEW.content_text,
    COALESCE((SELECT group_concat(tags.name, ' ') FROM note_tags INNER JOIN tags ON tags.id = note_tags.tag_id WHERE note_tags.note_id = NEW.id), ''),
    COALESCE((SELECT name FROM notebooks WHERE id = NEW.notebook_id), '')
  WHERE NEW.is_private = 0;
END;
