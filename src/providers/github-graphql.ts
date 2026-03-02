/**
 * GitHub GraphQL: fetch PR review thread resolution/outdated and apply to REST comments.
 * Used by the GitHub provider to set hostResolved/hostOutdated so the display filter can hide them.
 */

import type { ReviewComment } from "../types";
import { runCommand } from "../shell-utils";

/** Resolution/outdated state for a comment (from its thread). Key = comment node_id (e.g. PRRC_xxx). */
export type CommentThreadState = {
  isResolved: boolean;
  isOutdated: boolean;
  /** Thread node id (e.g. PRRT_xxx) for resolve/unresolve API. */
  threadId?: string;
};

const REVIEW_THREADS_QUERY = `
  query($owner: String!, $name: String!, $number: Int!, $after: String) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $number) {
        reviewThreads(first: 100, after: $after) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            isResolved
            isOutdated
            comments(first: 50) {
              nodes { id }
            }
          }
        }
      }
    }
  }
`;

/**
 * Fetch resolution/outdated for all PR review threads via GraphQL.
 * Returns a map: comment node_id (id from GraphQL) -> { isResolved, isOutdated }.
 */
export async function fetchReviewThreadsResolution(
  owner: string,
  repo: string,
  prNumber: number,
  cwd?: string
): Promise<Map<string, CommentThreadState>> {
  const map = new Map<string, CommentThreadState>();
  let after: string | null = null;

  do {
    // gh api graphql parses -f key=value; newlines in the query cause "invalid key" (gh treats the value incorrectly). Use a single-line query.
    const queryOneLine = REVIEW_THREADS_QUERY.replace(/\s+/g, " ").trim();
    const args = [
      "api",
      "graphql",
      "-f",
      `query=${queryOneLine}`,
      "-F",
      `owner=${owner}`,
      "-F",
      `name=${repo}`,
      "-F",
      `number=${prNumber}`,
    ];
    if (after) {
      args.push("-F", `after=${after}`);
    }

    const { stdout } = await runCommand("gh", args, {
      cwd,
      maxBuffer: 10 * 1024 * 1024,
    });

    const data = JSON.parse(stdout);
    const threads =
      data?.data?.repository?.pullRequest?.reviewThreads ?? null;
    if (!threads?.nodes) break;

    for (const thread of threads.nodes) {
      const state: CommentThreadState = {
        isResolved: !!thread.isResolved,
        isOutdated: !!thread.isOutdated,
        threadId: thread.id ?? undefined,
      };
      const comments = thread.comments?.nodes ?? [];
      for (const c of comments) {
        if (c?.id) map.set(c.id, state);
      }
    }

    const pageInfo = threads.pageInfo ?? {};
    after = pageInfo.hasNextPage ? pageInfo.endCursor : null;
  } while (after);

  return map;
}

/**
 * Extract node_id from our comment id. Our id format: host-gh-<node_id> (e.g. host-gh-PRRC_kwDO...).
 */
function commentNodeId(commentId: string): string | null {
  const prefix = "host-gh-";
  return commentId.startsWith(prefix) ? commentId.slice(prefix.length) : null;
}

/**
 * Apply GraphQL thread state to comments: set hostResolved and hostOutdated from the resolution map.
 * Returns a new array of comments with updated flags (does not mutate).
 */
export function applyGraphQLResolution(
  comments: ReviewComment[],
  resolutionByNodeId: Map<string, CommentThreadState>
): ReviewComment[] {
  return comments.map((c) => {
    const nodeId = commentNodeId(c.id);
    const state = nodeId ? resolutionByNodeId.get(nodeId) : undefined;
    if (!state) return c;
    return {
      ...c,
      hostResolved: state.isResolved,
      hostOutdated: state.isOutdated,
      ...(state.threadId != null ? { hostThreadId: state.threadId } : {}),
    };
  });
}

/**
 * Resolve or unresolve a PR review thread via GraphQL mutation.
 * threadId is the thread node id (e.g. PRRT_xxx).
 */
export async function setReviewThreadResolved(
  owner: string,
  repo: string,
  prNumber: number,
  threadId: string,
  resolved: boolean,
  cwd?: string
): Promise<void> {
  const mutation = resolved
    ? "mutation($threadId: ID!) { resolveReviewThread(input: { threadId: $threadId }) { thread { isResolved } } }"
    : "mutation($threadId: ID!) { unresolveReviewThread(input: { threadId: $threadId }) { thread { isResolved } } }";
  const mutationOneLine = mutation.replace(/\s+/g, " ").trim();
  const args = [
    "api",
    "graphql",
    "-f",
    `query=${mutationOneLine}`,
    "-F",
    `threadId=${threadId}`,
  ];
  await runCommand("gh", args, { cwd });
}
