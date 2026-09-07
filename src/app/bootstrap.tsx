import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { applyThemePreference, getStoredThemePreference } from "./theme";
import "../styles/tokens.css";
import "../styles/themes.css";
import "../styles/global.css";

applyThemePreference(getStoredThemePreference());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
