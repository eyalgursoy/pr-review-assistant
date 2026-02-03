/**
 * Diff Annotator - Adds absolute line numbers to unified diff format
 *
 * This helps the AI accurately identify line numbers when reviewing code.
 * Instead of the AI having to calculate line numbers from hunk headers,
 * we annotate each line with its absolute line number.
 *
 * Example input:
 * ```
 * @@ -10,5 +12,7 @@
 *  context line
 * -deleted line
 * +added line
 * ```
 *
 * Example output:
 * ```
 * @@ -10,5 +12,7 @@
 * [OLD:10|NEW:12]  context line
 * [OLD:11|DEL]    -deleted line
 * [NEW:13|ADD]    +added line
 * ```
 */

// Conditionally import logger to allow testing without vscode
let log: (message: string, ...args: unknown[]) => void;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const logger = require("./logger");
  log = logger.log;
} catch {
  // Fallback for testing environment
  log = () => {};
}

export interface AnnotatedDiff {
  original: string;
  annotated: string;
  fileCount: number;
  hunkCount: number;
}

/**
 * Annotate a unified diff with absolute line numbers
 */
export function annotateDiff(diff: string): AnnotatedDiff {
  const lines = diff.split("\n");
  const annotatedLines: string[] = [];

  let currentOldLine = 0;
  let currentNewLine = 0;
  let inHunk = false;
  let fileCount = 0;
  let hunkCount = 0;

  for (const line of lines) {
    // File header (diff --git a/file b/file)
    if (line.startsWith("diff --git")) {
      fileCount++;
      inHunk = false;
      annotatedLines.push(line);
      continue;
    }

    // File metadata lines (index, ---, +++)
    if (
      line.startsWith("index ") ||
      line.startsWith("--- ") ||
      line.startsWith("+++ ") ||
      line.startsWith("new file") ||
      line.startsWith("deleted file") ||
      line.startsWith("similarity index") ||
      line.startsWith("rename from") ||
      line.startsWith("rename to") ||
      line.startsWith("Binary files")
    ) {
      annotatedLines.push(line);
      continue;
    }

    // Hunk header (@@ -old,count +new,count @@)
    const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      hunkCount++;
      currentOldLine = parseInt(hunkMatch[1], 10);
      currentNewLine = parseInt(hunkMatch[2], 10);
      inHunk = true;
      annotatedLines.push(line);
      continue;
    }

    // Inside a hunk - annotate with line numbers
    if (inHunk) {
      if (line.startsWith("-")) {
        // Deleted line - only has old line number
        const annotation = `[OLD:${currentOldLine}|DEL]`;
        annotatedLines.push(`${annotation} ${line}`);
        currentOldLine++;
      } else if (line.startsWith("+")) {
        // Added line - only has new line number
        const annotation = `[NEW:${currentNewLine}|ADD]`;
        annotatedLines.push(`${annotation} ${line}`);
        currentNewLine++;
      } else if (line.startsWith(" ") || line === "") {
        // Context line - has both old and new line numbers
        const annotation = `[OLD:${currentOldLine}|NEW:${currentNewLine}]`;
        annotatedLines.push(`${annotation} ${line}`);
        currentOldLine++;
        currentNewLine++;
      } else if (line.startsWith("\\")) {
        // "\ No newline at end of file" - pass through
        annotatedLines.push(line);
      } else {
        // Unknown line in hunk - pass through
        annotatedLines.push(line);
      }
    } else {
      // Outside hunk - pass through
      annotatedLines.push(line);
    }
  }

  const annotated = annotatedLines.join("\n");

  log(`Diff annotated: ${fileCount} files, ${hunkCount} hunks`);

  return {
    original: diff,
    annotated,
    fileCount,
    hunkCount,
  };
}

/**
 * Parse line annotation to extract line numbers
 * Returns { oldLine, newLine, type } or null if not annotated
 */
export function parseLineAnnotation(
  line: string
): { oldLine?: number; newLine?: number; type: "add" | "del" | "context" } | null {
  // Match [OLD:X|DEL], [NEW:X|ADD], or [OLD:X|NEW:Y]
  const delMatch = line.match(/^\[OLD:(\d+)\|DEL\]/);
  if (delMatch) {
    return { oldLine: parseInt(delMatch[1], 10), type: "del" };
  }

  const addMatch = line.match(/^\[NEW:(\d+)\|ADD\]/);
  if (addMatch) {
    return { newLine: parseInt(addMatch[1], 10), type: "add" };
  }

  const contextMatch = line.match(/^\[OLD:(\d+)\|NEW:(\d+)\]/);
  if (contextMatch) {
    return {
      oldLine: parseInt(contextMatch[1], 10),
      newLine: parseInt(contextMatch[2], 10),
      type: "context",
    };
  }

  return null;
}

/**
 * Strip annotations from a line (for display purposes)
 */
export function stripAnnotation(line: string): string {
  return line.replace(/^\[(?:OLD:\d+\|)?(?:NEW:\d+\|)?(?:DEL|ADD|NEW:\d+)\]\s*/, "");
}
