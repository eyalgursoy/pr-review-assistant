/**
 * TreeView provider for the SCM sidebar panel
 */

import * as vscode from "vscode";
import * as path from "path";
import {
  getState,
  onStateChange,
  getAllComments,
  allCommentsRejected,
} from "./state";
import {
  getProgress,
  onProgressChange,
  formatElapsedTime,
  formatCost,
  formatTokens,
  type StreamingProgress,
} from "./streaming-progress";
import type {
  ReviewState,
  ChangedFile,
  ReviewComment,
  CommentStatus,
} from "./types";
import { getAIProvider, getSelectedCursorModel } from "./ai-providers";

type TreeItemType =
  | "pr-info"
  | "section"
  | "file"
  | "comment"
  | "action"
  | "status"
  | "progress"
  | "progress-detail"
  | "progress-stats"
  | "model-info";

interface TreeItemData {
  type: TreeItemType;
  label: string;
  description?: string;
  file?: ChangedFile;
  comment?: ReviewComment;
  actionCommand?: string;
}

export class PRReviewTreeProvider
  implements vscode.TreeDataProvider<TreeItemData>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    TreeItemData | undefined
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor() {
    // Listen for state changes
    onStateChange(() => {
      this.refresh();
    });

    // Listen for progress changes
    onProgressChange(() => {
      this.refresh();
    });

    // Refresh when Cursor CLI model or AI provider changes (so model-info item updates)
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration("prReview.cursorCliModel") ||
        e.affectsConfiguration("prReview.aiProviderCursorModel") ||
        e.affectsConfiguration("prReview.aiProvider")
      ) {
        this.refresh();
      }
    });
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: TreeItemData): vscode.TreeItem {
    const item = new vscode.TreeItem(element.label);

    switch (element.type) {
      case "pr-info":
        item.iconPath = new vscode.ThemeIcon("git-pull-request");
        item.description = element.description;
        item.collapsibleState = vscode.TreeItemCollapsibleState.None;
        item.contextValue = "pr-info";
        break;

      case "section":
        item.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
        item.contextValue = "section";
        break;

      case "file":
        item.iconPath = this.getFileIcon(element.file!);
        item.description = element.description;
        item.collapsibleState =
          element.file!.comments.length > 0
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.None;
        item.contextValue = "file";
        item.command = {
          command: "vscode.open",
          title: "Open File",
          arguments: [this.getFileUri(element.file!.path)],
        };
        break;

      case "comment":
        const comment = element.comment!;
        item.iconPath = this.getCommentIcon(comment);
        // Show line number and side (LEFT for deleted, RIGHT for added)
        const sideIndicator = comment.side === "LEFT" ? "−" : "+";
        item.description = `Line ${comment.line} (${sideIndicator})`;
        item.collapsibleState = vscode.TreeItemCollapsibleState.None;
        item.contextValue = `comment-${comment.status}`;
        item.tooltip = this.getCommentTooltip(comment);
        item.command = {
          command: "prReview.goToComment",
          title: "Go to Comment",
          arguments: [comment],
        };
        break;

      case "action":
        // Use appropriate icon per action
        const isSubmit = element.actionCommand === "prReview.submitReview";
        const isApprove = element.actionCommand === "prReview.approvePR";
        const iconName = isSubmit ? "cloud-upload" : isApprove ? "check-all" : "play";
        const iconColor = isSubmit || isApprove ? new vscode.ThemeColor("charts.green") : undefined;
        item.iconPath = new vscode.ThemeIcon(iconName, iconColor);
        item.collapsibleState = vscode.TreeItemCollapsibleState.None;
        item.contextValue = "action";
        item.command = {
          command: element.actionCommand!,
          title: element.label,
        };
        break;

      case "status":
        item.iconPath = new vscode.ThemeIcon("info");
        item.collapsibleState = vscode.TreeItemCollapsibleState.None;
        break;

      case "progress":
        item.iconPath = new vscode.ThemeIcon(
          "sync~spin",
          new vscode.ThemeColor("charts.blue")
        );
        item.description = element.description;
        item.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
        item.contextValue = "progress";
        break;

      case "progress-detail":
        item.iconPath = new vscode.ThemeIcon("chevron-right");
        item.description = element.description;
        item.collapsibleState = vscode.TreeItemCollapsibleState.None;
        break;

      case "progress-stats":
        item.iconPath = new vscode.ThemeIcon("dashboard");
        item.description = element.description;
        item.collapsibleState = vscode.TreeItemCollapsibleState.None;
        break;

      case "model-info":
        item.iconPath = new vscode.ThemeIcon("hubot");
        item.description = element.description;
        item.collapsibleState = vscode.TreeItemCollapsibleState.None;
        item.contextValue = "model-info";
        break;
    }

    return item;
  }

  getChildren(element?: TreeItemData): TreeItemData[] {
    const state = getState();

    // Root level
    if (!element) {
      return this.getRootItems(state);
    }

    // Progress items don't have children (they're flat)
    if (
      element.type === "progress" ||
      element.type === "progress-detail" ||
      element.type === "progress-stats"
    ) {
      return [];
    }

    // Section children
    if (element.type === "section") {
      if (element.label === "Changed Files") {
        return this.getFileItems(state);
      }
      if (element.label === "Review Summary") {
        return this.getSummaryItems(state);
      }
    }

    // File children (comments)
    if (element.type === "file" && element.file) {
      return element.file.comments.map((comment) => ({
        type: "comment" as TreeItemType,
        label: this.truncate(comment.issue, 50),
        comment,
      }));
    }

    return [];
  }

  private getRootItems(state: ReviewState): TreeItemData[] {
    const items: TreeItemData[] = [];
    const progress = getProgress();

    // Show progress during AI review
    if (
      state.isLoading &&
      progress.stage !== "idle" &&
      progress.stage !== "complete"
    ) {
      items.push(...this.getProgressItems(progress));
      return items;
    }

    // Error state
    if (state.error || progress.stage === "error") {
      items.push({
        type: "status",
        label: `Error: ${state.error || progress.details || "Unknown error"}`,
      });
      return items;
    }

    // No PR loaded - show welcome
    if (!state.pr) {
      return []; // Will show viewsWelcome content
    }

    // PR Info or Local Review
    if (state.isLocalMode) {
      items.push({
        type: "pr-info",
        label: "Local Review",
        description: state.pr!.title,
      });
    } else {
      items.push({
        type: "pr-info",
        label: `PR #${state.pr!.number}`,
        description: state.pr!.title,
      });
    }

    items.push({
      type: "pr-info",
      label: `${state.pr!.headBranch} → ${state.pr!.baseBranch}`,
      description: state.isLocalMode ? "Local diff" : `${state.pr!.owner}/${state.pr!.repo}`,
    });

    // Cursor CLI model (only when provider is cursor-cli)
    if (getAIProvider() === "cursor-cli") {
      const model = getSelectedCursorModel() || "Auto";
      items.push({
        type: "model-info",
        label: `Model: ${model}`,
        description: "Cursor CLI",
      });
    }

    // No comments found message (review complete, files changed, no issues)
    const allComments = getAllComments();
    if (
      !state.isLoading &&
      state.files.length > 0 &&
      allComments.length === 0 &&
      state.summary !== null // Only show after review has actually completed
    ) {
      items.push({
        type: "status",
        label: "No issues found! Your code looks great.",
        description: "✓",
      });
    }

    // Changed Files section
    if (state.files.length > 0) {
      items.push({
        type: "section",
        label: "Changed Files",
        description: `${state.files.length} files`,
      });
    }

    // Review Summary section (if there are comments)
    if (allComments.length > 0) {
      items.push({
        type: "section",
        label: "Review Summary",
        description: `${allComments.length} comments`,
      });
    }

    return items;
  }

  private getFileItems(state: ReviewState): TreeItemData[] {
    return state.files.map((file) => ({
      type: "file" as TreeItemType,
      label: path.basename(file.path),
      description:
        file.comments.length > 0
          ? `${file.comments.length} comments`
          : `+${file.additions} -${file.deletions}`,
      file,
    }));
  }

  private getSummaryItems(state: ReviewState): TreeItemData[] {
    const allComments = getAllComments();
    const approved = allComments.filter((c) => c.status === "approved").length;
    const rejected = allComments.filter((c) => c.status === "rejected").length;
    const pending = allComments.filter((c) => c.status === "pending").length;

    const items: TreeItemData[] = [];

    if (pending > 0) {
      items.push({
        type: "status",
        label: `${pending} pending`,
        description: "awaiting review",
      });
    }

    if (approved > 0) {
      items.push({
        type: "status",
        label: `${approved} approved`,
        description: "ready to submit",
      });
    }

    if (rejected > 0) {
      items.push({
        type: "status",
        label: `${rejected} rejected`,
        description: "will not submit",
      });
    }

    // Show prominent submit action when all comments are reviewed (PR mode only)
    if (pending === 0 && approved > 0 && !state.isLocalMode) {
      items.push({
        type: "action",
        label: "━━━ Submit PR Review ━━━",
        description: `${approved} comment(s) ready`,
        actionCommand: "prReview.submitReview",
      });
    }

    // Show approve PR when all comments rejected (PR mode only)
    if (allCommentsRejected() && !state.isLocalMode) {
      items.push({
        type: "action",
        label: "All comments rejected - Approve PR?",
        description: "LGTM",
        actionCommand: "prReview.approvePR",
      });
    }

    return items;
  }

  private getProgressItems(progress: StreamingProgress): TreeItemData[] {
    const items: TreeItemData[] = [];

    const stageLabels: Record<string, string> = {
      "fetching-pr": "Fetching PR Info",
      "loading-diff": "Loading Diff",
      "preparing-prompt": "Preparing Prompt",
      "ai-analyzing": "AI Analyzing",
      "ai-streaming": "AI Reviewing",
      "parsing-response": "Processing Results",
      complete: "Complete",
      error: "Error",
    };

    items.push({
      type: "progress",
      label: stageLabels[progress.stage] || progress.stage,
      description: progress.message,
    });

    // Show current file being analyzed
    if (progress.currentFile) {
      items.push({
        type: "progress-detail",
        label: `📄 ${this.getFileName(progress.currentFile)}`,
        description: "analyzing...",
      });
    }

    // Show files already analyzed
    if (progress.filesAnalyzed.length > 0 && !progress.currentFile) {
      const lastFile =
        progress.filesAnalyzed[progress.filesAnalyzed.length - 1];
      items.push({
        type: "progress-detail",
        label: `📄 ${this.getFileName(lastFile)}`,
        description: `${progress.filesAnalyzed.length} file(s) reviewed`,
      });
    }

    // Show stats during streaming
    if (
      progress.stage === "ai-streaming" ||
      progress.stage === "ai-analyzing"
    ) {
      const statsLine = this.buildStatsLine(progress);
      if (statsLine) {
        items.push({
          type: "progress-stats",
          label: statsLine,
        });
      }
    }

    return items;
  }

  private buildStatsLine(progress: StreamingProgress): string {
    const parts: string[] = [];

    if (progress.tokensReceived > 0) {
      parts.push(`${formatTokens(progress.tokensReceived)} tokens`);
    }

    if (progress.estimatedCost > 0) {
      parts.push(formatCost(progress.estimatedCost));
    }

    if (progress.elapsedMs > 0) {
      parts.push(formatElapsedTime(progress.elapsedMs));
    }

    return parts.join(" | ");
  }

  private getFileName(filePath: string): string {
    const parts = filePath.split("/");
    return parts[parts.length - 1];
  }

  private getFileIcon(file: ChangedFile): vscode.ThemeIcon {
    switch (file.status) {
      case "added":
        return new vscode.ThemeIcon(
          "diff-added",
          new vscode.ThemeColor("gitDecoration.addedResourceForeground")
        );
      case "deleted":
        return new vscode.ThemeIcon(
          "diff-removed",
          new vscode.ThemeColor("gitDecoration.deletedResourceForeground")
        );
      case "renamed":
        return new vscode.ThemeIcon(
          "diff-renamed",
          new vscode.ThemeColor("gitDecoration.renamedResourceForeground")
        );
      default:
        return new vscode.ThemeIcon(
          "diff-modified",
          new vscode.ThemeColor("gitDecoration.modifiedResourceForeground")
        );
    }
  }

  private getCommentIcon(comment: ReviewComment): vscode.ThemeIcon {
    const severityColors: Record<string, string> = {
      critical: "errorForeground",
      high: "editorWarning.foreground",
      medium: "editorInfo.foreground",
      low: "textLink.foreground",
    };

    const statusIcons: Record<CommentStatus, string> = {
      pending: "circle-outline",
      approved: "check",
      rejected: "x",
    };

    return new vscode.ThemeIcon(
      statusIcons[comment.status],
      new vscode.ThemeColor(severityColors[comment.severity] || "foreground")
    );
  }

  private getCommentTooltip(comment: ReviewComment): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    const sideLabel =
      comment.side === "LEFT" ? "deleted line" : "added/context line";
    md.appendMarkdown(
      `**${comment.severity.toUpperCase()}** (${sideLabel}): ${
        comment.issue
      }\n\n`
    );
    if (comment.suggestion) {
      md.appendMarkdown(`**Suggestion:** ${comment.suggestion}\n\n`);
    }
    md.appendMarkdown(`*Status: ${comment.status}*`);
    return md;
  }

  private getFileUri(filePath: string): vscode.Uri {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      return vscode.Uri.joinPath(workspaceFolder.uri, filePath);
    }
    return vscode.Uri.file(filePath);
  }

  private truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.slice(0, maxLength - 3) + "...";
  }
}
