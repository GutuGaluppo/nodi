const KEEP_AUDIO_SETTING = "nodi.voice.keepAudio";

/**
 * Whether dictations keep their recording. On by default, so the playable
 * transcript is there unless the user chose otherwise; an explicit "off" is
 * remembered. Private notes never keep audio, whatever this says.
 */
export function readKeepAudio(): boolean {
  try {
    return window.localStorage.getItem(KEEP_AUDIO_SETTING) !== "false";
  } catch {
    return true;
  }
}

export function storeKeepAudio(value: boolean): void {
  try {
    window.localStorage.setItem(KEEP_AUDIO_SETTING, String(value));
  } catch {
    // The preference is a convenience; losing it changes nothing else.
  }
}
