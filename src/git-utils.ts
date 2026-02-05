/**
 * Git utilities for branch checkout and stash
 * Used to ensure PR review comments align with correct file versions
 */

import { exec } from "child_process";
import { promisify } from "util";
import * as vscode from "vscode";

const execAsync = promisify(exec);

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

  const { stdout } = await execAsync("git branch --show-current", { cwd });
  return stdout.trim();
}

/**
 * Check if working directory has uncommitted changes
 */
export async function hasUncommittedChanges(): Promise<boolean> {
  const cwd = getWorkspacePath();
  if (!cwd) throw new Error("No workspace folder open");

  const { stdout } = await execAsync("git status --porcelain", { cwd });
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
  const cwd = getWorkspacePath();
  if (!cwd) throw new Error("No workspace folder open");

  const stashMessage = `${STASH_PREFIX}-${Date.now()}-${currentBranch}`;

  await execAsync(`git stash push -m "${stashMessage}"`, { cwd });
  await execAsync(`git checkout ${targetBranch}`, { cwd });

  return { branch: currentBranch, stashMessage };
}

/**
 * Checkout target branch (no stash, working dir assumed clean)
 */
export async function checkoutBranch(
  currentBranch: string,
  targetBranch: string
): Promise<RestoreStackEntry> {
  const cwd = getWorkspacePath();
  if (!cwd) throw new Error("No workspace folder open");

  await execAsync(`git checkout ${targetBranch}`, { cwd });

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

  const { stdout } = await execAsync(
    'git stash list --format="%gd %s"',
    { cwd }
  );

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
  const cwd = getWorkspacePath();
  if (!cwd) throw new Error("No workspace folder open");

  await execAsync(`git stash pop ${ref}`, { cwd });
}

/**
 * Checkout a branch
 */
export async function checkout(branch: string): Promise<void> {
  const cwd = getWorkspacePath();
  if (!cwd) throw new Error("No workspace folder open");

  await execAsync(`git checkout ${branch}`, { cwd });
}
