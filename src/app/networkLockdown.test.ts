import { describe, expect, it } from "vitest";
import capability from "../../src-tauri/capabilities/default.json";
import tauriConfig from "../../src-tauri/tauri.conf.json";

/**
 * NODI promises that nothing leaves the Mac. These checks fail the build if
 * the webview's Content Security Policy or the granted Tauri permissions ever
 * allow a remote connection.
 */

type Policy = Record<string, string>;

const IPC_SOURCES = ["ipc:", "http://ipc.localhost"];
const DEV_SERVER_SOURCES = ["ws://localhost:1420", "http://localhost:1420"];
const LOCAL_SOURCES = ["'self'", "'none'", "'unsafe-inline'", "data:", "blob:"];

function sources(policy: Policy, directive: string): string[] {
  return (policy[directive] ?? "").split(/\s+/).filter(Boolean);
}

function remoteSources(policy: Policy, allowed: string[]): string[] {
  return Object.keys(policy).flatMap((directive) =>
    sources(policy, directive).filter((source) => !allowed.includes(source)),
  );
}

const security = tauriConfig.app.security as {
  csp: Policy | null;
  devCsp: Policy | null;
};

describe("network lockdown", () => {
  it("ships a Content Security Policy", () => {
    expect(security.csp).not.toBeNull();
    expect(security.csp?.["default-src"]).toBe("'self'");
  });

  it("only lets the app connect to Tauri's local IPC", () => {
    const csp = security.csp as Policy;
    expect(sources(csp, "connect-src").sort()).toEqual([...IPC_SOURCES].sort());
  });

  it("names no remote source in any directive", () => {
    const csp = security.csp as Policy;
    expect(remoteSources(csp, [...LOCAL_SOURCES, ...IPC_SOURCES])).toEqual([]);
  });

  it("allows only the local dev server during development", () => {
    const devCsp = security.devCsp as Policy;
    expect(
      remoteSources(devCsp, [
        ...LOCAL_SOURCES,
        ...IPC_SOURCES,
        ...DEV_SERVER_SOURCES,
      ]),
    ).toEqual([]);
  });

  it("grants no network permission to the window", () => {
    const networkPermissions = capability.permissions.filter((permission) =>
      /^(http|websocket|upload|opener|shell)[:-]/.test(permission),
    );
    expect(networkPermissions).toEqual([]);
  });
});
