import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";
import { listAttachmentPaths } from "../../db/repositories/attachmentRepository";

/**
 * Once per launch, deletes stored files that no attachment record references
 * any more — for example the recordings of a note deleted from the Trash.
 */
export async function sweepAttachments(): Promise<number> {
  const keep = await listAttachmentPaths();
  return invoke<number>("sweep_attachments", { keep });
}

function AttachmentSweeper() {
  useEffect(() => {
    sweepAttachments().catch((error) =>
      console.error("NODI could not clean up attachments", error),
    );
  }, []);
  return null;
}

export default AttachmentSweeper;
