import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createConverter, createInspector } from "./inspect.mjs";

// An 8×8 WEBP image.
const webp = Buffer.from(
  "UklGRjAAAABXRUJQVlA4ICQAAAAwAQCdASoIAAgAAsBMJaQAA3AA/vdTn5yWtFljTfNgugiEAAA=",
  "base64",
);

function pdf(pages) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Count ${pages} /Kids [${Array.from({ length: pages }, (_, n) => `${n + 3} 0 R`).join(" ")}] >>`,
    ...Array.from(
      { length: pages },
      () => "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>",
    ),
  ];
  let text = "%PDF-1.4\n";
  const offsets = [0];
  for (let n = 0; n < objects.length; n++) {
    offsets.push(Buffer.byteLength(text));
    text += `${n + 1} 0 obj\n${objects[n]}\nendobj\n`;
  }
  const offset = Buffer.byteLength(text);
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => `${String(n).padStart(10, "0")} 00000 n \n`)
    .join(
      "",
    )}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`;
  return Buffer.from(text);
}

test("native preflight validates real images and PDF page count, converts HEIC/TIFF, refuses malformed documents", {
  skip: process.platform !== "darwin",
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "nodi-inspector-"));
  try {
    const binary = join(directory, "inspect");
    execFileSync("swiftc", [
      "-module-cache-path",
      join(directory, "cache"),
      new URL("./InspectDocument.swift", import.meta.url).pathname,
      "-o",
      binary,
    ]);
    const inspect = createInspector(binary);
    assert.deepEqual(await inspect(pdf(3)), {
      mime: "application/pdf",
      extension: "pdf",
      pages: 3,
    });
    const receiptPath = new URL(
      "../../src-tauri/tests/fixtures/ocr-receipt.png",
      import.meta.url,
    ).pathname;
    const png = await readFile(receiptPath);
    assert.deepEqual(await inspect(png), {
      mime: "image/png",
      extension: "png",
      pages: 1,
    });
    assert.deepEqual(await inspect(webp), {
      mime: "image/webp",
      extension: "webp",
      pages: 1,
    });
    // HEIC and TIFF are accepted, then re-encoded as JPEG for the model.
    const convert = createConverter(binary);
    for (const format of ["heic", "tiff"]) {
      const file = join(directory, `receipt.${format}`);
      execFileSync("sips", [
        "-s",
        "format",
        format,
        receiptPath,
        "--out",
        file,
      ]);
      const original = await readFile(file);
      assert.equal((await inspect(original)).mime, `image/${format}`);
      assert.deepEqual(await inspect(await convert(original)), {
        mime: "image/jpeg",
        extension: "jpg",
        pages: 1,
      });
    }
    await assert.rejects(() => convert(png), /invalid_file/);
    await assert.rejects(
      () => inspect(Buffer.from("%PDF-invalid")),
      /invalid_file/,
    );
    await assert.rejects(
      () => inspect(Buffer.from("not an image")),
      /invalid_file/,
    );
    await assert.rejects(() => inspect(pdf(71)), /invalid_file/);
  } finally {
    await rm(directory, { recursive: true });
  }
});
