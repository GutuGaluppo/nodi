import type { ThemePreference } from "../../app/theme";
import { themePreferences } from "../../app/theme";

interface ThemeSelectorProps {
  value: ThemePreference;
  onChange: (theme: ThemePreference) => void;
}

const labels: Record<ThemePreference, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

function ThemeSelector({ value, onChange }: ThemeSelectorProps) {
  return (
    <fieldset className="theme-selector">
      <legend className="visually-hidden">Theme</legend>
      {themePreferences.map((theme) => (
        <button
          aria-pressed={theme === value}
          className="theme-option"
          key={theme}
          type="button"
          onClick={() => onChange(theme)}
        >
          {labels[theme]}
        </button>
      ))}
    </fieldset>
  );
}

export default ThemeSelector;
