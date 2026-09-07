import { DatabaseError } from "../lib/errors/DatabaseError";
import { createId } from "../lib/ids/id";
import { getSetting, setSetting } from "./repositories/settingsRepository";

/**
 * Stable identifier for this installation of NODI.
 *
 * It is generated once on first launch, stored in the `settings` table, and
 * reused on every later launch. Note creation stamps each note with this value
 * (alongside `revision` and `updated_at`) so the schema is ready for future
 * multi-device sync without a redesign. Sync itself is not implemented yet.
 */
export const DEVICE_ID_SETTING_KEY = "device_id";

let deviceIdPromise: Promise<string> | undefined;

async function loadDeviceId(): Promise<string> {
  try {
    const existing = await getSetting(DEVICE_ID_SETTING_KEY);
    if (existing) {
      return existing;
    }

    const deviceId = createId();
    await setSetting(DEVICE_ID_SETTING_KEY, deviceId);
    return deviceId;
  } catch (cause) {
    if (cause instanceof DatabaseError) {
      throw cause;
    }

    throw new DatabaseError(
      "Could not establish this device's local identity.",
      cause,
    );
  }
}

/**
 * Resolve the local device identifier, creating and persisting it on first use.
 * The result is cached for the lifetime of the session; a failure clears the
 * cache so a later call can retry.
 */
export function ensureDeviceId(): Promise<string> {
  deviceIdPromise ??= loadDeviceId().catch((error: unknown) => {
    deviceIdPromise = undefined;
    throw error;
  });

  return deviceIdPromise;
}
