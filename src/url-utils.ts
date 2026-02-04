/**
 * URL parsing utilities - no vscode dependency for testability
 */

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
