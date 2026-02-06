/**
 * URL parsing utilities - no vscode dependency for testability
 */

/** GitHub owner/repo: alphanumeric, -, _, . (GitHub allowed chars) */
const GITHUB_OWNER_REPO_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;

/**
 * Parse a GitHub PR URL
 * Formats: https://github.com/owner/repo/pull/123
 * Returns null if URL is invalid or owner/repo contain disallowed characters
 */
export function parsePRUrl(
  url: string
): { owner: string; repo: string; number: number } | null {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!match) return null;

  const owner = match[1];
  const repo = match[2];
  const number = parseInt(match[3], 10);

  if (!GITHUB_OWNER_REPO_REGEX.test(owner) || !GITHUB_OWNER_REPO_REGEX.test(repo)) {
    return null;
  }

  return { owner, repo, number };
}
