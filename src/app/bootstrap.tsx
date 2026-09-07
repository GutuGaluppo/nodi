import React from "react";
import ReactDOM from "react-dom/client";
import { initializeDatabase } from "../db/database";
import App from "./App";
import StartupScreen from "./StartupScreen";
import { applyThemePreference, getStoredThemePreference } from "./theme";
import "../styles/tokens.css";
import "../styles/themes.css";
import "../styles/global.css";

applyThemePreference(getStoredThemePreference());

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement,
);

function renderApplication(content: React.ReactNode): void {
  root.render(<React.StrictMode>{content}</React.StrictMode>);
}

async function bootstrapApplication(): Promise<void> {
  renderApplication(<StartupScreen status="loading" />);

  try {
    if (import.meta.env.VITE_E2E !== "true") {
      await initializeDatabase();
    }

    renderApplication(<App />);
  } catch (error) {
    console.error("NODI database startup failed", error);
    renderApplication(
      <StartupScreen status="error" onRetry={() => window.location.reload()} />,
    );
  }
}

void bootstrapApplication();
