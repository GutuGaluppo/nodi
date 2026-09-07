CREATE TRIGGER notebook_stacks_unlink_notebooks
BEFORE DELETE ON notebook_stacks
BEGIN
  UPDATE notebooks
  SET stack_id = NULL,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE stack_id = OLD.id;
END;
