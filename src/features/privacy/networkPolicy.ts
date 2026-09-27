import tauriConfig from "../../../src-tauri/tauri.conf.json";

const LOCAL_CONNECTIONS = ["ipc:", "http://ipc.localhost"];

export interface NetworkPolicySummary {
  blocked: boolean;
  summary: string;
  detail: string;
}

/**
 * Describes the network access the shipped Content Security Policy allows,
 * read from the same configuration Tauri enforces.
 */
export function describeNetworkPolicy(
  csp: Record<string, string> | null = (
    tauriConfig.app.security as { csp: Record<string, string> | null }
  ).csp,
): NetworkPolicySummary {
  if (csp === null) {
    return {
      blocked: false,
      summary: "No network policy is enforced.",
      detail: "The app ships without a Content Security Policy.",
    };
  }
  const allowed = (csp["connect-src"] ?? csp["default-src"] ?? "")
    .split(/\s+/)
    .filter(Boolean);
  const remote = allowed.filter(
    (source) => !LOCAL_CONNECTIONS.includes(source) && source !== "'none'",
  );
  if (remote.length === 0) {
    return {
      blocked: true,
      summary: "Blocked. NODI cannot reach the internet.",
      detail:
        "Its security policy only allows connections to NODI's own local process, and it has no network permissions.",
    };
  }
  return {
    blocked: false,
    summary: "Network access is allowed.",
    detail: `The security policy allows connections to ${remote.join(", ")}.`,
  };
}
