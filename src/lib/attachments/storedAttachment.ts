/** A file the Rust side stored in attachment storage. */
export interface StoredAttachment {
  relativePath: string;
  sha256: string;
  size: number;
  filename: string;
  mimeType: string;
}

export interface RejectedFile {
  name: string;
  reason: string;
}

export interface ImageImport {
  stored: StoredAttachment[];
  rejected: RejectedFile[];
}
