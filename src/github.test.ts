/**
 * Tests for GitHub/local diff utilities
 */

import { describe, it, expect } from "vitest";
import { parseDiffToChangedFiles } from "./diff-parser";
import { parsePRUrl } from "./url-utils";

describe("parsePRUrl", () => {
  it("should parse standard GitHub PR URL", () => {
    const result = parsePRUrl("https://github.com/owner/repo/pull/123");
    expect(result).toEqual({ owner: "owner", repo: "repo", number: 123 });
  });

  it("should return null for invalid URL", () => {
    expect(parsePRUrl("https://gitlab.com/owner/repo/merge/123")).toBeNull();
    expect(parsePRUrl("not-a-url")).toBeNull();
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
