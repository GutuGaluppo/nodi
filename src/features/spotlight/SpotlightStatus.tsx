import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { spotlightKeys } from "./SpotlightSync";
import { getLastSpotlightRun, setSpotlightEnabled } from "./spotlight";

/** The Spotlight row on the "Your data" page (MAC-002). */
function SpotlightStatus() {
  const client = useQueryClient();
  const enabled = useQuery<boolean>({ queryKey: spotlightKeys.enabled });
  const lastRun = useQuery({
    queryKey: spotlightKeys.lastRun,
    queryFn: getLastSpotlightRun,
  });
  const toggle = useMutation({
    meta: { spotlight: true },
    mutationFn: setSpotlightEnabled,
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: ["spotlight"] });
    },
  });
  const on = enabled.data === true;

  return (
    <div className="data-row">
      <dt>Spotlight</dt>
      <dd>
        <span>
          {on
            ? lastRun.data && !lastRun.data.error
              ? `On · ${lastRun.data.indexed} ${lastRun.data.indexed === 1 ? "note" : "notes"} searchable in Spotlight`
              : "On"
            : "Off. Your notes don't appear in Spotlight."}
        </span>
        {on && lastRun.data?.error ? (
          <span className="data-status data-status-problem" role="alert">
            The last update failed: {lastRun.data.error}
          </span>
        ) : null}
        <span className="data-note">
          Public notes can appear in Spotlight searches; choosing one opens it
          in NODI. The index is kept by macOS on this Mac. Private notes are
          never included.
        </span>
        {toggle.isError ? (
          <span className="data-status data-status-problem" role="alert">
            Spotlight could not be updated: {String(toggle.error)}
          </span>
        ) : null}
        <button
          className="subtle-action"
          type="button"
          disabled={toggle.isPending || enabled.isPending}
          onClick={() => toggle.mutate(!on)}
        >
          {on ? "Remove notes from Spotlight" : "Show notes in Spotlight"}
        </button>
      </dd>
    </div>
  );
}

export default SpotlightStatus;
