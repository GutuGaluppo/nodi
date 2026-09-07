export const THEME_STORAGE_KEY = "nodi.theme";

export const themePreferences = ["system", "light", "dark"] as const;

export type ThemePreference = (typeof themePreferences)[number];

function isThemePreference(value: string | null): value is ThemePreference {
  return themePreferences.some((theme) => theme === value);
}

export function getStoredThemePreference(): ThemePreference {
  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(storedTheme) ? storedTheme : "system";
  } catch {
    return "system";
  }
}

export function applyThemePreference(theme: ThemePreference): void {
  document.documentElement.dataset.theme = theme;
}

export function storeThemePreference(theme: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The selected theme still applies for this session when storage is unavailable.
  }
}
