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
LEFT JOIN notebooks ON notebooks.id = notes.notebook_id;

CREATE TRIGGER notes_insert_fts
AFTER INSERT ON notes
BEGIN
  INSERT INTO notes_fts (note_id, title, content_text, tags_text, notebook_text)
  VALUES (
    NEW.id,
    NEW.title,
    NEW.content_text,
    '',
    COALESCE((SELECT name FROM notebooks WHERE id = NEW.notebook_id), '')
  );
END;

CREATE TRIGGER notes_update_fts
AFTER UPDATE OF title, content_text, notebook_id ON notes
BEGIN
  UPDATE notes_fts
  SET title = NEW.title,
      content_text = NEW.content_text,
      notebook_text = COALESCE((SELECT name FROM notebooks WHERE id = NEW.notebook_id), '')
  WHERE note_id = NEW.id;
END;

CREATE TRIGGER note_tags_insert_fts
AFTER INSERT ON note_tags
BEGIN
  UPDATE notes_fts
  SET tags_text = COALESCE((
    SELECT group_concat(tags.name, ' ')
    FROM note_tags
    INNER JOIN tags ON tags.id = note_tags.tag_id
    WHERE note_tags.note_id = NEW.note_id
  ), '')
  WHERE note_id = NEW.note_id;
END;

CREATE TRIGGER note_tags_delete_fts
AFTER DELETE ON note_tags
BEGIN
  UPDATE notes_fts
  SET tags_text = COALESCE((
    SELECT group_concat(tags.name, ' ')
    FROM note_tags
    INNER JOIN tags ON tags.id = note_tags.tag_id
    WHERE note_tags.note_id = OLD.note_id
  ), '')
  WHERE note_id = OLD.note_id;
END;

CREATE TRIGGER tags_update_fts
AFTER UPDATE OF name ON tags
BEGIN
  UPDATE notes_fts
  SET tags_text = COALESCE((
    SELECT group_concat(tags.name, ' ')
    FROM note_tags
    INNER JOIN tags ON tags.id = note_tags.tag_id
    WHERE note_tags.note_id = notes_fts.note_id
  ), '')
  WHERE note_id IN (SELECT note_id FROM note_tags WHERE tag_id = NEW.id);
END;

CREATE TRIGGER notebooks_update_fts
AFTER UPDATE OF name ON notebooks
BEGIN
  UPDATE notes_fts
  SET notebook_text = NEW.name
  WHERE note_id IN (SELECT id FROM notes WHERE notebook_id = NEW.id);
END;
