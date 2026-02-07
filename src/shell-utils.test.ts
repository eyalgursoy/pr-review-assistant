/**
 * Tests for shell-utils secure temp file and validation functions
 */

import { describe, it, expect } from "vitest";
import {
  createSecureTempFile,
  writeSecureTempFile,
  validateBranchName,
  validateOwnerRepo,
  validateStashRef,
  validateGitPath,
  validateExecutablePath,
  runCommand,
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

describe("validateOwnerRepo", () => {
  it("should accept valid GitHub owner/repo names", () => {
    expect(() => validateOwnerRepo("octocat", "owner")).not.toThrow();
    expect(() => validateOwnerRepo("my-org", "owner")).not.toThrow();
    expect(() => validateOwnerRepo("user_name", "owner")).not.toThrow();
    expect(() => validateOwnerRepo("user.name", "owner")).not.toThrow();
    expect(() => validateOwnerRepo("User123", "owner")).not.toThrow();
  });

  it("should reject empty values", () => {
    expect(() => validateOwnerRepo("", "owner")).toThrow("empty or not a string");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => validateOwnerRepo(null as any, "owner")).toThrow("empty or not a string");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => validateOwnerRepo(undefined as any, "owner")).toThrow("empty or not a string");
  });

  it("should reject names with invalid characters", () => {
    expect(() => validateOwnerRepo("user/name", "owner")).toThrow("must contain only");
    expect(() => validateOwnerRepo("user;name", "owner")).toThrow("must contain only");
    expect(() => validateOwnerRepo("user$name", "owner")).toThrow("must contain only");
    expect(() => validateOwnerRepo("user name", "owner")).toThrow("must contain only");
  });

  it("should include field name in error message", () => {
    expect(() => validateOwnerRepo("", "repository")).toThrow("Invalid repository");
    expect(() => validateOwnerRepo("bad/name", "owner")).toThrow("Invalid owner");
  });
});

describe("validateStashRef", () => {
  it("should accept valid stash refs", () => {
    expect(() => validateStashRef("stash@{0}")).not.toThrow();
    expect(() => validateStashRef("stash@{1}")).not.toThrow();
    expect(() => validateStashRef("stash@{99}")).not.toThrow();
    expect(() => validateStashRef(" stash@{0} ")).not.toThrow(); // with whitespace
  });

  it("should reject invalid stash refs", () => {
    expect(() => validateStashRef("stash@{abc}")).toThrow("must match stash@{n}");
    expect(() => validateStashRef("stash@{}")).toThrow("must match stash@{n}");
    expect(() => validateStashRef("stash{0}")).toThrow("must match stash@{n}");
    expect(() => validateStashRef("refs/stash")).toThrow("must match stash@{n}");
    expect(() => validateStashRef("stash@{-1}")).toThrow("must match stash@{n}");
  });

  it("should reject empty values", () => {
    expect(() => validateStashRef("")).toThrow("empty or not a string");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => validateStashRef(null as any)).toThrow("empty or not a string");
  });
});

describe("validateGitPath", () => {
  const testCwd = "/home/user/project";

  it("should accept valid relative paths", () => {
    expect(validateGitPath("src/index.ts", testCwd)).toBe("src/index.ts");
    expect(validateGitPath("README.md", testCwd)).toBe("README.md");
    expect(validateGitPath("src/utils/helper.ts", testCwd)).toBe("src/utils/helper.ts");
  });

  it("should reject path traversal attempts", () => {
    expect(() => validateGitPath("../etc/passwd", testCwd)).toThrow("path traversal not allowed");
    expect(() => validateGitPath("src/../../../etc/passwd", testCwd)).toThrow("path traversal not allowed");
    expect(() => validateGitPath("..", testCwd)).toThrow("path traversal not allowed");
  });

  it("should reject absolute paths", () => {
    expect(() => validateGitPath("/etc/passwd", testCwd)).toThrow("absolute paths not allowed");
    expect(() => validateGitPath("/home/user/file.txt", testCwd)).toThrow("absolute paths not allowed");
  });

  it("should reject paths with disallowed characters", () => {
    expect(() => validateGitPath("file;name.ts", testCwd)).toThrow("disallowed characters");
    expect(() => validateGitPath("file$name.ts", testCwd)).toThrow("disallowed characters");
    expect(() => validateGitPath("file name.ts", testCwd)).toThrow("disallowed characters");
  });

  it("should reject empty values", () => {
    expect(() => validateGitPath("", testCwd)).toThrow("empty or not a string");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => validateGitPath(null as any, testCwd)).toThrow("empty or not a string");
  });
});

describe("validateExecutablePath", () => {
  it("should accept valid executable paths", () => {
    expect(() => validateExecutablePath("/usr/bin/git")).not.toThrow();
    expect(() => validateExecutablePath("git")).not.toThrow();
    expect(() => validateExecutablePath("/usr/local/bin/gh")).not.toThrow();
    expect(() => validateExecutablePath("./node_modules/.bin/tsc")).not.toThrow();
  });

  it("should reject paths with shell metacharacters", () => {
    expect(() => validateExecutablePath("git;rm -rf /")).toThrow("shell metacharacters");
    expect(() => validateExecutablePath("git && echo pwned")).toThrow("shell metacharacters");
    expect(() => validateExecutablePath("git | cat /etc/passwd")).toThrow("shell metacharacters");
    expect(() => validateExecutablePath("$(whoami)")).toThrow("shell metacharacters");
    expect(() => validateExecutablePath("`whoami`")).toThrow("shell metacharacters");
    expect(() => validateExecutablePath("git\nrm -rf /")).toThrow("shell metacharacters");
  });

  it("should reject empty values", () => {
    expect(() => validateExecutablePath("")).toThrow("empty or not a string");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => validateExecutablePath(null as any)).toThrow("empty or not a string");
  });
});

describe("runCommand", () => {
  it("should execute simple commands", async () => {
    const result = await runCommand("echo", ["hello"]);
    expect(result.stdout.trim()).toBe("hello");
  });

  it("should pass arguments correctly", async () => {
    const result = await runCommand("echo", ["-n", "test"]);
    expect(result.stdout).toBe("test");
  });

  it("should respect cwd option", async () => {
    const result = await runCommand("pwd", [], { cwd: os.tmpdir() });
    expect(result.stdout.trim()).toBe(fs.realpathSync(os.tmpdir()));
  });

  it("should throw on non-existent command", async () => {
    await expect(runCommand("nonexistent-command-xyz", [])).rejects.toThrow();
  });

  it("should throw on command failure", async () => {
    await expect(runCommand("false", [])).rejects.toThrow();
  });
});
