import { invoke } from "@tauri-apps/api/core";
import { listExportableNotes } from "../../db/repositories/exportRepository";
import {
  getSetting,
  setSetting,
} from "../../db/repositories/settingsRepository";
import { buildMirrorFiles } from "./mirrorFiles";

const LAST_RUN_SETTING = "markdown_mirror_last_run";

export interface MirrorFailure {
  path: string;
  error: string;
}

/** The outcome of one mirror pass, kept for the "Your data" page (MIRROR-002). */
export interface MirrorRun {
  at: string;
  files: number;
  written: number;
  unchanged: number;
  deleted: number;
  failures: MirrorFailure[];
  /** Set when the whole pass failed, for example a missing folder. */
  error?: string;
}

interface MirrorReport {
  written: number;
  unchanged: number;
  deleted: number;
  failures: MirrorFailure[];
}

export function getMirrorFolder(): Promise<string | null> {
  return invoke<string | null>("get_mirror_folder");
}

/** Opens the native folder picker; resolves to null when the user cancels. */
export function chooseMirrorFolder(): Promise<string | null> {
  return invoke<string | null>("choose_mirror_folder");
}

export function stopMirroring(): Promise<void> {
  return invoke<void>("clear_mirror_folder");
}

export async function getLastMirrorRun(): Promise<MirrorRun | null> {
  const stored = await getSetting(LAST_RUN_SETTING);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as MirrorRun;
  } catch {
    return null;
  }
}

/**
 * Writes every exportable note to the mirror folder. `force` rewrites files
 * even when unchanged ("Rebuild mirror"). The outcome is recorded either way.
 */
export async function runMirror(force = false): Promise<MirrorRun> {
  const files = buildMirrorFiles(await listExportableNotes());
  let run: MirrorRun;
  try {
    const report = await invoke<MirrorReport>("write_mirror", {
      files,
      force,
    });
    run = { at: new Date().toISOString(), files: files.length, ...report };
  } catch (error) {
    run = {
      at: new Date().toISOString(),
      files: files.length,
      written: 0,
      unchanged: 0,
      deleted: 0,
      failures: [],
      error: String(error),
    };
  }
  await setSetting(LAST_RUN_SETTING, JSON.stringify(run));
  return run;
}
