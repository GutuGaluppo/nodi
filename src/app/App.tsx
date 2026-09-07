import { useEffect, useState } from "react";
import ThemeSelector from "../components/ui/ThemeSelector";
import About from "../features/about/About";
import {
  applyThemePreference,
  getStoredThemePreference,
  storeThemePreference,
  type ThemePreference,
} from "./theme";

function App() {
  const [showAbout, setShowAbout] = useState(false);
  const [theme, setTheme] = useState<ThemePreference>(getStoredThemePreference);

  useEffect(() => {
    applyThemePreference(theme);
    storeThemePreference(theme);
  }, [theme]);

  if (showAbout) {
    return <About onClose={() => setShowAbout(false)} />;
  }

  return (
    <main className="app-shell">
      <div className="app-actions">
        <ThemeSelector value={theme} onChange={setTheme} />
        <button
          className="text-button"
          type="button"
          onClick={() => setShowAbout(true)}
        >
          About
        </button>
      </div>
      <h1>NODI</h1>
      <p>Local notes, ready for what comes next.</p>
    </main>
  );
}

export default App;
