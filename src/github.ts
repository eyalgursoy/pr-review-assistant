/**
 * GitHub integration - PR info fetching and comment submission
 */

import { exec } from "child_process";
import { promisify } from "util";
import * as vscode from "vscode";
import type { PRInfo, ChangedFile, ReviewComment } from "./types";

const execAsync = promisify(exec);

function getWorkspacePath(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

/**
 * Parse a GitHub PR URL
 * Formats: https://github.com/owner/repo/pull/123
 */
export function parsePRUrl(
  url: string
): { owner: string; repo: string; number: number } | null {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (match) {
    return {
      owner: match[1],
      repo: match[2],
      number: parseInt(match[3], 10),
    };
  }
  return null;
}

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
    await execAsync("gh --version", { cwd });
  } catch {
    return {
      available: false,
      authenticated: false,
      error:
        "GitHub CLI (gh) not installed. Install from https://cli.github.com/",
    };
  }

  try {
    await execAsync("gh auth status", { cwd });
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
  const cwd = getWorkspacePath();

  const { stdout } = await execAsync(
    `gh pr view ${prNumber} --repo ${owner}/${repo} --json number,title,headRefName,baseRefName,url`,
    { cwd }
  );

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
  const cwd = getWorkspacePath();

  const { stdout } = await execAsync(
    `gh pr view ${prNumber} --repo ${owner}/${repo} --json files`,
    { cwd }
  );

  const data = JSON.parse(stdout);

  return data.files.map((f: any) => ({
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
  const cwd = getWorkspacePath();

  const { stdout } = await execAsync(
    `gh pr diff ${prNumber} --repo ${owner}/${repo}`,
    { cwd, maxBuffer: 50 * 1024 * 1024 }
  );

  return stdout;
}

/**
 * Fetch branch and get diff (like pr-review-prepare.mjs)
 */
export async function fetchBranchDiff(
  headBranch: string,
  baseBranch: string = "main"
): Promise<string> {
  const cwd = getWorkspacePath();

  // Fetch the branch
  await execAsync(`git fetch origin ${headBranch}`, { cwd });

  // Get the diff
  const { stdout } = await execAsync(
    `git diff origin/${baseBranch}...origin/${headBranch} --no-color`,
    { cwd, maxBuffer: 50 * 1024 * 1024 }
  );

  return stdout;
}

/**
 * Submit review comments to GitHub PR
 */
export async function submitReviewComments(
  pr: PRInfo,
  comments: ReviewComment[]
): Promise<{ success: boolean; message: string; url?: string }> {
  const cwd = getWorkspacePath();

  if (comments.length === 0) {
    return { success: false, message: "No comments to submit" };
  }

  // Build review payload
  const reviewComments = comments.map((c) => ({
    path: c.file,
    line: c.line,
    body: c.editedText || formatCommentBody(c),
  }));

  const payload = {
    body: "AI-assisted code review",
    event: "COMMENT",
    comments: reviewComments,
  };

  try {
    const jsonPayload = JSON.stringify(payload);
    const escapedPayload = jsonPayload.replace(/'/g, "'\\''");

    const { stdout } = await execAsync(
      `echo '${escapedPayload}' | gh api repos/${pr.owner}/${pr.repo}/pulls/${pr.number}/reviews --method POST --input -`,
      { cwd }
    );

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
        message: "Some line numbers may be invalid for this PR diff",
      };
    }
    if (msg.includes("404")) {
      return { success: false, message: `PR #${pr.number} not found` };
    }

    return { success: false, message: `Failed to submit: ${msg}` };
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
