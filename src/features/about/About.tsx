import db001Screenshot from "../../../docs/about/screenshots/db-001-sqlite-connection.png";
import db002Screenshot from "../../../docs/about/screenshots/db-002-migration-runner.png";
import doc001Screenshot from "../../../docs/about/screenshots/doc-001-about-rule.png";
import fnd001Screenshot from "../../../docs/about/screenshots/fnd-001-native-shell.png";
import fnd002Screenshot from "../../../docs/about/screenshots/fnd-002-tooling.png";
import fnd003Screenshot from "../../../docs/about/screenshots/fnd-003-project-structure.png";
import fnd004DarkScreenshot from "../../../docs/about/screenshots/fnd-004-dark-mode.png";
import fnd004Screenshot from "../../../docs/about/screenshots/fnd-004-design-tokens.png";
import fnd005Screenshot from "../../../docs/about/screenshots/fnd-005-desktop-shell.png";

interface AboutProps {
  onClose: () => void;
}

const evolution = [
  {
    id: "FND-001",
    title: "Native shell",
    date: "September 7, 2026",
    description:
      "The first NODI window: a clean Tauri 2, React, TypeScript, and Vite baseline running natively on macOS.",
    screenshot: fnd001Screenshot,
  },
  {
    id: "DOC-001",
    title: "Visual history becomes part of NODI",
    date: "September 7, 2026",
    description:
      "ABOUT was added as a permanent, accessible timeline, and visual documentation became part of every task's Definition of Done.",
    screenshot: doc001Screenshot,
  },
  {
    id: "FND-002",
    title: "A reliable development loop",
    date: "September 7, 2026",
    description:
      "The interface remains intentionally stable while type checking, linting, component tests, and browser-level tests now protect every next step.",
    screenshot: fnd002Screenshot,
  },
  {
    id: "FND-003",
    title: "Clear project boundaries",
    date: "September 7, 2026",
    description:
      "The visible baseline stays stable while application startup, global styles, and ABOUT move into clear, one-directional project layers.",
    screenshot: fnd003Screenshot,
  },
  {
    id: "FND-004",
    title: "A visual foundation",
    date: "September 7, 2026",
    description:
      "NODI gains shared design tokens and accessible System, Light, and Dark themes that persist across launches and also style ABOUT.",
    screenshot: fnd004Screenshot,
  },
  {
    id: "FND-004 · DARK",
    title: "The visual history after dark",
    date: "September 7, 2026",
    description:
      "The ABOUT timeline and its historical screenshots remain readable and visually consistent in NODI's Dark theme.",
    screenshot: fnd004DarkScreenshot,
  },
  {
    id: "FND-005",
    title: "The NODI workspace appears",
    date: "September 7, 2026",
    description:
      "The native window becomes a stable three-column workspace with a 232px sidebar, 320px note list, and flexible editor canvas.",
    screenshot: fnd005Screenshot,
  },
  {
    id: "DB-001",
    title: "A local source of truth",
    date: "September 7, 2026",
    description:
      "NODI now opens its SQLite database in the macOS application data directory and applies foreign keys, WAL, and a five-second busy timeout before the workspace becomes available.",
    screenshot: db001Screenshot,
  },
  {
    id: "DB-002",
    title: "A schema that evolves safely",
    date: "September 7, 2026",
    description:
      "The local database now applies one immutable, transactional initial migration before the workspace opens, records version 1, and skips it on subsequent launches.",
    screenshot: db002Screenshot,
  },
];

function About({ onClose }: AboutProps) {
  return (
    <main className="about-page">
      <header className="about-header">
        <div>
          <p className="eyebrow">ABOUT</p>
          <h1>The making of NODI</h1>
          <p className="about-intro">
            A visual record of each deliberate step from an empty native shell
            to a trustworthy personal notes app.
          </p>
        </div>
        <button className="text-button" type="button" onClick={onClose}>
          Back to NODI
        </button>
      </header>

      <ol className="timeline" aria-label="NODI implementation history">
        {evolution.map((entry) => (
          <li className="timeline-entry" key={entry.id}>
            <div className="entry-meta">
              <span>{entry.id}</span>
              <time>{entry.date}</time>
            </div>
            <div className="entry-content">
              <h2>{entry.title}</h2>
              <p>{entry.description}</p>
              <img
                src={entry.screenshot}
                alt={`NODI after completing ${entry.id}: ${entry.title}`}
              />
            </div>
          </li>
        ))}
      </ol>
    </main>
  );
}

export default About;
