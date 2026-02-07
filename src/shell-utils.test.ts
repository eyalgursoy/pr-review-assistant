/**
 * Tests for shell-utils secure temp file and validation functions
 */

import { describe, it, expect } from "vitest";
import {
  createSecureTempFile,
  writeSecureTempFile,
  validateBranchName,
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

describe("validateBranchName", () => {
  it("should reject path traversal patterns", () => {
    expect(() => validateBranchName("refs/heads/../../etc/passwd")).toThrow(
      "path traversal not allowed"
    );
    expect(() => validateBranchName("foo/../bar")).toThrow(
      "path traversal not allowed"
    );
    expect(() => validateBranchName("..")).toThrow("path traversal not allowed");
  });

  it("should accept valid branch names", () => {
    expect(() => validateBranchName("feature/my-branch")).not.toThrow();
    expect(() => validateBranchName("main")).not.toThrow();
    expect(() => validateBranchName("refs/heads/feature-x")).not.toThrow();
    expect(() => validateBranchName("v1.2.3")).not.toThrow();
  });

  it("should reject empty or invalid", () => {
    expect(() => validateBranchName("")).toThrow();
    expect(() => validateBranchName("branch;rm -rf /")).toThrow(
      "disallowed characters"
    );
  });
});
