import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { deliverDueReminders } from "./reminderDelivery";
import { reminderKeys } from "./reminderQueries";

const CHECK_INTERVAL_MS = 30_000;

/**
 * Checks for due reminders when NODI starts and every 30 seconds while it
 * runs. Reminders that came due while NODI was closed fire on the next launch.
 */
function ReminderScheduler() {
  const client = useQueryClient();

  useEffect(() => {
    let running = false;
    async function check(): Promise<void> {
      if (running) return;
      running = true;
      try {
        const delivered = await deliverDueReminders(new Date());
        if (delivered > 0) {
          await client.invalidateQueries({ queryKey: reminderKeys.all });
        }
      } catch (error) {
        console.error("NODI could not check reminders", error);
      } finally {
        running = false;
      }
    }

    void check();
    const interval = setInterval(() => void check(), CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [client]);

  return null;
}

export default ReminderScheduler;
