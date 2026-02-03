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
  state = { ...state, pr, error: null };
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
 * Get comments for a specific file
 */
export function getCommentsForFile(filePath: string): ReviewComment[] {
  const file = state.files.find((f) => f.path === filePath);
  return file?.comments || [];
}

/**
 * Update VS Code context keys for menu visibility
 */
function updateContextKeys(): void {
  const hasReview = state.pr !== null;
  const hasFiles = state.files.length > 0;
  const hasComments = getAllComments().length > 0;
  const hasApprovedComments = getApprovedComments().length > 0;

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
}
