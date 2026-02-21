/**
 * Global state management for PR Review
 */

import * as vscode from "vscode";
import type {
  ReviewState,
  PRInfo,
  ChangedFile,
  ReviewComment,
  CommentStatus,
} from "./types";

let state: ReviewState = {
  pr: null,
  isLocalMode: false,
  files: [],
  diff: "",
  summary: null,
  isLoading: false,
  error: null,
};

// Event emitter for state changes
const stateChangeEmitter = new vscode.EventEmitter<ReviewState>();
export const onStateChange = stateChangeEmitter.event;

/**
 * Get current state
 */
export function getState(): ReviewState {
  return state;
}

/**
 * Reset state to initial
 */
export function resetState(): void {
  state = {
    pr: null,
    isLocalMode: false,
    files: [],
    diff: "",
    summary: null,
    isLoading: false,
    error: null,
  };
  updateContextKeys();
  stateChangeEmitter.fire(state);
}

/**
 * Set the review summary
 */
export function setSummary(summary: string | null): void {
  state = { ...state, summary };
  stateChangeEmitter.fire(state);
}

/**
 * Get the review summary
 */
export function getSummary(): string | null {
  return state.summary;
}

/**
 * Set PR info
 */
export function setPRInfo(pr: PRInfo): void {
  state = { ...state, pr, isLocalMode: false, error: null };
  updateContextKeys();
  stateChangeEmitter.fire(state);
}

/**
 * Set local review mode (no GitHub PR)
 * Uses synthetic PR info for display
 */
export function setLocalMode(branch: string, baseBranch: string): void {
  state = {
    ...state,
    pr: {
      number: 0,
      owner: "",
      repo: "",
      title: "Local Review",
      headBranch: branch,
      baseBranch,
      url: "",
      host: "github",
    },
    isLocalMode: true,
    error: null,
  };
  updateContextKeys();
  stateChangeEmitter.fire(state);
}

/**
 * Set changed files
 */
export function setFiles(files: ChangedFile[]): void {
  state = { ...state, files };
  updateContextKeys();
  stateChangeEmitter.fire(state);
}

/**
 * Set diff content
 */
export function setDiff(diff: string): void {
  state = { ...state, diff };
  stateChangeEmitter.fire(state);
}

/**
 * Set loading state
 */
export function setLoading(isLoading: boolean): void {
  state = { ...state, isLoading };
  stateChangeEmitter.fire(state);
}

/**
 * Set error
 */
export function setError(error: string | null): void {
  state = { ...state, error, isLoading: false };
  stateChangeEmitter.fire(state);
}

/**
 * Add comments from AI review
 */
export function addComments(comments: ReviewComment[]): void {
  const fileMap = new Map<string, ChangedFile>();

  // Index existing files
  for (const file of state.files) {
    fileMap.set(file.path, { ...file, comments: [...file.comments] });
  }

  // Add comments to files
  for (const comment of comments) {
    let file = fileMap.get(comment.file);
    if (!file) {
      // Create file entry if it doesn't exist
      file = {
        path: comment.file,
        status: "modified",
        additions: 0,
        deletions: 0,
        comments: [],
      };
      fileMap.set(comment.file, file);
    }
    file.comments.push(comment);
  }

  state = { ...state, files: Array.from(fileMap.values()) };
  updateContextKeys();
  stateChangeEmitter.fire(state);
}

/**
 * Update a comment's status
 */
export function updateCommentStatus(
  commentId: string,
  status: CommentStatus
): void {
  state = {
    ...state,
    files: state.files.map((file) => ({
      ...file,
      comments: file.comments.map((c) =>
        c.id === commentId ? { ...c, status } : c
      ),
    })),
  };
  updateContextKeys();
  stateChangeEmitter.fire(state);
}

/**
 * Update a comment's text
 */
export function updateCommentText(commentId: string, editedText: string): void {
  state = {
    ...state,
    files: state.files.map((file) => ({
      ...file,
      comments: file.comments.map((c) =>
        c.id === commentId ? { ...c, editedText } : c
      ),
    })),
  };
  stateChangeEmitter.fire(state);
}

/**
 * Get all comments
 */
export function getAllComments(): ReviewComment[] {
  return state.files.flatMap((f) => f.comments);
}

/**
 * Filter comments that duplicate an existing comment at the same file+line.
 * A duplicate is defined as: same file path AND line number within ±1 line tolerance.
 */
export function deduplicateComments(
  incoming: ReviewComment[],
  existing: ReviewComment[]
): ReviewComment[] {
  return incoming.filter(
    (inc) =>
      !existing.some(
        (ex) => ex.file === inc.file && Math.abs(ex.line - inc.line) <= 1
      )
  );
}

/**
 * Remove all comments with source === 'ai' from state.
 * Host comments are preserved. File entries with no remaining comments are removed.
 */
export function clearAIComments(): void {
  state = {
    ...state,
    files: state.files
      .map((file) => ({
        ...file,
        comments: file.comments.filter((c) => c.source !== "ai"),
      }))
      .filter((file) => file.comments.length > 0),
  };
  updateContextKeys();
  stateChangeEmitter.fire(state);
}

/** Storage key for persisted comment statuses per PR. Format: prReview.statuses.{owner}/{repo}#{prNumber} */
export function buildStatusStorageKey(
  owner: string,
  repo: string,
  prNumber: number
): string {
  return `prReview.statuses.${owner}/${repo}#${prNumber}`;
}

/** Map of comment ID to local status for persistence in workspaceState */
export type PersistedStatuses = Record<string, CommentStatus>;

/**
 * Get approved comments
 */
export function getApprovedComments(): ReviewComment[] {
  return getAllComments().filter((c) => c.status === "approved");
}

/**
 * Get pending comments (not yet approved or rejected)
 */
export function getPendingComments(): ReviewComment[] {
  return getAllComments().filter((c) => c.status === "pending");
}

/**
 * Get rejected comments
 */
export function getRejectedComments(): ReviewComment[] {
  return getAllComments().filter((c) => c.status === "rejected");
}

/**
 * Check if all comments have been reviewed (no pending)
 */
export function allCommentsReviewed(): boolean {
  const all = getAllComments();
  return all.length > 0 && all.every((c) => c.status !== "pending");
}

/**
 * Check if all comments were rejected (user disagrees with AI)
 */
export function allCommentsRejected(): boolean {
  const all = getAllComments();
  return all.length > 0 && all.every((c) => c.status === "rejected");
}

/**
 * Get comments for a specific file
 */
export function getCommentsForFile(filePath: string): ReviewComment[] {
  const file = state.files.find((f) => f.path === filePath);
  return file?.comments || [];
}

/**
 * Get comments filtered for display (excludes host-resolved/outdated when setting is 'hide')
 */
export function getDisplayComments(): ReviewComment[] {
  const setting = vscode.workspace
    .getConfiguration("prReview")
    .get<string>("showResolvedOrOutdated", "hide");
  const all = getAllComments();
  if (setting === "hide") {
    return all.filter((c) => !c.hostResolved && !c.hostOutdated);
  }
  return all;
}

/**
 * Get display comments for a specific file
 */
export function getDisplayCommentsForFile(filePath: string): ReviewComment[] {
  const setting = vscode.workspace
    .getConfiguration("prReview")
    .get<string>("showResolvedOrOutdated", "hide");
  const comments = getCommentsForFile(filePath);
  if (setting === "hide") {
    return comments.filter((c) => !c.hostResolved && !c.hostOutdated);
  }
  return comments;
}

/**
 * Update VS Code context keys for menu visibility
 */
function updateContextKeys(): void {
  const hasReview = state.pr !== null;
  const hasFiles = state.files.length > 0;
  const allComments = getAllComments();
  const hasComments = allComments.length > 0;
  const approvedComments = getApprovedComments();
  const hasApprovedComments = approvedComments.length > 0;
  const pendingComments = getPendingComments();
  const hasPendingComments = pendingComments.length > 0;

  // Ready to submit: has approved comments AND no pending AND not local mode
  const readyToSubmit =
    hasApprovedComments && !hasPendingComments && !state.isLocalMode;

  // All rejected: user disagrees with AI, can approve PR
  const allRejected = allComments.length > 0 && allComments.every((c) => c.status === "rejected");

  vscode.commands.executeCommand("setContext", "prReview.hasReview", hasReview);
  vscode.commands.executeCommand("setContext", "prReview.hasFiles", hasFiles);
  vscode.commands.executeCommand(
    "setContext",
    "prReview.hasComments",
    hasComments
  );
  vscode.commands.executeCommand(
    "setContext",
    "prReview.hasApprovedComments",
    hasApprovedComments
  );
  vscode.commands.executeCommand(
    "setContext",
    "prReview.readyToSubmit",
    readyToSubmit
  );
  vscode.commands.executeCommand(
    "setContext",
    "prReview.allRejected",
    allRejected && !state.isLocalMode
  );
}
