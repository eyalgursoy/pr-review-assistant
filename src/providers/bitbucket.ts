/**
 * Bitbucket Pull Request provider - uses REST API 2.0 with token/app password
 */

import * as vscode from "vscode";
import type { PRInfo, ChangedFile, ReviewComment } from "../types";
import type { PRProvider, AuthStatus, SubmitResult } from "./types";
import { getApiKey } from "../secrets";

const BITBUCKET_API_BASE = "https://api.bitbucket.org/2.0";

async function getToken(): Promise<string | undefined> {
  const fromSecret = await getApiKey("bitbucket");
  if (fromSecret) return fromSecret;
  return vscode.workspace
    .getConfiguration("prReview")
    .get<string>("bitbucketToken", "");
}

function getUsername(): string {
  return vscode.workspace
    .getConfiguration("prReview")
    .get<string>("bitbucketUsername", "");
}

async function bitbucketFetch(
  path: string,
  token: string,
  options: RequestInit = {}
): Promise<Response> {
  const username = getUsername();
  const url = `${BITBUCKET_API_BASE}${path}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (username) {
    const auth = Buffer.from(`${username}:${token}`).toString("base64");
    headers["Authorization"] = `Basic ${auth}`;
  } else {
    headers["Authorization"] = `Bearer ${token}`;
  }

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

export type BbComment = {
  id: number;
  content?: { raw?: string };
  anchor?: { path?: string; line?: number; line_type?: string };
  inline?: { path?: string; to?: number; from?: number };
  user?: { display_name?: string; username?: string };
  parent?: { id: number };
  deleted?: boolean;
};

function normalizeBbPath(p: string): string {
  if (p.startsWith("a/") || p.startsWith("b/")) return p.substring(2);
  return p;
}

/** Map an array of raw Bitbucket comments to ReviewComment[]. */
export function mapBitbucketComments(items: BbComment[]): ReviewComment[] {
  const results: ReviewComment[] = [];

  for (const item of items) {
    const anchor = item.anchor ?? item.inline;
    const path = anchor?.path;
    if (!path) continue;

    const a = anchor as
      | { line?: number; line_type?: string }
      | { to?: number; from?: number }
      | undefined;
    const line =
      (a && "line" in a && a.line != null)
        ? a.line
        : (a && "to" in a && a.to != null)
          ? a.to
          : (a && "from" in a && a.from != null)
            ? a.from
            : 1;
    const lineType =
      a && "line_type" in a ? (a as { line_type?: string }).line_type : null;
    const side: "LEFT" | "RIGHT" =
      lineType === "removed" ? "LEFT" : "RIGHT";

    results.push({
      id: `host-bb-${item.id}`,
      file: normalizeBbPath(path),
      line: typeof line === "number" ? line : 1,
      side,
      severity: "medium",
      issue: (item.content?.raw || "").trim() || "(No content)",
      status: "pending",
      authorName: item.user?.display_name ?? item.user?.username,
      source: "host",
      hostOutdated: item.deleted ?? false,
      hostResolved: false,
      parentId: item.parent?.id ? `host-bb-${item.parent.id}` : undefined,
      hostCommentId: item.id,
    });
  }

  return results;
}

export const bitbucketProvider: PRProvider = {
  host: "bitbucket",

  async checkAuth(): Promise<AuthStatus> {
    const token = await getToken();
    if (!token || !token.trim()) {
      return {
        available: true,
        authenticated: false,
        error:
          "Bitbucket token not set. Use PR Review: Set API Key (Secure) and choose Bitbucket.",
      };
    }

    const res = await bitbucketFetch("/user", token);

    if (res.ok) {
      return { available: true, authenticated: true };
    }

    if (res.status === 401) {
      return {
        available: true,
        authenticated: false,
        error:
          "Bitbucket token invalid or expired. For App Password, set prReview.bitbucketUsername.",
      };
    }

    return {
      available: true,
      authenticated: false,
      error: `Bitbucket API: ${res.status} ${res.statusText}`,
    };
  },

  async fetchPRInfo(
    owner: string,
    repo: string,
    number: number
  ): Promise<PRInfo> {
    const token = await getToken();
    if (!token) throw new Error("Bitbucket token not set. Use Set API Key (Secure).");

    const res = await bitbucketFetch(
      `/repositories/${owner}/${repo}/pullrequests/${number}`,
      token
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        res.status === 404
          ? "Pull request not found. Check URL and token permissions."
          : `Bitbucket API: ${res.status} ${text.slice(0, 200)}`
      );
    }

    const data = (await res.json()) as {
      id: number;
      title: string;
      source: { branch: { name: string } };
      destination: { branch: { name: string } };
      links: { html: { href: string } };
    };

    return {
      number: data.id,
      owner,
      repo,
      title: data.title,
      headBranch: data.source.branch.name,
      baseBranch: data.destination.branch.name,
      url: data.links.html.href,
      host: "bitbucket",
    };
  },

  async fetchChangedFiles(
    owner: string,
    repo: string,
    number: number
  ): Promise<ChangedFile[]> {
    const token = await getToken();
    if (!token) throw new Error("Bitbucket token not set.");

    const res = await bitbucketFetch(
      `/repositories/${owner}/${repo}/pullrequests/${number}/diffstat`,
      token
    );

    if (!res.ok) {
      throw new Error(`Bitbucket API: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as {
      values?: Array<{
        new?: { path: string };
        old?: { path: string };
        status?: string;
        lines_added?: number;
        lines_removed?: number;
      }>;
    };

    const values = data.values || [];

    return values.map(
      (v): ChangedFile => {
        const path = v.new?.path ?? v.old?.path ?? "";
        const raw = (v.status || "modified").toLowerCase();
        const status: ChangedFile["status"] =
          raw === "added" || raw === "new"
            ? "added"
            : raw === "removed" || raw === "deleted"
              ? "deleted"
              : raw === "renamed"
                ? "renamed"
                : "modified";

        return {
          path,
          status,
          additions: v.lines_added ?? 0,
          deletions: v.lines_removed ?? 0,
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
    if (!token) throw new Error("Bitbucket token not set.");

    const res = await bitbucketFetch(
      `/repositories/${owner}/${repo}/pullrequests/${number}/diff`,
      token
    );

    if (!res.ok) {
      throw new Error(`Bitbucket API: ${res.status} ${res.statusText}`);
    }

    return res.text();
  },

  async fetchPRComments(
    owner: string,
    repo: string,
    number: number
  ): Promise<ReviewComment[]> {
    const token = await getToken();
    if (!token) return [];

    const all: ReviewComment[] = [];
    let page = 1;
    const pageLen = 100;

    while (true) {
      const res = await bitbucketFetch(
        `/repositories/${owner}/${repo}/pullrequests/${number}/comments?page=${page}&pagelen=${pageLen}`,
        token
      );

      if (!res.ok) break;

      const data = (await res.json()) as {
        values?: BbComment[];
        next?: string;
      };

      const values = data.values || [];
      if (values.length === 0) break;

      all.push(...mapBitbucketComments(values));

      if (!data.next || values.length < pageLen) break;
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
      return { success: false, message: "Bitbucket token not set." };
    }

    if (comments.length === 0) {
      return { success: false, message: "No comments to submit" };
    }

    let successCount = 0;
    let lastError = "";

    for (const c of comments) {
      const body = c.editedText || formatCommentBody(c);

      const anchor: Record<string, unknown> = {
        path: c.file,
        line: c.line,
        line_type: c.side === "LEFT" ? "removed" : "added",
      };

      const res = await bitbucketFetch(
        `/repositories/${pr.owner}/${pr.repo}/pullrequests/${pr.number}/comments`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            content: { raw: body },
            anchor,
          }),
        }
      );

      if (res.ok) {
        successCount++;
      } else {
        const errText = await res.text();
        lastError = `${c.file}:${c.line} - ${res.status} ${errText.slice(0, 100)}`;
      }
    }

    if (successCount === comments.length) {
      return {
        success: true,
        message: `Submitted ${comments.length} comment(s) to PR #${pr.number}`,
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
    _body?: string
  ): Promise<SubmitResult> {
    const token = await getToken();
    if (!token) {
      return { success: false, message: "Bitbucket token not set." };
    }

    const res = await bitbucketFetch(
      `/repositories/${pr.owner}/${pr.repo}/pullrequests/${pr.number}/approve`,
      token,
      { method: "POST" }
    );

    if (res.ok) {
      return {
        success: true,
        message: `PR #${pr.number} approved`,
        url: pr.url,
      };
    }

    const text = await res.text();
    return {
      success: false,
      message: `Failed to approve: ${res.status} ${text.slice(0, 150)}`,
    };
  },

  async replyToComment(
    pr: PRInfo,
    comment: ReviewComment,
    body: string
  ): Promise<SubmitResult> {
    const parentId = comment.hostCommentId;
    if (parentId == null) {
      return {
        success: false,
        message:
          "Reply requires the host comment id. Reload the PR to get it.",
      };
    }

    const token = await getToken();
    if (!token) {
      return { success: false, message: "Bitbucket token not set." };
    }

    const numericId = typeof parentId === "number" ? parentId : parseInt(String(parentId), 10);
    if (Number.isNaN(numericId)) {
      return { success: false, message: "Invalid comment id for reply." };
    }

    const res = await bitbucketFetch(
      `/repositories/${pr.owner}/${pr.repo}/pullrequests/${pr.number}/comments`,
      token,
      {
        method: "POST",
        body: JSON.stringify({
          content: { raw: body },
          parent: { id: numericId },
        }),
      }
    );

    if (res.ok) {
      return { success: true, message: "Reply posted.", url: pr.url };
    }
    const text = await res.text();
    return {
      success: false,
      message: `Failed to post reply: ${res.status} ${text.slice(0, 150)}`,
    };
  },

  async setThreadResolved(
    _pr: PRInfo,
    _threadId: string,
    resolved: boolean
  ): Promise<SubmitResult> {
    return {
      success: true,
      message: `Thread ${resolved ? "resolve" : "unresolve"} is not supported for Bitbucket.`,
    };
  },
};
