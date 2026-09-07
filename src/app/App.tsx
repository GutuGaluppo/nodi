import { useState } from "react";
import About from "../features/about/About";

function App() {
  const [showAbout, setShowAbout] = useState(false);

  if (showAbout) {
    return <About onClose={() => setShowAbout(false)} />;
  }

  return (
    <main className="app-shell">
      <button
        className="about-link"
        type="button"
        onClick={() => setShowAbout(true)}
      >
        About
      </button>
      <h1>NODI</h1>
      <p>Local notes, ready for what comes next.</p>
    </main>
  );
}

export default App;
