/**
 * Tests for GitHub/local diff utilities
 */

import { describe, it, expect } from "vitest";
import { parseDiffToChangedFiles } from "./diff-parser";
import { parsePRUrl } from "./url-utils";

describe("parsePRUrl", () => {
  it("should parse standard GitHub PR URL", () => {
    const result = parsePRUrl("https://github.com/owner/repo/pull/123");
    expect(result).toEqual({
      host: "github",
      owner: "owner",
      repo: "repo",
      number: 123,
    });
  });

  it("should parse GitLab MR URL", () => {
    const result = parsePRUrl(
      "https://gitlab.com/group/project/-/merge_requests/42"
    );
    expect(result).toEqual({
      host: "gitlab",
      owner: "group",
      repo: "project",
      number: 42,
    });
  });

  it("should parse GitLab MR URL with subgroup", () => {
    const result = parsePRUrl(
      "https://gitlab.com/group/subgroup/repo/-/merge_requests/1"
    );
    expect(result).toEqual({
      host: "gitlab",
      owner: "group",
      repo: "subgroup/repo",
      number: 1,
    });
  });

  it("should parse Bitbucket PR URL", () => {
    const result = parsePRUrl(
      "https://bitbucket.org/workspace/repo/pull-requests/99"
    );
    expect(result).toEqual({
      host: "bitbucket",
      owner: "workspace",
      repo: "repo",
      number: 99,
    });
  });

  it("should return null for invalid URL", () => {
    expect(parsePRUrl("https://gitlab.com/owner/repo/merge/123")).toBeNull();
    expect(parsePRUrl("not-a-url")).toBeNull();
  });

  it("should return null for URL with invalid owner/repo (command injection attempt)", () => {
    expect(parsePRUrl("https://github.com/evil;rm/pull/1")).toBeNull();
    expect(parsePRUrl("https://github.com/owner/repo;x/pull/1")).toBeNull();
    expect(parsePRUrl("https://github.com/owner/repo$(id)/pull/1")).toBeNull();
  });
});

describe("parseDiffToChangedFiles", () => {
  it("should parse single file diff", () => {
    const diff = `diff --git a/src/utils.ts b/src/utils.ts
index abc123..def456 100644
--- a/src/utils.ts
+++ b/src/utils.ts
@@ -10,5 +10,6 @@
 function helper() {
-  return false;
+  return true;
+  // Added comment
 }`;

    const files = parseDiffToChangedFiles(diff);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("src/utils.ts");
    expect(files[0].additions).toBe(2);
    expect(files[0].deletions).toBe(1);
    expect(files[0].comments).toEqual([]);
  });

  it("should parse multiple files", () => {
    const diff = `diff --git a/file1.ts b/file1.ts
--- a/file1.ts
+++ b/file1.ts
@@ -1,1 +1,2 @@
+new line
diff --git a/file2.ts b/file2.ts
--- a/file2.ts
+++ b/file2.ts
@@ -5,1 +5,0 @@
-old line
`;

    const files = parseDiffToChangedFiles(diff);
    expect(files).toHaveLength(2);
    expect(files[0].path).toBe("file1.ts");
    expect(files[0].additions).toBe(1);
    expect(files[1].path).toBe("file2.ts");
    expect(files[1].deletions).toBe(1);
  });

  it("should return empty array for empty diff", () => {
    expect(parseDiffToChangedFiles("")).toEqual([]);
  });
});
