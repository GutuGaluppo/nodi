import { useQuery } from "@tanstack/react-query";
import { appDataDir, join } from "@tauri-apps/api/path";
import { useState } from "react";
import { getStorageReport } from "../../db/repositories/storageRepository";
import ImageTextStatus from "../images/ImageTextStatus";
import MirrorStatus from "../mirror/MirrorStatus";
import { describeNetworkPolicy } from "./networkPolicy";

interface YourDataProps {
  onClose: () => void;
}

const DATABASE_FILE = "nodi.db";

function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(value)} ${units[unit]}`;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * Shows where the user's data lives and the evidence behind NODI's privacy
 * promises. Every value is read from the live database or the enforced
 * security configuration; nothing is sent anywhere.
 */
function YourData({ onClose }: YourDataProps) {
  const report = useQuery({
    queryKey: ["storage-report"],
    queryFn: getStorageReport,
  });
  const location = useQuery({
    queryKey: ["database-location"],
    queryFn: async () => join(await appDataDir(), DATABASE_FILE),
  });
  const [copyStatus, setCopyStatus] = useState("");
  const network = describeNetworkPolicy();

  async function copyLocation(path: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(path);
      setCopyStatus("Location copied.");
    } catch {
      setCopyStatus("Copy failed. Select the path and copy it manually.");
    }
  }

  const data = report.data;
  const path = location.data;
  const healthy = data?.integrity.length === 1 && data.integrity[0] === "ok";

  return (
    <main className="about-page your-data-page">
      <header className="about-header">
        <div>
          <p className="eyebrow">YOUR DATA</p>
          <h1>Everything stays on this Mac</h1>
          <p className="about-intro">
            Where NODI keeps your notes, and the checks behind its privacy.
            These values are read from your database and NODI's security
            settings each time you open this page.
          </p>
        </div>
        <button className="text-button" type="button" onClick={onClose}>
          Back to NODI
        </button>
      </header>

      {report.isError ? (
        <p className="inline-error" role="alert">
          The storage report could not be read. Your data was not changed.
        </p>
      ) : null}

      <dl className="data-report" aria-busy={report.isPending}>
        <div className="data-row">
          <dt>Location</dt>
          <dd>
            {path ? (
              <>
                <code className="data-path">{path}</code>
                <button
                  className="subtle-action"
                  type="button"
                  onClick={() => void copyLocation(path)}
                >
                  Copy location
                </button>
                <span className="data-note" role="status">
                  {copyStatus}
                </span>
              </>
            ) : location.isPending ? (
              "Reading…"
            ) : (
              "Unavailable outside the NODI app."
            )}
          </dd>
        </div>

        <div className="data-row">
          <dt>Database size</dt>
          <dd>{data ? formatBytes(data.sizeBytes) : "Reading…"}</dd>
        </div>

        <div className="data-row">
          <dt>Integrity</dt>
          <dd>
            {data ? (
              healthy ? (
                <span className="data-status data-status-ok">
                  Healthy. SQLite found no problems.
                </span>
              ) : (
                <div role="alert">
                  <span className="data-status data-status-problem">
                    SQLite reported problems
                  </span>
                  <ul className="data-problems">
                    {data.integrity.map((problem) => (
                      <li key={problem}>{problem}</li>
                    ))}
                  </ul>
                </div>
              )
            ) : (
              "Checking…"
            )}
          </dd>
        </div>

        <div className="data-row">
          <dt>Notes</dt>
          <dd>
            {data
              ? `${plural(data.activeNotes, "note", "notes")} · ${data.trashedNotes} in Trash`
              : "Reading…"}
          </dd>
        </div>

        <div className="data-row">
          <dt>Private notes</dt>
          <dd>
            {data ? (
              <>
                <span>
                  {plural(
                    data.encryptedPrivateNotes,
                    "encrypted note",
                    "encrypted notes",
                  )}
                </span>
                {data.pendingPrivateNotes > 0 ? (
                  <span className="data-status data-status-problem">
                    {plural(
                      data.pendingPrivateNotes,
                      "private note is",
                      "private notes are",
                    )}{" "}
                    not encrypted yet. Unlock a private note to encrypt{" "}
                    {data.pendingPrivateNotes === 1 ? "it" : "them"}.
                  </span>
                ) : null}
                <span className="data-note">
                  Titles and content are sealed with AES-256-GCM. The password
                  is never stored, so a forgotten password cannot be recovered.
                </span>
              </>
            ) : (
              "Reading…"
            )}
          </dd>
        </div>

        <div className="data-row">
          <dt>Network</dt>
          <dd>
            <span
              className={`data-status ${network.blocked ? "data-status-ok" : "data-status-problem"}`}
            >
              {network.summary}
            </span>
            <span className="data-note">{network.detail}</span>
          </dd>
        </div>

        <ImageTextStatus />

        <MirrorStatus />

        <div className="data-row">
          <dt>Backups</dt>
          <dd>
            No backups yet. To keep one, copy the database file shown above
            while NODI is closed.
          </dd>
        </div>
      </dl>
    </main>
  );
}

export default YourData;
