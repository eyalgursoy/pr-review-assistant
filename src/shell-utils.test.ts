/**
 * Tests for shell-utils secure temp file functions
 */

import { describe, it, expect } from "vitest";
import {
  createSecureTempFile,
  writeSecureTempFile,
} from "./shell-utils";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("createSecureTempFile", () => {
  it("should generate unique file names", () => {
    const names = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const filePath = createSecureTempFile("test", ".txt");
      const name = path.basename(filePath);
      expect(names.has(name)).toBe(false);
      names.add(name);
    }
  });

  it("should produce path in temp directory", () => {
    const filePath = createSecureTempFile("prefix", ".ext");
    expect(filePath.startsWith(os.tmpdir())).toBe(true);
    expect(path.basename(filePath)).toMatch(/^prefix-[a-f0-9]{32}\.ext$/);
  });

  it("should include random hex characters in filename", () => {
    const filePath = createSecureTempFile("pr-review", ".json");
    const basename = path.basename(filePath);
    const hexPart = basename.replace(/^pr-review-/, "").replace(/\.json$/, "");
    expect(hexPart).toMatch(/^[a-f0-9]{32}$/);
  });
});

describe("writeSecureTempFile", () => {
  it("should create file with content and restrictive permissions", async () => {
    const content = "sensitive data";
    const filePath = await writeSecureTempFile("test", ".txt", content);

    try {
      const readContent = fs.readFileSync(filePath, "utf-8");
      expect(readContent).toBe(content);

      const stats = fs.statSync(filePath);
      const mode = stats.mode & 0o777;
      expect(mode).toBe(0o600);
    } finally {
      fs.unlinkSync(filePath);
    }
  });

  it("should generate unique files for concurrent calls", async () => {
    const paths = await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        writeSecureTempFile("concurrent", ".txt", `content-${i}`)
      )
    );
    const uniquePaths = new Set(paths);
    expect(uniquePaths.size).toBe(100);

    for (const p of paths) {
      fs.unlinkSync(p);
    }
  });
});
