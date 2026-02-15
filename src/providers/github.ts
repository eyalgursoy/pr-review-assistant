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

/** Parse GitHub comment body into issue / suggestion / codeSnippet. */
function parseCommentBody(body: string): {
  issue: string;
  suggestion?: string;
  codeSnippet?: string;
} {
  const trimmed = (body || "").trim();
  if (!trimmed) return { issue: "" };

  let issue = trimmed;
  let suggestion: string | undefined;
  let codeSnippet: string | undefined;

  const suggestionBlock = /```suggestion\s*\n([\s\S]*?)```/i.exec(trimmed);
  if (suggestionBlock) {
    codeSnippet = suggestionBlock[1].trim();
    issue = issue.replace(suggestionBlock[0], "").trim();
  }

  const suggestionLabel = /\*\*Suggestion:\*\*\s*([\s\S]*?)(?=\n\n\*\*|\n```|$)/i.exec(
    issue
  );
  if (suggestionLabel) {
    suggestion = suggestionLabel[1].trim();
    issue = issue.replace(suggestionLabel[0], "").trim();
  }

  if (!issue && suggestion) issue = suggestion;
  return { issue: issue || trimmed, suggestion, codeSnippet };
}

function normalizePath(path: string): string {
  if (path.startsWith("a/") || path.startsWith("b/")) {
    return path.substring(2);
  }
  return path;
}

/**
 * Fetches thread-level isResolved for PR review threads via GraphQL.
 * Returns a map from comment node_id to resolved (true only when thread is resolved).
 * On failure (e.g. permissions or network), returns an empty map so REST-based fetch still works.
 */
async function fetchReviewThreadResolvedMap(
  owner: string,
  repo: string,
  prNumber: number,
  cwd: string | undefined
): Promise<Map<string, boolean>> {
  const map = new Map<string, boolean>();
  const query =
    "query($owner: String!, $repo: String!, $number: Int!, $cursor: String) { repository(owner: $owner, name: $repo) { pullRequest(number: $number) { reviewThreads(first: 100, after: $cursor) { nodes { isResolved comments(first: 100) { nodes { id } } } pageInfo { hasNextPage endCursor } } } } }";
  let cursor: string | null = null;

  try {
    for (;;) {
      const args = [
        "api",
        "graphql",
        "-f",
        `query=${query}`,
        "-f",
        `owner=${owner}`,
        "-f",
        `repo=${repo}`,
        "-F",
        `number=${prNumber}`,
      ];
      if (cursor != null) {
        args.push("-f", `cursor=${cursor}`);
      }
      const { stdout } = await runCommand("gh", args, { cwd });
      const data = JSON.parse(stdout || "{}") as {
        data?: {
          repository?: {
            pullRequest?: {
              reviewThreads?: {
                nodes?: Array<{
                  isResolved?: boolean;
                  comments?: { nodes?: Array<{ id?: string }> };
                }>;
                pageInfo?: { hasNextPage?: boolean; endCursor?: string };
              };
            };
          };
        };
        errors?: Array<{ message?: string }>;
      };
      if (data.errors?.length) {
        log(
          `fetchReviewThreadResolvedMap GraphQL errors: ${JSON.stringify(data.errors)}`
        );
        break;
      }
      const threads =
        data.data?.repository?.pullRequest?.reviewThreads?.nodes ?? [];
      const pageInfo =
        data.data?.repository?.pullRequest?.reviewThreads?.pageInfo;

      for (const thread of threads) {
        const resolved = thread.isResolved === true;
        const commentIds = thread.comments?.nodes ?? [];
        for (const node of commentIds) {
          if (node.id) map.set(node.id, resolved);
        }
      }

      if (!pageInfo?.hasNextPage || !pageInfo?.endCursor) break;
      cursor = pageInfo.endCursor;
    }
  } catch (e) {
    log(
      `fetchReviewThreadResolvedMap failed (resolved state will be unknown): ${e instanceof Error ? e.message : String(e)}`
    );
  }
  return map;
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

  async fetchPRComments(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<ReviewComment[]> {
    validateOwnerRepo(owner, "owner");
    validateOwnerRepo(repo, "repo");

    const cwd = getWorkspacePath();
    const all: ReviewComment[] = [];
    const perPage = 100;
    let page = 1;

    type GhComment = {
      id?: number;
      node_id?: string;
      path?: string;
      line?: number | null;
      original_line?: number | null;
      position?: number | null;
      side?: string;
      body?: string;
      user?: { login?: string } | null;
      subject_type?: string;
      in_reply_to_id?: number | null;
    };

    const rawItems: GhComment[] = [];
    while (true) {
      const url = `repos/${owner}/${repo}/pulls/${prNumber}/comments?per_page=${perPage}&page=${page}`;
      const { stdout } = await runCommand(
        "gh",
        ["api", url],
        { cwd }
      );

      let items: GhComment[];
      try {
        const parsed = JSON.parse(stdout || "[]");
        if (Array.isArray(parsed)) {
          items = parsed;
        } else if (
          parsed &&
          typeof parsed === "object" &&
          "message" in parsed
        ) {
          break;
        } else {
          items = [parsed];
        }
      } catch (e) {
        log(
          `fetchPRComments parse error (truncated): ${(stdout || "").substring(0, 300)}`
        );
        break;
      }

      if (items.length === 0) break;
      rawItems.push(...items);
      if (items.length < perPage) break;
      page += 1;
    }

    const idToNodeId = new Map<number, string>();
    for (const item of rawItems) {
      if (item.id != null && item.node_id != null) {
        idToNodeId.set(item.id, item.node_id);
      }
    }

    const commentIdToResolved = await fetchReviewThreadResolvedMap(
      owner,
      repo,
      prNumber,
      cwd
    );

    for (const item of rawItems) {
      const path = item.path;
      if (!path) continue;

      const subjectType = item.subject_type;
      const isFileLevel = subjectType === "file";
      const line =
        isFileLevel ? 1 : (item.line ?? item.original_line ?? 1);
      const side =
        item.side === "LEFT" ? ("LEFT" as const) : ("RIGHT" as const);
      const nodeId = item.node_id ?? String(item.id ?? "");
      const id = `host-gh-${nodeId}`;
      const parsedBody = parseCommentBody(item.body ?? "");
      const filePath = normalizePath(path);

      const outdated =
        !isFileLevel &&
        (item.position == null ||
          (item.line == null && item.original_line == null));

      const parentNodeId =
        item.in_reply_to_id != null
          ? idToNodeId.get(item.in_reply_to_id)
          : undefined;
      const parentId =
        parentNodeId != null ? `host-gh-${parentNodeId}` : undefined;

      const resolved =
        item.node_id != null
          ? commentIdToResolved.get(item.node_id)
          : undefined;

      all.push({
        id,
        file: filePath,
        line: typeof line === "number" ? line : 1,
        side,
        severity: "medium",
        issue: parsedBody.issue,
        suggestion: parsedBody.suggestion,
        codeSnippet: parsedBody.codeSnippet,
        status: "pending",
        authorName: item.user?.login,
        source: "host",
        parentId,
        outdated: outdated || undefined,
        resolved: resolved === true ? true : undefined,
      });
    }

    return all;
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
