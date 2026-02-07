/**
 * GitHub integration - PR info fetching and comment submission
 */

import { promisify } from "util";
import * as fs from "fs";
import * as vscode from "vscode";
import type { PRInfo, ChangedFile, ReviewComment } from "./types";
import {
  runCommand,
  validateOwnerRepo,
  validateBranchName,
  validateGitPath,
  writeSecureTempFile,
} from "./shell-utils";

const unlinkAsync = promisify(fs.unlink);

function getWorkspacePath(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

export { parsePRUrl } from "./url-utils";

/**
 * Check if gh CLI is available and authenticated
 */
export async function checkGhCli(): Promise<{
  available: boolean;
  authenticated: boolean;
  error?: string;
}> {
  const cwd = getWorkspacePath();

  try {
    await runCommand("gh", ["--version"], { cwd });
  } catch {
    return {
      available: false,
      authenticated: false,
      error:
        "GitHub CLI (gh) not installed. Install from https://cli.github.com/",
    };
  }

  try {
    await runCommand("gh", ["auth", "status"], { cwd });
    return { available: true, authenticated: true };
  } catch {
    return {
      available: true,
      authenticated: false,
      error: "GitHub CLI not authenticated. Run: gh auth login",
    };
  }
}

/**
 * Fetch PR information using gh CLI
 */
export async function fetchPRInfo(
  owner: string,
  repo: string,
  prNumber: number
): Promise<PRInfo> {
  validateOwnerRepo(owner, "owner");
  validateOwnerRepo(repo, "repo");

  const cwd = getWorkspacePath();

  const { stdout } = await runCommand("gh", [
    "pr",
    "view",
    String(prNumber),
    "--repo",
    `${owner}/${repo}`,
    "--json",
    "number,title,headRefName,baseRefName,url",
  ], { cwd });

  const data = JSON.parse(stdout);

  return {
    number: data.number,
    owner,
    repo,
    title: data.title,
    headBranch: data.headRefName,
    baseBranch: data.baseRefName,
    url: data.url,
  };
}

/**
 * Fetch list of changed files in PR
 */
export async function fetchChangedFiles(
  owner: string,
  repo: string,
  prNumber: number
): Promise<ChangedFile[]> {
  validateOwnerRepo(owner, "owner");
  validateOwnerRepo(repo, "repo");

  const cwd = getWorkspacePath();

  const { stdout } = await runCommand("gh", [
    "pr",
    "view",
    String(prNumber),
    "--repo",
    `${owner}/${repo}`,
    "--json",
    "files",
  ], { cwd });

  const data = JSON.parse(stdout);

  return data.files.map((f: { path: string; status?: string; additions?: number; deletions?: number }) => ({
    path: f.path,
    status: f.status?.toLowerCase() || "modified",
    additions: f.additions || 0,
    deletions: f.deletions || 0,
    comments: [],
  }));
}

/**
 * Fetch PR diff
 */
export async function fetchPRDiff(
  owner: string,
  repo: string,
  prNumber: number
): Promise<string> {
  validateOwnerRepo(owner, "owner");
  validateOwnerRepo(repo, "repo");

  const cwd = getWorkspacePath();

  const { stdout } = await runCommand("gh", [
    "pr",
    "diff",
    String(prNumber),
    "--repo",
    `${owner}/${repo}`,
  ], { cwd, maxBuffer: 50 * 1024 * 1024 });

  return stdout;
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

  // Try main first, then master
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
 * Uses git diff baseBranch...HEAD - no network required
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
    return ""; // File may not exist at that revision (e.g. new file)
  }
}

/**
 * Approve a PR (LGTM) - used when user rejects all AI comments
 */
export async function approvePR(
  pr: PRInfo,
  body: string = "LGTM! Code reviewed with PR Review Assistant."
): Promise<{ success: boolean; message: string; url?: string }> {
  validateOwnerRepo(pr.owner, "owner");
  validateOwnerRepo(pr.repo, "repo");

  const cwd = getWorkspacePath();
  const payload = {
    event: "APPROVE",
    body,
  };

  const tempFile = await writeSecureTempFile(
    "pr-review-approve",
    ".json",
    JSON.stringify(payload, null, 2)
  );

  try {

    const { stdout } = await runCommand("gh", [
      "api",
      `repos/${pr.owner}/${pr.repo}/pulls/${pr.number}/reviews`,
      "--method",
      "POST",
      "--input",
      tempFile,
    ], { cwd });

    const response = JSON.parse(stdout);

    return {
      success: true,
      message: `PR #${pr.number} approved`,
      url: response.html_url,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Failed to approve: ${msg}`,
    };
  } finally {
    try {
      await unlinkAsync(tempFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Submit review comments to GitHub PR
 */
export async function submitReviewComments(
  pr: PRInfo,
  comments: ReviewComment[],
  summary?: string | null
): Promise<{ success: boolean; message: string; url?: string }> {
  validateOwnerRepo(pr.owner, "owner");
  validateOwnerRepo(pr.repo, "repo");

  const cwd = getWorkspacePath();

  if (comments.length === 0) {
    return { success: false, message: "No comments to submit" };
  }

  // Build review payload with side parameter for accurate line placement
  const reviewComments = comments.map((c) => ({
    path: c.file,
    line: c.line,
    side: c.side, // LEFT for deleted lines, RIGHT for added/context lines
    body: c.editedText || formatCommentBody(c),
  }));

  // Use the AI summary or a default message
  const reviewBody =
    summary || `AI code review: ${comments.length} issue(s) found.`;

  const payload = {
    body: reviewBody,
    event: "COMMENT",
    comments: reviewComments,
  };

  // Use a temp file to avoid shell escaping issues with complex JSON
  const tempFile = await writeSecureTempFile(
    "pr-review",
    ".json",
    JSON.stringify(payload, null, 2)
  );

  try {

    const { stdout } = await runCommand("gh", [
      "api",
      `repos/${pr.owner}/${pr.repo}/pulls/${pr.number}/reviews`,
      "--method",
      "POST",
      "--input",
      tempFile,
    ], { cwd });

    const response = JSON.parse(stdout);

    return {
      success: true,
      message: `Submitted ${comments.length} comment(s) to PR #${pr.number}`,
      url: response.html_url,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);

    if (msg.includes("422")) {
      return {
        success: false,
        message:
          "Some line numbers may be invalid for this PR diff. The comment may reference lines not in the diff.",
      };
    }
    if (msg.includes("404")) {
      return { success: false, message: `PR #${pr.number} not found` };
    }

    return { success: false, message: `Failed to submit: ${msg}` };
  } finally {
    // Clean up temp file
    try {
      await unlinkAsync(tempFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Format a comment body for GitHub
 */
function formatCommentBody(comment: ReviewComment): string {
  const severityEmoji: Record<string, string> = {
    critical: "🔴",
    high: "🟠",
    medium: "🟡",
    low: "🟢",
  };

  let body = `${
    severityEmoji[comment.severity] || "⚪"
  } **${comment.severity.toUpperCase()}**: ${comment.issue}`;

  if (comment.suggestion) {
    body += `\n\n**Suggestion:** ${comment.suggestion}`;
  }

  if (comment.codeSnippet) {
    body += `\n\n\`\`\`suggestion\n${comment.codeSnippet}\n\`\`\``;
  }

  return body;
}
