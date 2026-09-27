import { convertFileSrc } from "@tauri-apps/api/core";
import { appDataDir } from "@tauri-apps/api/path";

/**
 * Turns a stored attachment path (`attachments/ab/…/image.png`) into a URL the
 * webview may load through Tauri's asset protocol. The app data directory is
 * resolved once at startup, so editor rendering can stay synchronous.
 */
let appData: string | null = null;

export async function initAttachmentUrls(): Promise<void> {
  appData = (await appDataDir()).replace(/\/+$/, "");
}

export function attachmentUrl(relativePath: string): string {
  if (appData === null) return "";
  return convertFileSrc(`${appData}/${relativePath.replace(/^\/+/, "")}`);
}
