import fnd001Screenshot from "../docs/about/screenshots/fnd-001-native-shell.png";
import doc001Screenshot from "../docs/about/screenshots/doc-001-about-rule.png";

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
