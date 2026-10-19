import { spawn } from "node:child_process";
import config from "../../landing/plans.json" with { type: "json" };
import { ServiceError } from "./ledger.mjs";

/** Runs a bounded, reviewed native parser with no shell or client-supplied paths. */
export function createInspector(binary) {
  return (bytes) =>
    new Promise((resolve, reject) => {
      if (bytes.length === 0 || bytes.length > config.maxBytes) {
        reject(new ServiceError("invalid_file"));
        return;
      }
      const child = spawn(binary, [], {
        stdio: ["pipe", "pipe", "ignore"],
        timeout: 10000,
      });
      let output = "";
      child.stdout.on("data", (chunk) => {
        output += chunk.toString();
        if (output.length > 4096) child.kill();
      });
      child.on("error", () =>
        reject(new ServiceError("inspection_unavailable", 503)),
      );
      child.stdin.on("error", () => {});
      child.on("close", (code) => {
        if (code !== 0) {
          reject(new ServiceError("invalid_file"));
          return;
        }
        try {
          resolve(JSON.parse(output));
        } catch {
          reject(new ServiceError("invalid_file"));
        }
      });
      child.stdin.end(bytes);
    });
}

/** Re-encodes a HEIC or TIFF image as JPEG with the same reviewed binary. */
export function createConverter(binary) {
  return (bytes) =>
    new Promise((resolve, reject) => {
      const child = spawn(binary, ["--jpeg"], {
        stdio: ["pipe", "pipe", "ignore"],
        timeout: 20000,
      });
      const chunks = [];
      let size = 0;
      child.stdout.on("data", (chunk) => {
        size += chunk.length;
        if (size > config.maxBytes) child.kill();
        else chunks.push(chunk);
      });
      child.on("error", () =>
        reject(new ServiceError("inspection_unavailable", 503)),
      );
      child.stdin.on("error", () => {});
      child.on("close", (code) => {
        if (code !== 0 || size === 0 || size > config.maxBytes)
          reject(new ServiceError("invalid_file"));
        else resolve(Buffer.concat(chunks));
      });
      child.stdin.end(bytes);
    });
}
