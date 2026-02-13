/**
 * GitHub PR provider - uses gh CLI for auth and API
 */

import { promisify } from "util";
import * as fs from "fs";
import * as vscode from "vscode";
import type { PRInfo, ChangedFile, ReviewComment } from "../types";
import type { PRProvider, AuthStatus, SubmitResult } from "./types";
import {
  runCommand,
  validateOwnerRepo,
  writeSecureTempFile,
} from "../shell-utils";
import { log } from "../logger";

const unlinkAsync = promisify(fs.unlink);

function getWorkspacePath(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

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

export const githubProvider: PRProvider = {
  host: "github",

  async checkAuth(): Promise<AuthStatus> {
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
  },

  async fetchPRInfo(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<PRInfo> {
    validateOwnerRepo(owner, "owner");
    validateOwnerRepo(repo, "repo");

    const cwd = getWorkspacePath();

    const { stdout } = await runCommand(
      "gh",
      [
        "pr",
        "view",
        String(prNumber),
        "--repo",
        `${owner}/${repo}`,
        "--json",
        "number,title,headRefName,baseRefName,url",
      ],
      { cwd }
    );

    let data: {
      number: number;
      title: string;
      headRefName: string;
      baseRefName: string;
      url: string;
    };
    try {
      data = JSON.parse(stdout);
    } catch (e) {
      log(`fetchPRInfo gh stdout (truncated): ${stdout.substring(0, 500)}`);
      throw new Error(
        "Failed to load PR information. Check that the PR exists and you have access (gh auth status)."
      );
    }

    return {
      number: data.number,
      owner,
      repo,
      title: data.title,
      headBranch: data.headRefName,
      baseBranch: data.baseRefName,
      url: data.url,
      host: "github",
    };
  },

  async fetchChangedFiles(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<ChangedFile[]> {
    validateOwnerRepo(owner, "owner");
    validateOwnerRepo(repo, "repo");

    const cwd = getWorkspacePath();

    const { stdout } = await runCommand(
      "gh",
      [
        "pr",
        "view",
        String(prNumber),
        "--repo",
        `${owner}/${repo}`,
        "--json",
        "files",
      ],
      { cwd }
    );

    let data: {
      files?: Array<{
        path: string;
        status?: string;
        additions?: number;
        deletions?: number;
      }>;
    };
    try {
      data = JSON.parse(stdout);
    } catch (e) {
      log(`fetchChangedFiles gh stdout (truncated): ${stdout.substring(0, 500)}`);
      throw new Error(
        "Failed to load PR file list. Check that the PR exists and you have access."
      );
    }
    if (!data.files || !Array.isArray(data.files)) {
      throw new Error(
        "Failed to load PR file list. GitHub returned an unexpected response."
      );
    }

    return data.files.map((f): ChangedFile => {
      const raw = f.status?.toLowerCase() || "modified";
      const status =
        raw === "added" || raw === "deleted" || raw === "renamed"
          ? raw
          : "modified";
      return {
        path: f.path,
        status,
        additions: f.additions || 0,
        deletions: f.deletions || 0,
        comments: [],
      };
    });
  },

  async fetchPRDiff(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<string> {
    validateOwnerRepo(owner, "owner");
    validateOwnerRepo(repo, "repo");

    const cwd = getWorkspacePath();

    const { stdout } = await runCommand(
      "gh",
      [
        "pr",
        "diff",
        String(prNumber),
        "--repo",
        `${owner}/${repo}`,
      ],
      { cwd, maxBuffer: 50 * 1024 * 1024 }
    );

    return stdout;
  },

  async submitReviewComments(
    pr: PRInfo,
    comments: ReviewComment[],
    summary?: string | null
  ): Promise<SubmitResult> {
    validateOwnerRepo(pr.owner, "owner");
    validateOwnerRepo(pr.repo, "repo");

    const cwd = getWorkspacePath();

    if (comments.length === 0) {
      return { success: false, message: "No comments to submit" };
    }

    const reviewComments = comments.map((c) => ({
      path: c.file,
      line: c.line,
      side: c.side,
      body: c.editedText || formatCommentBody(c),
    }));

    const reviewBody =
      summary || `AI code review: ${comments.length} issue(s) found.`;

    const payload = {
      body: reviewBody,
      event: "COMMENT",
      comments: reviewComments,
    };

    const tempFile = await writeSecureTempFile(
      "pr-review",
      ".json",
      JSON.stringify(payload, null, 2)
    );

    try {
      const { stdout } = await runCommand(
        "gh",
        [
          "api",
          `repos/${pr.owner}/${pr.repo}/pulls/${pr.number}/reviews`,
          "--method",
          "POST",
          "--input",
          tempFile,
        ],
        { cwd }
      );

      let response: { html_url?: string };
      try {
        response = JSON.parse(stdout);
      } catch {
        log(
          `submitReviewComments gh stdout (truncated): ${stdout.substring(0, 500)}`
        );
        return {
          success: false,
          message:
            "GitHub returned an unexpected response. Check the PR and try again.",
        };
      }

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
      try {
        await unlinkAsync(tempFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  },

  async approvePR(
    pr: PRInfo,
    body: string = "LGTM! Code reviewed with PR Review Assistant."
  ): Promise<SubmitResult> {
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
      const { stdout } = await runCommand(
        "gh",
        [
          "api",
          `repos/${pr.owner}/${pr.repo}/pulls/${pr.number}/reviews`,
          "--method",
          "POST",
          "--input",
          tempFile,
        ],
        { cwd }
      );

      let response: { html_url?: string };
      try {
        response = JSON.parse(stdout);
      } catch {
        log(`approvePR gh stdout (truncated): ${stdout.substring(0, 500)}`);
        return {
          success: false,
          message:
            "GitHub returned an unexpected response. Check the PR and try again.",
        };
      }

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
  },
};
