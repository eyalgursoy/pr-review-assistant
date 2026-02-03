/**
 * Tests for diff annotator
 */

import { describe, it, expect } from "vitest";
import { annotateDiff, parseLineAnnotation, stripAnnotation } from "./diff-annotator";

describe("annotateDiff", () => {
  it("should annotate a simple diff with added and deleted lines", () => {
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

    const result = annotateDiff(diff);

    expect(result.fileCount).toBe(1);
    expect(result.hunkCount).toBe(1);

    // Check that annotations are present
    expect(result.annotated).toContain("[OLD:10|NEW:10]  function helper()");
    expect(result.annotated).toContain("[OLD:11|DEL] -  return false;");
    expect(result.annotated).toContain("[NEW:11|ADD] +  return true;");
    expect(result.annotated).toContain("[NEW:12|ADD] +  // Added comment");
    expect(result.annotated).toContain("[OLD:12|NEW:13]  }");
  });

  it("should handle multiple hunks in a single file", () => {
    const diff = `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -5,3 +5,4 @@
 const a = 1;
+const b = 2;
 const c = 3;
@@ -20,3 +21,4 @@
 function foo() {
+  console.log("added");
 }`;

    const result = annotateDiff(diff);

    expect(result.hunkCount).toBe(2);

    // First hunk
    expect(result.annotated).toContain("[OLD:5|NEW:5]  const a = 1;");
    expect(result.annotated).toContain("[NEW:6|ADD] +const b = 2;");
    expect(result.annotated).toContain("[OLD:6|NEW:7]  const c = 3;");

    // Second hunk
    expect(result.annotated).toContain("[OLD:20|NEW:21]  function foo()");
    expect(result.annotated).toContain('[NEW:22|ADD] +  console.log("added");');
    expect(result.annotated).toContain("[OLD:21|NEW:23]  }");
  });

  it("should handle multiple files", () => {
    const diff = `diff --git a/file1.ts b/file1.ts
--- a/file1.ts
+++ b/file1.ts
@@ -1,2 +1,3 @@
 line1
+added
 line2
diff --git a/file2.ts b/file2.ts
--- a/file2.ts
+++ b/file2.ts
@@ -10,2 +10,2 @@
-old
+new`;

    const result = annotateDiff(diff);

    expect(result.fileCount).toBe(2);
    expect(result.hunkCount).toBe(2);

    // File 1
    expect(result.annotated).toContain("[OLD:1|NEW:1]  line1");
    expect(result.annotated).toContain("[NEW:2|ADD] +added");
    expect(result.annotated).toContain("[OLD:2|NEW:3]  line2");

    // File 2
    expect(result.annotated).toContain("[OLD:10|DEL] -old");
    expect(result.annotated).toContain("[NEW:10|ADD] +new");
  });

  it("should preserve file headers without annotation", () => {
    const diff = `diff --git a/src/test.ts b/src/test.ts
index 1234567..abcdefg 100644
--- a/src/test.ts
+++ b/src/test.ts
@@ -1,1 +1,1 @@
-old
+new`;

    const result = annotateDiff(diff);

    // Headers should not be annotated
    expect(result.annotated).toContain("diff --git a/src/test.ts b/src/test.ts");
    expect(result.annotated).toContain("index 1234567..abcdefg 100644");
    expect(result.annotated).toContain("--- a/src/test.ts");
    expect(result.annotated).toContain("+++ b/src/test.ts");
    expect(result.annotated).toContain("@@ -1,1 +1,1 @@");
  });

  it("should handle hunk headers with different formats", () => {
    // Some diffs have @@ -X +Y @@ without counts
    const diff = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -5 +5 @@
-old line
+new line`;

    const result = annotateDiff(diff);

    expect(result.annotated).toContain("[OLD:5|DEL] -old line");
    expect(result.annotated).toContain("[NEW:5|ADD] +new line");
  });

  it("should handle empty lines in diff", () => {
    const diff = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,3 @@
 line1

 line3`;

    const result = annotateDiff(diff);

    expect(result.annotated).toContain("[OLD:1|NEW:1]  line1");
    expect(result.annotated).toContain("[OLD:2|NEW:2] ");
    expect(result.annotated).toContain("[OLD:3|NEW:3]  line3");
  });

  it("should handle 'No newline at end of file' marker", () => {
    const diff = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1,2 +1,2 @@
 line1
-line2
\\ No newline at end of file
+line2 modified`;

    const result = annotateDiff(diff);

    expect(result.annotated).toContain("\\ No newline at end of file");
  });
});

describe("parseLineAnnotation", () => {
  it("should parse deleted line annotation", () => {
    const result = parseLineAnnotation("[OLD:42|DEL] -deleted content");

    expect(result).toEqual({
      oldLine: 42,
      type: "del",
    });
  });

  it("should parse added line annotation", () => {
    const result = parseLineAnnotation("[NEW:15|ADD] +added content");

    expect(result).toEqual({
      newLine: 15,
      type: "add",
    });
  });

  it("should parse context line annotation", () => {
    const result = parseLineAnnotation("[OLD:10|NEW:12]  context content");

    expect(result).toEqual({
      oldLine: 10,
      newLine: 12,
      type: "context",
    });
  });

  it("should return null for non-annotated lines", () => {
    expect(parseLineAnnotation("regular line")).toBeNull();
    expect(parseLineAnnotation("diff --git a/file b/file")).toBeNull();
    expect(parseLineAnnotation("@@ -1,2 +1,3 @@")).toBeNull();
  });
});

describe("stripAnnotation", () => {
  it("should strip deleted line annotation", () => {
    expect(stripAnnotation("[OLD:42|DEL] -deleted content")).toBe("-deleted content");
  });

  it("should strip added line annotation", () => {
    expect(stripAnnotation("[NEW:15|ADD] +added content")).toBe("+added content");
  });

  it("should strip context line annotation", () => {
    // Note: stripAnnotation removes the annotation prefix including the space after it
    expect(stripAnnotation("[OLD:10|NEW:12]  context content")).toBe("context content");
  });

  it("should return unchanged if no annotation", () => {
    expect(stripAnnotation("regular line")).toBe("regular line");
  });
});

describe("Real-world diff scenarios", () => {
  it("should correctly annotate a realistic PR diff", () => {
    const diff = `diff --git a/frontend/tests/concurrent/docs/README.md b/frontend/tests/concurrent/docs/README.md
index abc1234..def5678 100644
--- a/frontend/tests/concurrent/docs/README.md
+++ b/frontend/tests/concurrent/docs/README.md
@@ -155,12 +155,10 @@ CONCURRENT_TEST_USERS=10 CONCURRENT_TEST_MODE=dev npm run test:concurrent:dev
 
 ### Available Scripts
 
-| Script                   | Description                  | Environment | Users       |
-| ------------------------ | ---------------------------- | ----------- | ----------- |
-| \`test:concurrent\`        | Basic concurrent test        | Local       | 3 (default) |
-| \`test:concurrent:dev\`    | Test against dev environment | Dev         | 50          |
-| \`test:concurrent:ci\`     | CI mode test                 | CI          | 20          |
-| \`test:concurrent:headed\` | Run with browser UI          | Local       | 3           |
+| Script                   | Description                  | Environment |
+| ------------------------ | ---------------------------- | ----------- |
+| \`test:concurrent\`        | Basic concurrent test        | Local       |
+| \`test:concurrent:dev\`    | Test against dev environment | Dev         |
 
 **Note**: Use \`CONCURRENT_TEST_MODE=ci\` with any script to run in CI mode.`;

    const result = annotateDiff(diff);

    expect(result.fileCount).toBe(1);
    expect(result.hunkCount).toBe(1);

    // Verify specific line numbers
    expect(result.annotated).toContain("[OLD:155|NEW:155]");
    expect(result.annotated).toContain("[OLD:156|NEW:156]  ### Available Scripts");
    
    // Deleted lines should have OLD line numbers (starting at 158)
    expect(result.annotated).toContain("[OLD:158|DEL]");
    expect(result.annotated).toContain("[OLD:159|DEL]");
    expect(result.annotated).toContain("[OLD:160|DEL]");
    expect(result.annotated).toContain("[OLD:161|DEL]");
    expect(result.annotated).toContain("[OLD:162|DEL]");
    expect(result.annotated).toContain("[OLD:163|DEL]");
    
    // Added lines should have NEW line numbers (starting at 158)
    expect(result.annotated).toContain("[NEW:158|ADD]");
    expect(result.annotated).toContain("[NEW:159|ADD]");
    expect(result.annotated).toContain("[NEW:160|ADD]");
    expect(result.annotated).toContain("[NEW:161|ADD]");
    
    // Context line after changes
    expect(result.annotated).toContain("[OLD:165|NEW:163]");
  });
});
