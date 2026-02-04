/**
 * Diff parsing utilities - no vscode dependency for testability
 */

import type { ChangedFile } from "./types";

/**
 * Parse unified diff to extract changed files with additions/deletions
 */
export function parseDiffToChangedFiles(diff: string): ChangedFile[] {
  const files: ChangedFile[] = [];
  const lines = diff.split("\n");

  let currentFile: { path: string; additions: number; deletions: number } | null =
    null;

  for (const line of lines) {
    const gitMatch = line.match(/^diff --git a\/(.+?) b\/(.+?)$/);
    if (gitMatch) {
      if (currentFile) {
        files.push({
          path: currentFile.path,
          status: "modified",
          additions: currentFile.additions,
          deletions: currentFile.deletions,
          comments: [],
        });
      }
      currentFile = {
        path: gitMatch[1],
        additions: 0,
        deletions: 0,
      };
      continue;
    }

    if (currentFile) {
      if (line.startsWith("+") && !line.startsWith("+++")) {
        currentFile.additions++;
      } else if (line.startsWith("-") && !line.startsWith("---")) {
        currentFile.deletions++;
      }
    }
  }

  if (currentFile) {
    files.push({
      path: currentFile.path,
      status: "modified",
      additions: currentFile.additions,
      deletions: currentFile.deletions,
      comments: [],
    });
  }

  return files;
}
