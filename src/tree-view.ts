/**
 * TreeView provider for the SCM sidebar panel
 */

import * as vscode from "vscode";
import * as path from "path";
import {
  getState,
  onStateChange,
  getAllComments,
  getApprovedComments,
} from "./state";
import type {
  ReviewState,
  ChangedFile,
  ReviewComment,
  CommentStatus,
} from "./types";

type TreeItemType =
  | "pr-info"
  | "section"
  | "file"
  | "comment"
  | "action"
  | "status";

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
        item.description = `Line ${comment.line}`;
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
        item.iconPath = new vscode.ThemeIcon("play");
        item.collapsibleState = vscode.TreeItemCollapsibleState.None;
        item.command = {
          command: element.actionCommand!,
          title: element.label,
        };
        break;

      case "status":
        item.iconPath = new vscode.ThemeIcon("info");
        item.collapsibleState = vscode.TreeItemCollapsibleState.None;
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

    // Loading state
    if (state.isLoading) {
      items.push({
        type: "status",
        label: "Loading...",
      });
      return items;
    }

    // Error state
    if (state.error) {
      items.push({
        type: "status",
        label: `Error: ${state.error}`,
      });
      return items;
    }

    // No PR loaded - show welcome
    if (!state.pr) {
      return []; // Will show viewsWelcome content
    }

    // PR Info
    items.push({
      type: "pr-info",
      label: `PR #${state.pr.number}`,
      description: state.pr.title,
    });

    items.push({
      type: "pr-info",
      label: `${state.pr.headBranch} → ${state.pr.baseBranch}`,
      description: `${state.pr.owner}/${state.pr.repo}`,
    });

    // Changed Files section
    if (state.files.length > 0) {
      items.push({
        type: "section",
        label: "Changed Files",
        description: `${state.files.length} files`,
      });
    }

    // Review Summary section (if there are comments)
    const allComments = getAllComments();
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

    return items;
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
    md.appendMarkdown(
      `**${comment.severity.toUpperCase()}**: ${comment.issue}\n\n`
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
