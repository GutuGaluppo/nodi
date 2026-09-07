CREATE UNIQUE INDEX shortcuts_unique_target
ON shortcuts (target_type, target_id);

CREATE TRIGGER notes_cleanup_shortcuts
AFTER DELETE ON notes
BEGIN
  DELETE FROM shortcuts WHERE target_type = 'note' AND target_id = OLD.id;
END;

CREATE TRIGGER notebooks_cleanup_shortcuts
AFTER DELETE ON notebooks
BEGIN
  DELETE FROM shortcuts WHERE target_type = 'notebook' AND target_id = OLD.id;
END;
