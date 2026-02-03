/**
 * VS Code Comments API integration for PR Review
 *
 * Creates native comment threads for AI review findings
 */

import * as vscode from "vscode";
import {
  getState,
  onStateChange,
  updateCommentStatus,
  updateCommentText,
  getAllComments,
} from "./state";
import { log } from "./logger";
import type { ReviewComment, CommentStatus } from "./types";

let commentController: vscode.CommentController | undefined;
const threadMap = new Map<string, vscode.CommentThread>();

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

/**
 * Initialize the comment controller
 */
export function initCommentController(context: vscode.ExtensionContext): void {
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

  // Initial refresh
  refreshCommentThreads();
}

/**
 * Register commands for comment thread actions
 */
function registerCommentCommands(context: vscode.ExtensionContext): void {
  // Approve comment (can receive thread or comment)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "prReview.comment.approve",
      (arg: vscode.CommentThread | PRReviewComment) => {
        let commentId: string | undefined;

        if ("comments" in arg) {
          // It's a thread
          const comment = arg.comments[0] as PRReviewComment;
          commentId = comment?.id;
        } else {
          // It's a comment
          commentId = arg.id;
        }

        if (commentId) {
          updateCommentStatus(commentId, "approved");
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
        let commentId: string | undefined;

        if ("comments" in arg) {
          // It's a thread
          const comment = arg.comments[0] as PRReviewComment;
          commentId = comment?.id;
        } else {
          // It's a comment
          commentId = arg.id;
        }

        if (commentId) {
          updateCommentStatus(commentId, "rejected");
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

  // Delete/dismiss thread
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "prReview.comment.delete",
      (thread: vscode.CommentThread) => {
        // Get the comment ID from the thread
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
 * Refresh all comment threads based on current state
 */
function refreshCommentThreads(): void {
  if (!commentController) {
    log("Comment controller not initialized");
    return;
  }

  const state = getState();
  const allComments = getAllComments();

  log(`Refreshing comment threads: ${allComments.length} comments`);

  // Track which threads we've updated
  const updatedThreadIds = new Set<string>();

  for (const comment of allComments) {
    const threadId = comment.id;
    updatedThreadIds.add(threadId);

    // Get or create thread
    let thread = threadMap.get(threadId);

    if (!thread) {
      // Create new thread
      const uri = getFileUri(comment.file);
      const line = Math.max(0, comment.line - 1);
      const range = new vscode.Range(line, 0, line, 0);

      log(
        `Creating comment thread: file=${
          comment.file
        }, uri=${uri.toString()}, line=${comment.line}, side=${comment.side}`
      );

      thread = commentController.createCommentThread(uri, range, []);
      thread.canReply = false;
      thread.label = getSeverityLabel(comment.severity);
      threadMap.set(threadId, thread);
    }

    // Update thread state based on comment status
    thread.state = getThreadState(comment.status);
    thread.contextValue = `prReviewThread-${comment.status}`;
    thread.collapsibleState =
      comment.status === "pending"
        ? vscode.CommentThreadCollapsibleState.Expanded
        : vscode.CommentThreadCollapsibleState.Collapsed;

    // Create/update the comment in the thread
    const prComment = new PRReviewComment(
      formatCommentBody(comment),
      vscode.CommentMode.Preview,
      getAuthorInfo(comment.severity),
      comment,
      thread
    );

    thread.comments = [prComment];
  }

  // Remove threads that no longer exist
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
 * Format comment body as markdown
 */
function formatCommentBody(comment: ReviewComment): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.isTrusted = true;
  md.supportHtml = true;

  // Issue description
  md.appendMarkdown(`**Issue:** ${comment.issue}\n\n`);

  // Suggestion if available
  if (comment.suggestion) {
    md.appendMarkdown(`**Suggestion:** ${comment.suggestion}\n\n`);
  }

  // Code snippet if available
  if (comment.codeSnippet) {
    md.appendMarkdown(
      `**Suggested fix:**\n\`\`\`\n${comment.codeSnippet}\n\`\`\`\n`
    );
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
 * Get author info based on severity (for visual distinction)
 */
function getAuthorInfo(severity: string): vscode.CommentAuthorInformation {
  return {
    name: `AI Review (${severity})`,
    iconPath: vscode.Uri.parse(
      "https://raw.githubusercontent.com/microsoft/vscode-icons/main/icons/light/sparkle.svg"
    ),
  };
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
