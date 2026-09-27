-- Text recognized on the Mac in image attachments (OCR-002), searchable next
-- to note text. Private notes never keep recognized text.
CREATE TABLE attachment_text (
  attachment_id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  recognized_at TEXT NOT NULL,
  FOREIGN KEY (attachment_id) REFERENCES attachments(id) ON DELETE CASCADE
);

CREATE VIRTUAL TABLE attachment_text_fts USING fts5(
  attachment_id UNINDEXED,
  text
);

CREATE TRIGGER attachment_text_insert_fts
AFTER INSERT ON attachment_text
BEGIN
  INSERT INTO attachment_text_fts (attachment_id, text)
  VALUES (NEW.attachment_id, NEW.text);
END;

CREATE TRIGGER attachment_text_update_fts
AFTER UPDATE OF text ON attachment_text
BEGIN
  UPDATE attachment_text_fts SET text = NEW.text
  WHERE attachment_id = NEW.attachment_id;
END;

CREATE TRIGGER attachment_text_delete_fts
AFTER DELETE ON attachment_text
BEGIN
  DELETE FROM attachment_text_fts WHERE attachment_id = OLD.attachment_id;
END;

CREATE TRIGGER notes_private_drop_attachment_text
AFTER UPDATE OF is_private ON notes
WHEN NEW.is_private = 1
BEGIN
  DELETE FROM attachment_text
  WHERE attachment_id IN (SELECT id FROM attachments WHERE note_id = NEW.id);
END;
