/**
 * GitHub integration - PR info fetching and comment submission.
 * Thin facade over providers; legacy exports delegate to GitHub provider.
 */

import * as vscode from "vscode";
import type { PRInfo, ChangedFile, ReviewComment } from "./types";
import { getProvider } from "./providers";
import {
  runCommand,
  validateBranchName,
  validateGitPath,
} from "./shell-utils";

export { parsePRUrl } from "./url-utils";
export type { ParsedPRUrl } from "./url-utils";

/** Check if gh CLI is available and authenticated (GitHub provider). */
export async function checkGhCli(): Promise<{
  available: boolean;
  authenticated: boolean;
  error?: string;
}> {
  return getProvider("github").checkAuth();
}

/** Fetch PR information (GitHub provider). */
export async function fetchPRInfo(
  owner: string,
  repo: string,
  prNumber: number
): Promise<PRInfo> {
  return getProvider("github").fetchPRInfo(owner, repo, prNumber);
}

/** Fetch list of changed files in PR (GitHub provider). */
export async function fetchChangedFiles(
  owner: string,
  repo: string,
  prNumber: number
): Promise<ChangedFile[]> {
  return getProvider("github").fetchChangedFiles(owner, repo, prNumber);
}

/** Fetch PR diff (GitHub provider). */
export async function fetchPRDiff(
  owner: string,
  repo: string,
  prNumber: number
): Promise<string> {
  return getProvider("github").fetchPRDiff(owner, repo, prNumber);
}

/** Submit review comments (GitHub provider). */
export async function submitReviewComments(
  pr: PRInfo,
  comments: ReviewComment[],
  summary?: string | null
): Promise<{ success: boolean; message: string; url?: string }> {
  return getProvider("github").submitReviewComments(pr, comments, summary);
}

/** Approve PR (GitHub provider). */
export async function approvePR(
  pr: PRInfo,
  body: string = "LGTM! Code reviewed with PR Review Assistant."
): Promise<{ success: boolean; message: string; url?: string }> {
  const provider = getProvider("github");
  if (provider.approvePR) {
    return provider.approvePR(pr, body);
  }
  return { success: false, message: "Approve not supported" };
}

function getWorkspacePath(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

/**
 * Fetch branch and get diff (like pr-review-prepare.mjs)
 */
export async function fetchBranchDiff(
  headBranch: string,
  baseBranch: string = "main"
): Promise<string> {
  validateBranchName(headBranch);
  validateBranchName(baseBranch);

  const cwd = getWorkspacePath();

  await runCommand("git", ["fetch", "origin", headBranch], { cwd });

  const { stdout } = await runCommand("git", [
    "diff",
    `origin/${baseBranch}...origin/${headBranch}`,
    "--no-color",
  ], { cwd, maxBuffer: 50 * 1024 * 1024 });

  return stdout;
}

/**
 * Get current branch name and base branch (main or master)
 */
export async function getLocalBranchInfo(): Promise<{
  branch: string;
  baseBranch: string;
}> {
  const cwd = getWorkspacePath();
  if (!cwd) {
    throw new Error("No workspace folder open");
  }

  const { stdout: branch } = await runCommand("git", ["branch", "--show-current"], {
    cwd,
  });
  const currentBranch = branch.trim();
  if (!currentBranch) {
    throw new Error("Not on a branch (detached HEAD)");
  }

  let baseBranch = "main";
  try {
    await runCommand("git", ["rev-parse", "main"], { cwd });
  } catch {
    try {
      await runCommand("git", ["rev-parse", "master"], { cwd });
      baseBranch = "master";
    } catch {
      throw new Error("Neither main nor master branch found");
    }
  }

  return { branch: currentBranch, baseBranch };
}

/**
 * Fetch local diff (current branch vs main/master)
 */
export async function fetchLocalDiff(baseBranch: string = "main"): Promise<string> {
  validateBranchName(baseBranch);

  const cwd = getWorkspacePath();
  if (!cwd) {
    throw new Error("No workspace folder open");
  }

  const { stdout } = await runCommand("git", [
    "diff",
    `${baseBranch}...HEAD`,
    "--no-color",
  ], { cwd, maxBuffer: 50 * 1024 * 1024 });

  return stdout;
}

export { parseDiffToChangedFiles } from "./diff-parser";

/**
 * Get file content at a git revision (branch/commit)
 */
export async function getFileAtRevision(
  filePath: string,
  revision: string
): Promise<string> {
  const cwd = getWorkspacePath();
  if (!cwd) throw new Error("No workspace folder open");

  validateBranchName(revision);
  const safePath = validateGitPath(filePath, cwd);

  try {
    const { stdout } = await runCommand("git", ["show", `${revision}:${safePath}`], {
      cwd,
      maxBuffer: 5 * 1024 * 1024,
    });
    return stdout;
  } catch {
    return "";
  }
}
