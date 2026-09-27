import {
  useChooseMirrorFolder,
  useLastMirrorRun,
  useMirrorFolder,
  useRebuildMirror,
  useStopMirroring,
} from "./mirrorQueries";

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** The Markdown mirror's row on the "Your data" page (MIRROR-002). */
function MirrorStatus() {
  const folder = useMirrorFolder();
  const lastRun = useLastMirrorRun();
  const choose = useChooseMirrorFolder();
  const rebuild = useRebuildMirror();
  const stop = useStopMirroring();
  const busy = choose.isPending || rebuild.isPending || stop.isPending;
  const run = lastRun.data;

  return (
    <div className="data-row">
      <dt>Markdown mirror</dt>
      <dd>
        {folder.isPending ? (
          "Reading…"
        ) : folder.data ? (
          <>
            <code className="data-path">{folder.data}</code>
            {run ? (
              run.error ? (
                <span className="data-status data-status-problem" role="alert">
                  The last update failed: {run.error}
                </span>
              ) : (
                <span>
                  {plural(run.files, "note", "notes")} mirrored{" "}
                  {timeFormatter.format(new Date(run.at))}
                  {run.written + run.deleted > 0
                    ? ` · ${run.written} written, ${run.deleted} removed`
                    : ""}
                </span>
              )
            ) : (
              <span>Not mirrored yet.</span>
            )}
            {run && run.failures.length > 0 ? (
              <div role="alert">
                <span className="data-status data-status-problem">
                  {plural(run.failures.length, "file", "files")} could not be
                  written
                </span>
                <ul className="data-problems">
                  {run.failures.map((failure) => (
                    <li key={failure.path}>
                      {failure.path}: {failure.error}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <span className="data-note">
              One Markdown file per note, updated after every change. Private
              notes are never mirrored. Files you add to this folder are left
              alone.
            </span>
            <span className="data-actions">
              <button
                className="subtle-action"
                type="button"
                disabled={busy}
                onClick={() => rebuild.mutate()}
              >
                {rebuild.isPending ? "Rebuilding…" : "Rebuild mirror"}
              </button>
              <button
                className="subtle-action"
                type="button"
                disabled={busy}
                onClick={() => choose.mutate()}
              >
                Change folder…
              </button>
              <button
                className="subtle-action"
                type="button"
                disabled={busy}
                onClick={() => stop.mutate()}
              >
                Stop mirroring
              </button>
            </span>
          </>
        ) : (
          <>
            <span>
              Off. Keep a folder of Markdown files that mirrors your notes, so
              they outlive NODI.
            </span>
            <button
              className="subtle-action"
              type="button"
              disabled={busy}
              onClick={() => choose.mutate()}
            >
              Choose folder…
            </button>
          </>
        )}
      </dd>
    </div>
  );
}

export default MirrorStatus;
