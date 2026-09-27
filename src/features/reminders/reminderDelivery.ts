import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import {
  type DueReminder,
  listDueReminders,
  markReminderDelivered,
} from "../../db/repositories/reminderRepository";

export type Notify = (reminder: DueReminder) => Promise<void>;

/** Shows a reminder as a local macOS notification. Nothing leaves the Mac. */
export const notifyWithSystem: Notify = async (reminder) => {
  let granted = await isPermissionGranted();
  if (!granted) {
    granted = (await requestPermission()) === "granted";
  }
  if (!granted) {
    throw new Error("Notifications are not allowed for NODI.");
  }
  sendNotification({ title: "NODI reminder", body: reminder.noteLabel });
};

/**
 * Delivers every reminder that is due and marks it delivered, so it never
 * fires twice. A reminder whose notification fails stays pending and is tried
 * again on the next pass. Returns how many were delivered.
 */
export async function deliverDueReminders(
  now: Date,
  notify: Notify = notifyWithSystem,
): Promise<number> {
  const due = await listDueReminders(now);
  let delivered = 0;
  for (const reminder of due) {
    try {
      await notify(reminder);
    } catch (error) {
      console.error("NODI could not show a reminder", error);
      continue;
    }
    await markReminderDelivered(reminder.id, now);
    delivered += 1;
  }
  return delivered;
}
