/**
 * GitLab Merge Request provider - uses REST API with token auth
 */

import * as vscode from "vscode";
import type { PRInfo, ChangedFile, ReviewComment } from "../types";
import type { PRProvider, AuthStatus, SubmitResult } from "./types";
import { getApiKey } from "../secrets";

function getBaseUrl(): string {
  return vscode.workspace
    .getConfiguration("prReview")
    .get<string>("gitlabUrl", "https://gitlab.com");
}

async function getToken(): Promise<string | undefined> {
  const fromSecret = await getApiKey("gitlab");
  if (fromSecret) return fromSecret;
  return vscode.workspace
    .getConfiguration("prReview")
    .get<string>("gitlabToken", "");
}

function projectId(owner: string, repo: string): string {
  const path = repo ? `${owner}/${repo}` : owner;
  return encodeURIComponent(path);
}

async function gitlabFetch(
  baseUrl: string,
  token: string,
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/v4${path}`;
  const headers: Record<string, string> = {
    "PRIVATE-TOKEN": token,
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  return fetch(url, { ...options, headers });
}

function formatCommentBody(comment: ReviewComment): string {
  const severityEmoji: Record<string, string> = {
    critical: "🔴",
    high: "🟠",
    medium: "🟡",
    low: "🟢",
  };

  let body = `**${severityEmoji[comment.severity] || "⚪"} ${comment.severity.toUpperCase()}**: ${comment.issue}`;

  if (comment.suggestion) {
    body += `\n\n**Suggestion:** ${comment.suggestion}`;
  }

  if (comment.codeSnippet) {
    body += `\n\n\`\`\`suggestion\n${comment.codeSnippet}\n\`\`\``;
  }

  return body;
}

export const gitlabProvider: PRProvider = {
  host: "gitlab",

  async checkAuth(): Promise<AuthStatus> {
    const token = await getToken();
    if (!token || !token.trim()) {
      return {
        available: true,
        authenticated: false,
        error:
          "GitLab token not set. Use PR Review: Set API Key (Secure) and choose GitLab.",
      };
    }

    const baseUrl = getBaseUrl();
    const res = await gitlabFetch(baseUrl, token, "/user");

    if (res.ok) {
      return { available: true, authenticated: true };
    }

    if (res.status === 401) {
      return {
        available: true,
        authenticated: false,
        error: "GitLab token invalid or expired. Update it in Set API Key.",
      };
    }

    return {
      available: true,
      authenticated: false,
      error: `GitLab API error: ${res.status} ${res.statusText}`,
    };
  },

  async fetchPRInfo(
    owner: string,
    repo: string,
    number: number
  ): Promise<PRInfo> {
    const token = await getToken();
    if (!token) throw new Error("GitLab token not set. Use Set API Key (Secure).");

    const baseUrl = getBaseUrl();
    const projId = projectId(owner, repo);
    const res = await gitlabFetch(
      baseUrl,
      token,
      `/projects/${projId}/merge_requests/${number}`
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        res.status === 404
          ? "Merge request not found. Check URL and token scope."
          : `GitLab API: ${res.status} ${text.slice(0, 200)}`
      );
    }

    const data = (await res.json()) as {
      iid: number;
      title: string;
      source_branch: string;
      target_branch: string;
      web_url: string;
    };

    return {
      number: data.iid,
      owner,
      repo,
      title: data.title,
      headBranch: data.source_branch,
      baseBranch: data.target_branch,
      url: data.web_url,
      host: "gitlab",
    };
  },

  async fetchChangedFiles(
    owner: string,
    repo: string,
    number: number
  ): Promise<ChangedFile[]> {
    const token = await getToken();
    if (!token) throw new Error("GitLab token not set.");

    const baseUrl = getBaseUrl();
    const projId = projectId(owner, repo);
    const res = await gitlabFetch(
      baseUrl,
      token,
      `/projects/${projId}/merge_requests/${number}/changes`
    );

    if (!res.ok) {
      throw new Error(`GitLab API: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as {
      changes?: Array<{
        new_path: string;
        old_path: string;
        new_file?: boolean;
        deleted_file?: boolean;
        diff: string;
      }>;
    };

    const changes = data.changes || [];

    return changes.map(
      (c): ChangedFile => {
        let status: ChangedFile["status"] = "modified";
        if (c.new_file) status = "added";
        else if (c.deleted_file) status = "deleted";
        else if (c.old_path !== c.new_path) status = "renamed";

        const diffLines = (c.diff || "").split("\n").filter(Boolean);
        let additions = 0;
        let deletions = 0;
        for (const line of diffLines) {
          if (line.startsWith("+") && !line.startsWith("+++")) additions++;
          else if (line.startsWith("-") && !line.startsWith("---")) deletions++;
        }

        return {
          path: c.new_path || c.old_path,
          status,
          additions,
          deletions,
          comments: [],
        };
      }
    );
  },

  async fetchPRDiff(
    owner: string,
    repo: string,
    number: number
  ): Promise<string> {
    const token = await getToken();
    if (!token) throw new Error("GitLab token not set.");

    const baseUrl = getBaseUrl();
    const projId = projectId(owner, repo);
    const res = await gitlabFetch(
      baseUrl,
      token,
      `/projects/${projId}/merge_requests/${number}/changes`
    );

    if (!res.ok) {
      throw new Error(`GitLab API: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as {
      changes?: Array<{ diff: string }>;
    };

    const changes = data.changes || [];
    return changes.map((c) => c.diff || "").join("\n\n");
  },

  async fetchPRComments(
    owner: string,
    repo: string,
    number: number
  ): Promise<ReviewComment[]> {
    const token = await getToken();
    if (!token) return [];

    const baseUrl = getBaseUrl();
    const projId = projectId(owner, repo);
    const all: ReviewComment[] = [];
    let page = 1;
    const perPage = 100;

    function normalizePath(p: string): string {
      if (p.startsWith("a/") || p.startsWith("b/")) return p.substring(2);
      return p;
    }

    while (true) {
      const res = await gitlabFetch(
        baseUrl,
        token,
        `/projects/${projId}/merge_requests/${number}/discussions?per_page=${perPage}&page=${page}`
      );

      if (!res.ok) break;

      const discussions = (await res.json()) as Array<{
        notes?: Array<{
          id: number;
          body?: string;
          author?: { username?: string };
          position?: {
            new_path?: string;
            old_path?: string;
            new_line?: number | null;
            old_line?: number | null;
          };
        }>;
      }>;

      if (!Array.isArray(discussions) || discussions.length === 0) break;

      for (const discussion of discussions) {
        const notes = discussion.notes || [];
        for (const note of notes) {
          const position = note.position;
          if (!position) continue;

          const newPath = position.new_path ?? position.old_path;
          const oldPath = position.old_path ?? position.new_path;
          if (!newPath && !oldPath) continue;

          const path = normalizePath(newPath || oldPath || "");
          const newLine = position.new_line;
          const oldLine = position.old_line;
          const hasNew = newLine != null && newLine > 0;
          const hasOld = oldLine != null && oldLine > 0;

          const side: "LEFT" | "RIGHT" = hasNew ? "RIGHT" : "LEFT";
          const line = hasNew ? (newLine ?? 1) : (hasOld ? (oldLine ?? 1) : 1);

          all.push({
            id: `host-gl-${note.id}`,
            file: path,
            line: typeof line === "number" ? line : 1,
            side,
            severity: "medium",
            issue: (note.body || "").trim() || "(No content)",
            status: "pending",
            authorName: note.author?.username,
          });
        }
      }

      if (discussions.length < perPage) break;
      page += 1;
    }

    return all;
  },

  async submitReviewComments(
    pr: PRInfo,
    comments: ReviewComment[],
    _summary?: string | null
  ): Promise<SubmitResult> {
    const token = await getToken();
    if (!token) {
      return { success: false, message: "GitLab token not set." };
    }

    if (comments.length === 0) {
      return { success: false, message: "No comments to submit" };
    }

    const baseUrl = getBaseUrl();
    const projId = projectId(pr.owner, pr.repo);

    // Get MR to read diff_refs for position (base_sha, start_sha, head_sha)
    const mrRes = await gitlabFetch(
      baseUrl,
      token,
      `/projects/${projId}/merge_requests/${pr.number}`
    );
    if (!mrRes.ok) {
      return {
        success: false,
        message: `Failed to load MR: ${mrRes.status} ${mrRes.statusText}`,
      };
    }

    const mr = (await mrRes.json()) as {
      diff_refs?: {
        base_sha: string;
        head_sha: string;
        start_sha: string;
      };
    };

    const diffRefs = mr.diff_refs;
    if (!diffRefs) {
      return {
        success: false,
        message:
          "Merge request has no diff refs (e.g. branch was rebased). Refresh the MR and try again.",
      };
    }

    let successCount = 0;
    let lastError = "";

    for (const c of comments) {
      const body = c.editedText || formatCommentBody(c);

      const position: Record<string, unknown> = {
        base_sha: diffRefs.base_sha,
        start_sha: diffRefs.start_sha,
        head_sha: diffRefs.head_sha,
        position_type: "text",
        new_path: c.file,
        old_path: c.file,
      };

      if (c.side === "RIGHT") {
        position.new_line = c.line;
        // old_line optional for new lines
      } else {
        position.old_line = c.line;
        position.new_line = null;
      }

      const discussionRes = await gitlabFetch(
        baseUrl,
        token,
        `/projects/${projId}/merge_requests/${pr.number}/discussions`,
        {
          method: "POST",
          body: JSON.stringify({ body, position }),
        }
      );

      if (discussionRes.ok) {
        successCount++;
      } else {
        const errText = await discussionRes.text();
        lastError = `${c.file}:${c.line} - ${discussionRes.status} ${errText.slice(0, 100)}`;
      }
    }

    if (successCount === comments.length) {
      return {
        success: true,
        message: `Submitted ${comments.length} comment(s) to MR !${pr.number}`,
        url: pr.url,
      };
    }

    if (successCount > 0) {
      return {
        success: false,
        message: `Submitted ${successCount}/${comments.length} comments. Last error: ${lastError}`,
        url: pr.url,
      };
    }

    return {
      success: false,
      message: `Failed to submit comments: ${lastError}`,
    };
  },

  async approvePR(
    pr: PRInfo,
    body: string = "LGTM! Code reviewed with PR Review Assistant."
  ): Promise<SubmitResult> {
    const token = await getToken();
    if (!token) {
      return { success: false, message: "GitLab token not set." };
    }

    const baseUrl = getBaseUrl();
    const projId = projectId(pr.owner, pr.repo);

    const res = await gitlabFetch(
      baseUrl,
      token,
      `/projects/${projId}/merge_requests/${pr.number}/approve`,
      { method: "POST" }
    );

    if (res.ok) {
      return {
        success: true,
        message: `MR !${pr.number} approved`,
        url: pr.url,
      };
    }

    const text = await res.text();
    return {
      success: false,
      message: `Failed to approve: ${res.status} ${text.slice(0, 150)}`,
    };
  },
};
