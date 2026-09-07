import { useEffect, useState } from "react";
import DesktopShell from "../components/layout/DesktopShell";
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
    <DesktopShell
      theme={theme}
      onThemeChange={setTheme}
      onOpenAbout={() => setShowAbout(true)}
    />
  );
}

export default App;
