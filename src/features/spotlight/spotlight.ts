import { invoke } from "@tauri-apps/api/core";
import { listExportableNotes } from "../../db/repositories/exportRepository";
import {
  getSetting,
  setSetting,
} from "../../db/repositories/settingsRepository";

const ENABLED_SETTING = "spotlight_enabled";
const LAST_RUN_SETTING = "spotlight_last_run";

/** The outcome of the last Spotlight pass, for the "Your data" page. */
export interface SpotlightRun {
  at: string;
  indexed: number;
  error?: string;
}

export async function getLastSpotlightRun(): Promise<SpotlightRun | null> {
  const stored = await getSetting(LAST_RUN_SETTING);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as SpotlightRun;
  } catch {
    return null;
  }
}

/** Spotlight is off until the user turns it on. */
export async function isSpotlightEnabled(): Promise<boolean> {
  return (await getSetting(ENABLED_SETTING)) === "true";
}

/**
 * Replaces NODI's Spotlight entries with the current public notes: title, a
 * text snippet, and tags and notebook as keywords. Private and trashed notes
 * are never included. Returns how many notes are indexed.
 */
export async function syncSpotlight(): Promise<number> {
  const notes = await listExportableNotes();
  const at = new Date().toISOString();
  try {
    const indexed = await invoke<number>("spotlight_replace_notes", {
      notes: notes.map((note) => ({
        id: note.id,
        title: note.title,
        text: note.contentText,
        keywords: [...note.tags, ...(note.notebook ? [note.notebook] : [])],
      })),
    });
    await setSetting(LAST_RUN_SETTING, JSON.stringify({ at, indexed }));
    return indexed;
  } catch (error) {
    await setSetting(
      LAST_RUN_SETTING,
      JSON.stringify({ at, indexed: 0, error: String(error) }),
    );
    throw error;
  }
}

export async function setSpotlightEnabled(enabled: boolean): Promise<number> {
  await setSetting(ENABLED_SETTING, String(enabled));
  if (!enabled) {
    await invoke("spotlight_clear");
    return 0;
  }
  return syncSpotlight();
}
