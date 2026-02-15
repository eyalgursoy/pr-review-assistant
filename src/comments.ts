/**
 * VS Code Comments API integration for PR Review
 *
 * Creates native comment threads for AI review findings
 */

import * as vscode from "vscode";
import {
  onStateChange,
  updateCommentStatus,
  updateCommentText,
  getAllComments,
  getDisplayComments,
  getReplies,
} from "./state";
import { log } from "./logger";
import { sanitizeMarkdownForDisplay } from "./markdown-utils";
import type { ReviewComment, CommentStatus } from "./types";

let commentController: vscode.CommentController | undefined;
let extensionUri: vscode.Uri | undefined;
const threadMap = new Map<string, vscode.CommentThread>();

export { sanitizeMarkdownForDisplay };

/**
 * Custom Comment class for PR Review comments
 */
class PRReviewComment implements vscode.Comment {
  id: string;
  savedBody: string | vscode.MarkdownString;
  contextValue: string;

  constructor(
    public body: string | vscode.MarkdownString,
    public mode: vscode.CommentMode,
    public author: vscode.CommentAuthorInformation,
    public reviewComment: ReviewComment,
    public parent?: vscode.CommentThread
  ) {
    this.id = reviewComment.id;
    this.savedBody = body;
    this.contextValue = `prReviewComment-${reviewComment.status}`;
  }

  get label(): string | undefined {
    const statusLabels: Record<CommentStatus, string> = {
      pending: "⏳ Pending",
      approved: "✅ Approved",
      rejected: "❌ Rejected",
    };
    return statusLabels[this.reviewComment.status];
  }
}

function getReviewCommentFromArg(
  arg: vscode.CommentThread | PRReviewComment
): ReviewComment | undefined {
  if ("comments" in arg) {
    const first = arg.comments[0] as PRReviewComment | undefined;
    return first?.reviewComment;
  }
  return (arg as PRReviewComment).reviewComment;
}

/**
 * Initialize the comment controller
 */
export function initCommentController(context: vscode.ExtensionContext): void {
  extensionUri = context.extensionUri;
  // Create comment controller
  commentController = vscode.comments.createCommentController(
    "prReviewAssistant",
    "PR Review Assistant"
  );
  context.subscriptions.push(commentController);

  // Set comment controller options
  commentController.options = {
    placeHolder: "Edit this review comment...",
    prompt: "Add a note to this review comment",
  };

  // Register commands for comment actions
  registerCommentCommands(context);

  // Listen for state changes to update comments
  onStateChange(() => {
    refreshCommentThreads();
  });

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("prReview.showResolvedOrOutdatedComments")) {
        refreshCommentThreads();
      }
    })
  );

  // Initial refresh
  refreshCommentThreads();
}

/**
 * Register commands for comment thread actions.
 * Exported for testing.
 */
export function registerCommentCommands(context: vscode.ExtensionContext): void {
  // Approve comment (can receive thread or comment)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "prReview.comment.approve",
      (arg: vscode.CommentThread | PRReviewComment) => {
        const reviewComment = getReviewCommentFromArg(arg);
        if (reviewComment?.outdated || reviewComment?.resolved) {
          vscode.window.showInformationMessage(
            "This comment is outdated or resolved and cannot be changed."
          );
          return;
        }
        if (reviewComment) {
          updateCommentStatus(reviewComment.id, "approved");
          vscode.window.showInformationMessage("Comment approved ✓");
        }
      }
    )
  );

  // Reject comment (can receive thread or comment)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "prReview.comment.reject",
      (arg: vscode.CommentThread | PRReviewComment) => {
        const reviewComment = getReviewCommentFromArg(arg);
        if (reviewComment?.outdated || reviewComment?.resolved) {
          vscode.window.showInformationMessage(
            "This comment is outdated or resolved and cannot be changed."
          );
          return;
        }
        if (reviewComment) {
          updateCommentStatus(reviewComment.id, "rejected");
          vscode.window.showInformationMessage("Comment rejected ✗");
        }
      }
    )
  );

  // Edit comment
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "prReview.comment.edit",
      (comment: PRReviewComment) => {
        if (comment.reviewComment.outdated || comment.reviewComment.resolved) {
          vscode.window.showInformationMessage(
            "This comment is outdated or resolved and cannot be edited."
          );
          return;
        }
        if (!comment.parent) return;

        comment.parent.comments = comment.parent.comments.map((c) => {
          if ((c as PRReviewComment).id === comment.id) {
            c.mode = vscode.CommentMode.Editing;
          }
          return c;
        });
      }
    )
  );

  // Save edited comment
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "prReview.comment.save",
      (comment: PRReviewComment) => {
        if (comment.reviewComment.outdated || comment.reviewComment.resolved) {
          vscode.window.showInformationMessage(
            "This comment is outdated or resolved and cannot be changed."
          );
          return;
        }
        if (!comment.parent) return;

        const bodyText =
          typeof comment.body === "string" ? comment.body : comment.body.value;

        updateCommentText(comment.id, bodyText);
        comment.savedBody = comment.body;
        comment.mode = vscode.CommentMode.Preview;

        // Refresh the thread
        comment.parent.comments = [...comment.parent.comments];
      }
    )
  );

  // Cancel edit
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "prReview.comment.cancel",
      (comment: PRReviewComment) => {
        if (!comment.parent) return;

        comment.body = comment.savedBody;
        comment.mode = vscode.CommentMode.Preview;

        comment.parent.comments = [...comment.parent.comments];
      }
    )
  );

  // Delete/dismiss thread - rejects comment AND removes from inline view
  // (Reject alone keeps thread visible; Dismiss removes it from the editor)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "prReview.comment.delete",
      (thread: vscode.CommentThread) => {
        const comment = thread.comments[0] as PRReviewComment;
        if (comment) {
          updateCommentStatus(comment.id, "rejected");
        }
        thread.dispose();
      }
    )
  );

  // Approve all pending
  context.subscriptions.push(
    vscode.commands.registerCommand("prReview.comment.approveAll", () => {
      const comments = getAllComments();
      comments
        .filter((c) => c.status === "pending")
        .forEach((c) => {
          updateCommentStatus(c.id, "approved");
        });
      vscode.window.showInformationMessage("All pending comments approved");
    })
  );

  // Reject all pending
  context.subscriptions.push(
    vscode.commands.registerCommand("prReview.comment.rejectAll", () => {
      const comments = getAllComments();
      comments
        .filter((c) => c.status === "pending")
        .forEach((c) => {
          updateCommentStatus(c.id, "rejected");
        });
      vscode.window.showInformationMessage("All pending comments rejected");
    })
  );
}

/**
 * Refresh all comment threads based on current state.
 * One thread per root comment; replies are added to the root's thread as additional comments.
 */
function refreshCommentThreads(): void {
  if (!commentController) {
    log("Comment controller not initialized");
    return;
  }

  const displayComments = getDisplayComments();
  const roots = displayComments.filter((c) => !c.parentId);

  log(`Refreshing comment threads: ${roots.length} root threads`);

  const updatedThreadIds = new Set<string>();

  for (const root of roots) {
    const threadId = root.id;
    updatedThreadIds.add(threadId);

    let thread = threadMap.get(threadId);

    // Sync UI resolve back to extension state: if user marked thread Resolved in the editor
    // but our comment is still pending, update status so the resolve persists and sidebar reflects it.
    if (
      thread &&
      thread.state === vscode.CommentThreadState.Resolved &&
      root.status === "pending"
    ) {
      updateCommentStatus(root.id, "approved");
      return; // state change will trigger refresh again with updated status
    }

    if (!thread) {
      const uri = getFileUri(root.file);
      const line = Math.max(0, root.line - 1);
      const range = new vscode.Range(line, 0, line, 0);

      log(
        `Creating comment thread: file=${root.file}, uri=${uri.toString()}, line=${root.line}, side=${root.side}`
      );

      thread = commentController.createCommentThread(uri, range, []);
      thread.canReply = false;
      threadMap.set(threadId, thread);
    }

    const outdated = root.outdated || root.resolved;
    const struck =
      outdated || root.status === "approved" || root.status === "rejected";
    thread.label =
      getSeverityLabel(root.severity) + (outdated ? " (Outdated)" : "");
    thread.state = getThreadState(root.status);
    thread.contextValue = outdated
      ? "prReviewThread-outdated"
      : `prReviewThread-${root.status}`;
    thread.collapsibleState =
      root.status === "pending"
        ? vscode.CommentThreadCollapsibleState.Expanded
        : vscode.CommentThreadCollapsibleState.Collapsed;

    const replies = getReplies(root.id);
    const threadComments: vscode.Comment[] = [
      new PRReviewComment(
        formatCommentBody(root, struck),
        vscode.CommentMode.Preview,
        getAuthorInfo(root),
        root,
        thread
      ),
      ...replies.map((reply) => {
        const replyStruck =
          reply.outdated ||
          reply.resolved ||
          reply.status === "approved" ||
          reply.status === "rejected";
        return new PRReviewComment(
          formatCommentBody(reply, replyStruck),
          vscode.CommentMode.Preview,
          getAuthorInfo(reply),
          reply,
          thread
        );
      }),
    ];
    thread.comments = threadComments;
  }

  for (const [threadId, thread] of threadMap) {
    if (!updatedThreadIds.has(threadId)) {
      thread.dispose();
      threadMap.delete(threadId);
    }
  }
}

/**
 * Get file URI from relative path
 */
function getFileUri(filePath: string): vscode.Uri {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (workspaceFolder) {
    return vscode.Uri.joinPath(workspaceFolder.uri, filePath);
  }
  return vscode.Uri.file(filePath);
}

/**
 * Format comment body as markdown (sanitized for safe display).
 * When the user has edited the comment (editedText), show that as the primary body; otherwise show issue/suggestion/codeSnippet.
 * When struck is true (outdated/resolved), wrap in strikethrough.
 */
function formatCommentBody(
  comment: ReviewComment,
  struck?: boolean
): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.isTrusted = false;
  md.supportHtml = false;

  if (comment.editedText?.trim()) {
    const body = sanitizeMarkdownForDisplay(comment.editedText);
    md.appendMarkdown(struck ? `~~${body}~~` : body);
    return md;
  }

  const safeIssue = sanitizeMarkdownForDisplay(comment.issue);
  const safeSuggestion = comment.suggestion
    ? sanitizeMarkdownForDisplay(comment.suggestion)
    : "";
  const safeCodeSnippet = comment.codeSnippet
    ? sanitizeMarkdownForDisplay(comment.codeSnippet)
    : "";

  if (struck) {
    md.appendMarkdown(`~~**Issue:** ${safeIssue}~~`);
    if (safeSuggestion) md.appendMarkdown(`\n\n~~**Suggestion:** ${safeSuggestion}~~`);
    if (safeCodeSnippet)
      md.appendMarkdown(`\n\n~~**Suggested fix:**~~\n\`\`\`\n${safeCodeSnippet}\n\`\`\``);
  } else {
    md.appendMarkdown(`**Issue:** ${safeIssue}\n\n`);
    if (safeSuggestion) {
      md.appendMarkdown(`**Suggestion:** ${safeSuggestion}\n\n`);
    }
    if (safeCodeSnippet) {
      md.appendMarkdown(`**Suggested fix:**\n\`\`\`\n${safeCodeSnippet}\n\`\`\`\n`);
    }
  }

  return md;
}

/**
 * Get severity label with emoji
 */
function getSeverityLabel(severity: string): string {
  const labels: Record<string, string> = {
    critical: "🔴 Critical",
    high: "🟠 High",
    medium: "🟡 Medium",
    low: "🟢 Low",
  };
  return labels[severity] || severity;
}

/**
 * Get author info: uses authorName when present (e.g. host comment), otherwise AI Review (severity).
 */
function getAuthorInfo(comment: ReviewComment): vscode.CommentAuthorInformation {
  const name = comment.authorName
    ? comment.authorName
    : `AI Review (${comment.severity})`;
  const result: vscode.CommentAuthorInformation = { name };
  if (!comment.authorName && extensionUri) {
    result.iconPath = vscode.Uri.joinPath(extensionUri, "resources", "sparkle.svg");
  }
  return result;
}

/**
 * Get thread state based on comment status
 */
function getThreadState(status: CommentStatus): vscode.CommentThreadState {
  switch (status) {
    case "approved":
    case "rejected":
      return vscode.CommentThreadState.Resolved;
    default:
      return vscode.CommentThreadState.Unresolved;
  }
}

/**
 * Dispose all comment threads
 */
export function disposeCommentThreads(): void {
  for (const thread of threadMap.values()) {
    thread.dispose();
  }
  threadMap.clear();
}
