/**
 * Git utilities for branch checkout and stash
 * Used to ensure PR review comments align with correct file versions
 */

import * as vscode from "vscode";
import { runCommand, validateBranchName, validateStashRef } from "./shell-utils";

const STASH_PREFIX = "pr-review-assistant";

function getWorkspacePath(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

export interface RestoreStackEntry {
  branch: string;
  stashMessage?: string;
}

/**
 * Get current git branch
 */
export async function getCurrentBranch(): Promise<string> {
  const cwd = getWorkspacePath();
  if (!cwd) throw new Error("No workspace folder open");

  const { stdout } = await runCommand("git", ["branch", "--show-current"], { cwd });
  return stdout.trim();
}

/**
 * Fetch from remote to refresh branch list
 */
export async function gitFetch(): Promise<void> {
  const cwd = getWorkspacePath();
  if (!cwd) throw new Error("No workspace folder open");

  await runCommand("git", ["fetch"], { cwd });
}

/**
 * Update current branch from remote (origin). Assumes we are on `branch`.
 * On failure (no origin, uncommitted changes, merge conflict, etc.), shows a
 * warning and returns without throwing so the review flow can continue.
 */
export async function updateBranchFromRemote(branch: string): Promise<void> {
  validateBranchName(branch);

  const cwd = getWorkspacePath();
  if (!cwd) throw new Error("No workspace folder open");

  try {
    await runCommand("git", ["pull", "origin", branch], { cwd });
  } catch {
    vscode.window.showWarningMessage(
      "Could not update the PR branch from remote. Review may be against an older revision."
    );
  }
}

/**
 * Check if working directory has uncommitted changes
 */
export async function hasUncommittedChanges(): Promise<boolean> {
  const cwd = getWorkspacePath();
  if (!cwd) throw new Error("No workspace folder open");

  const { stdout } = await runCommand("git", ["status", "--porcelain"], { cwd });
  return stdout.trim().length > 0;
}

/**
 * Stash changes and checkout target branch
 * Returns stash message if stashed (for stack entry)
 */
export async function stashAndCheckout(
  currentBranch: string,
  targetBranch: string
): Promise<RestoreStackEntry> {
  validateBranchName(currentBranch);
  validateBranchName(targetBranch);

  const cwd = getWorkspacePath();
  if (!cwd) throw new Error("No workspace folder open");

  const stashMessage = `${STASH_PREFIX}-${Date.now()}-${currentBranch}`;

  await runCommand("git", ["stash", "push", "-m", stashMessage], { cwd });
  await runCommand("git", ["checkout", targetBranch], { cwd });

  return { branch: currentBranch, stashMessage };
}

/**
 * Checkout target branch (no stash, working dir assumed clean)
 */
export async function checkoutBranch(
  currentBranch: string,
  targetBranch: string
): Promise<RestoreStackEntry> {
  validateBranchName(targetBranch);

  const cwd = getWorkspacePath();
  if (!cwd) throw new Error("No workspace folder open");

  await runCommand("git", ["checkout", targetBranch], { cwd });

  return { branch: currentBranch };
}

/**
 * Find stash ref by message (exact match)
 * Returns stash@{n} or null if not found
 */
export async function findStashByMessage(
  stashMessage: string
): Promise<string | null> {
  const cwd = getWorkspacePath();
  if (!cwd) throw new Error("No workspace folder open");

  const { stdout } = await runCommand("git", [
    "stash",
    "list",
    "--format=%gd %s",
  ], { cwd });

  const lines = stdout.trim().split("\n");
  for (const line of lines) {
    const match = line.match(/^(stash@\{\d+\})\s+(.+)$/);
    if (match) {
      const [, ref, message] = match;
      if (message === stashMessage) {
        return ref;
      }
    }
  }
  return null;
}

/**
 * Pop a specific stash by ref
 */
export async function popStash(ref: string): Promise<void> {
  validateStashRef(ref);

  const cwd = getWorkspacePath();
  if (!cwd) throw new Error("No workspace folder open");

  await runCommand("git", ["stash", "pop", ref.trim()], { cwd });
}

/**
 * Checkout a branch
 */
export async function checkout(branch: string): Promise<void> {
  validateBranchName(branch);

  const cwd = getWorkspacePath();
  if (!cwd) throw new Error("No workspace folder open");

  await runCommand("git", ["checkout", branch], { cwd });
}
