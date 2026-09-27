-- Private notes keep their title and body in an AES-GCM envelope. The
-- plaintext columns of an encrypted note hold empty values.
ALTER TABLE notes ADD COLUMN encrypted_payload TEXT;
