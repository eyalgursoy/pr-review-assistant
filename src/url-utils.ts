/**
 * URL parsing utilities - no vscode dependency for testability
 * Supports GitHub, GitLab, and Bitbucket PR/MR URLs.
 */

import type { HostType } from "./types";

/** GitHub owner/repo: alphanumeric, -, _, . (GitHub allowed chars) */
const GITHUB_OWNER_REPO_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;

/** GitLab/Bitbucket: alphanumeric, -, _, ., / (for repo path with subgroups) */
const GITLAB_OWNER_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;
const GITLAB_REPO_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/;
const BITBUCKET_OWNER_REPO_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;

export interface ParsedPRUrl {
  host: HostType;
  owner: string;
  repo: string;
  number: number;
}

/**
 * Parse a PR/MR URL (GitHub, GitLab, or Bitbucket).
 * Returns null if URL is invalid or segments contain disallowed characters.
 */
export function parsePRUrl(url: string): ParsedPRUrl | null {
  if (!url || typeof url !== "string") return null;

  // GitHub: https://github.com/owner/repo/pull/123
  const githubMatch = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (githubMatch) {
    const owner = githubMatch[1];
    const repo = githubMatch[2];
    const number = parseInt(githubMatch[3], 10);
    if (
      GITHUB_OWNER_REPO_REGEX.test(owner) &&
      GITHUB_OWNER_REPO_REGEX.test(repo)
    ) {
      return { host: "github", owner, repo, number };
    }
    return null;
  }

  // GitLab: https://gitlab.com/owner/repo/-/merge_requests/123 or owner/group/subgroup/repo
  const gitlabMatch = url.match(
    /gitlab\.com\/([^/]+)\/(.+?)\/-\/merge_requests\/(\d+)/ 
  );
  if (gitlabMatch) {
    const owner = gitlabMatch[1];
    const repo = gitlabMatch[2].replace(/\/$/, ""); // trim trailing slash
    const number = parseInt(gitlabMatch[3], 10);
    if (!repo || repo.includes("..")) return null;
    if (
      GITLAB_OWNER_REGEX.test(owner) &&
      GITLAB_REPO_REGEX.test(repo)
    ) {
      return { host: "gitlab", owner, repo, number };
    }
    return null;
  }

  // Bitbucket: https://bitbucket.org/workspace/repo/pull-requests/123
  const bitbucketMatch = url.match(
    /bitbucket\.org\/([^/]+)\/([^/]+)\/pull-requests\/(\d+)/
  );
  if (bitbucketMatch) {
    const owner = bitbucketMatch[1];
    const repo = bitbucketMatch[2];
    const number = parseInt(bitbucketMatch[3], 10);
    if (
      BITBUCKET_OWNER_REPO_REGEX.test(owner) &&
      BITBUCKET_OWNER_REPO_REGEX.test(repo)
    ) {
      return { host: "bitbucket", owner, repo, number };
    }
    return null;
  }

  return null;
}
