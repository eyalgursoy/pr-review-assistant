/**
 * CodeLens provider for inline review comments (simplified)
 *
 * Now that we use the Comments API for the main UI, CodeLens just shows
 * a brief indicator that can be clicked to expand the comment thread.
 */

import * as vscode from "vscode";
import { getDisplayCommentsForFile, onStateChange } from "./state";
import { sanitizeMarkdownForDisplay } from "./markdown-utils";

export class ReviewCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  constructor(context: vscode.ExtensionContext) {
    context.subscriptions.push(
      onStateChange(() => {
        this._onDidChangeCodeLenses.fire();
      })
    );
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("prReview.showResolvedOrOutdatedComments")) {
          this._onDidChangeCodeLenses.fire();
        }
      })
    );
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const filePath = this.getRelativePath(document.uri);
    const comments = getDisplayCommentsForFile(filePath);

    if (comments.length === 0) {
      return [];
    }

    const codeLenses: vscode.CodeLens[] = [];

    for (const comment of comments) {
      const line = Math.min(
        Math.max(0, comment.line - 1),
        document.lineCount - 1
      );
      const range = new vscode.Range(line, 0, line, 0);

      const severityEmoji = this.getSeverityEmoji(comment.severity);
      const statusIcon = this.getStatusIcon(comment.status);
      const newBadge = comment.source === "ai" ? "🆕 " : "";
      const shortIssue = this.truncate(comment.issue, 80);

      codeLenses.push(
        new vscode.CodeLens(range, {
          title: `${newBadge}${statusIcon} ${severityEmoji} ${shortIssue}`,
          command: "prReview.goToComment",
          arguments: [comment],
          tooltip: `Click to view comment details\n\n${comment.issue}`,
        })
      );
    }

    return codeLenses;
  }

  private getRelativePath(uri: vscode.Uri): string {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (workspaceFolder) {
      return vscode.workspace.asRelativePath(uri, false);
    }
    return uri.fsPath;
  }

  private getSeverityEmoji(severity: string): string {
    const emojis: Record<string, string> = {
      critical: "🔴",
      high: "🟠",
      medium: "🟡",
      low: "🟢",
    };
    return emojis[severity] || "⚪";
  }

  private getStatusIcon(status: string): string {
    const icons: Record<string, string> = {
      pending: "○",
      approved: "✓",
      rejected: "✗",
    };
    return icons[status] || "○";
  }

  private truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.slice(0, maxLength - 3) + "...";
  }
}

/**
 * Decoration provider for highlighting lines with comments
 */
export function createCommentDecorations(): {
  pendingDecoration: vscode.TextEditorDecorationType;
  approvedDecoration: vscode.TextEditorDecorationType;
  rejectedDecoration: vscode.TextEditorDecorationType;
} {
  const pendingDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: "rgba(255, 193, 7, 0.1)",
    isWholeLine: true,
    overviewRulerColor: "rgba(255, 193, 7, 0.8)",
    overviewRulerLane: vscode.OverviewRulerLane.Left,
  });

  const approvedDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: "rgba(76, 175, 80, 0.1)",
    isWholeLine: true,
    overviewRulerColor: "rgba(76, 175, 80, 0.8)",
    overviewRulerLane: vscode.OverviewRulerLane.Left,
  });

  const rejectedDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: "rgba(244, 67, 54, 0.05)",
    isWholeLine: true,
    overviewRulerColor: "rgba(244, 67, 54, 0.5)",
    overviewRulerLane: vscode.OverviewRulerLane.Left,
  });

  return { pendingDecoration, approvedDecoration, rejectedDecoration };
}

/**
 * Update decorations for an editor
 */
export function updateDecorations(
  editor: vscode.TextEditor,
  decorations: ReturnType<typeof createCommentDecorations>
): void {
  const filePath = vscode.workspace.asRelativePath(editor.document.uri, false);
  const comments = getDisplayCommentsForFile(filePath);

  const pending: vscode.DecorationOptions[] = [];
  const approved: vscode.DecorationOptions[] = [];
  const rejected: vscode.DecorationOptions[] = [];

  for (const comment of comments) {
    const line = Math.min(
      Math.max(0, comment.line - 1),
      editor.document.lineCount - 1
    );
    const range = new vscode.Range(
      line,
      0,
      line,
      editor.document.lineAt(line).text.length
    );

    const safeIssue = sanitizeMarkdownForDisplay(comment.issue);
    const safeSuggestion = comment.suggestion
      ? sanitizeMarkdownForDisplay(comment.suggestion)
      : "";
    const decoration: vscode.DecorationOptions = {
      range,
      hoverMessage: new vscode.MarkdownString(
        `**${comment.severity.toUpperCase()}**: ${safeIssue}${
          safeSuggestion ? `\n\n*Suggestion:* ${safeSuggestion}` : ""
        }`
      ),
    };

    switch (comment.status) {
      case "pending":
        pending.push(decoration);
        break;
      case "approved":
        approved.push(decoration);
        break;
      case "rejected":
        rejected.push(decoration);
        break;
    }
  }

  editor.setDecorations(decorations.pendingDecoration, pending);
  editor.setDecorations(decorations.approvedDecoration, approved);
  editor.setDecorations(decorations.rejectedDecoration, rejected);
}
