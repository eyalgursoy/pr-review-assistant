/**
 * PR Review Assistant - Main Extension Entry Point
 *
 * Provides AI-powered PR code review in the Source Control sidebar
 */

import * as vscode from "vscode";
import { PRReviewTreeProvider } from "./tree-view";
import {
  ReviewCodeLensProvider,
  createCommentDecorations,
  updateDecorations,
} from "./codelens";
import {
  getState,
  resetState,
  setPRInfo,
  setFiles,
  setDiff,
  setLoading,
  setError,
  addComments,
  updateCommentStatus,
  updateCommentText,
  getApprovedComments,
  onStateChange,
} from "./state";
import {
  parsePRUrl,
  checkGhCli,
  fetchPRInfo,
  fetchChangedFiles,
  fetchPRDiff,
  submitReviewComments,
} from "./github";
import { runAIReview, getAIProvider } from "./ai-providers";
import { buildReviewPrompt } from "./review-template";
import type { ReviewComment } from "./types";

let treeProvider: PRReviewTreeProvider;
let decorations: ReturnType<typeof createCommentDecorations>;

export function activate(context: vscode.ExtensionContext) {
  console.log("PR Review Assistant activated");

  // Create tree view provider
  treeProvider = new PRReviewTreeProvider();
  const treeView = vscode.window.createTreeView("prReviewAssistant", {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  // Create CodeLens provider
  const codeLensProvider = new ReviewCodeLensProvider();
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { scheme: "file" },
      codeLensProvider
    )
  );

  // Create decorations
  decorations = createCommentDecorations();
  context.subscriptions.push(
    decorations.pendingDecoration,
    decorations.approvedDecoration,
    decorations.rejectedDecoration
  );

  // Update decorations when editor changes
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        updateDecorations(editor, decorations);
      }
    })
  );

  // Update decorations when state changes
  onStateChange(() => {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      updateDecorations(editor, decorations);
    }
  });

  // Register commands
  registerCommands(context);
}

function registerCommands(context: vscode.ExtensionContext) {
  // Start Review - prompt for PR URL
  context.subscriptions.push(
    vscode.commands.registerCommand("prReview.startReview", async () => {
      await startReview();
    })
  );

  // Enter PR URL
  context.subscriptions.push(
    vscode.commands.registerCommand("prReview.enterPrUrl", async () => {
      await startReview();
    })
  );

  // Run AI Review
  context.subscriptions.push(
    vscode.commands.registerCommand("prReview.runAiReview", async () => {
      await runReview();
    })
  );

  // Submit Review to GitHub
  context.subscriptions.push(
    vscode.commands.registerCommand("prReview.submitReview", async () => {
      await submitReview();
    })
  );

  // Clear Review
  context.subscriptions.push(
    vscode.commands.registerCommand("prReview.clearReview", () => {
      resetState();
      vscode.window.showInformationMessage("Review cleared");
    })
  );

  // Approve Comment
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "prReview.approveComment",
      (commentId: string) => {
        updateCommentStatus(commentId, "approved");
      }
    )
  );

  // Reject Comment
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "prReview.rejectComment",
      (commentId: string) => {
        updateCommentStatus(commentId, "rejected");
      }
    )
  );

  // Edit Comment
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "prReview.editComment",
      async (commentId: string) => {
        await editComment(commentId);
      }
    )
  );

  // Go to Comment (from tree view)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "prReview.goToComment",
      async (comment: ReviewComment) => {
        await goToComment(comment);
      }
    )
  );

  // Show Comment Details
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "prReview.showCommentDetails",
      (comment: ReviewComment) => {
        showCommentDetails(comment);
      }
    )
  );

  // Show Suggestion
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "prReview.showSuggestion",
      (comment: ReviewComment) => {
        if (comment.suggestion) {
          vscode.window.showInformationMessage(comment.suggestion, {
            modal: false,
          });
        }
      }
    )
  );

  // Refresh Files
  context.subscriptions.push(
    vscode.commands.registerCommand("prReview.refreshFiles", async () => {
      const state = getState();
      if (state.pr) {
        await loadPRFiles(state.pr.owner, state.pr.repo, state.pr.number);
      }
    })
  );
}

/**
 * Start a new review - prompt for PR URL
 */
async function startReview() {
  // Check gh CLI first
  const ghStatus = await checkGhCli();
  if (!ghStatus.available) {
    const install = await vscode.window.showErrorMessage(
      ghStatus.error || "GitHub CLI not available",
      "Install GitHub CLI"
    );
    if (install) {
      vscode.env.openExternal(vscode.Uri.parse("https://cli.github.com/"));
    }
    return;
  }
  if (!ghStatus.authenticated) {
    vscode.window.showErrorMessage(
      ghStatus.error || "GitHub CLI not authenticated"
    );
    return;
  }

  // Prompt for PR URL
  const prUrl = await vscode.window.showInputBox({
    prompt: "Enter GitHub PR URL",
    placeHolder: "https://github.com/owner/repo/pull/123",
    validateInput: (value) => {
      if (!value) return "PR URL is required";
      if (!parsePRUrl(value)) return "Invalid PR URL format";
      return null;
    },
  });

  if (!prUrl) return;

  const parsed = parsePRUrl(prUrl);
  if (!parsed) {
    vscode.window.showErrorMessage("Invalid PR URL");
    return;
  }

  // Reset and load new PR
  resetState();
  setLoading(true);

  try {
    // Fetch PR info
    const prInfo = await fetchPRInfo(parsed.owner, parsed.repo, parsed.number);
    setPRInfo(prInfo);

    // Fetch changed files
    await loadPRFiles(parsed.owner, parsed.repo, parsed.number);

    // Fetch diff
    const diff = await fetchPRDiff(parsed.owner, parsed.repo, parsed.number);
    setDiff(diff);

    setLoading(false);

    // Auto-run AI if configured
    const config = vscode.workspace.getConfiguration("prReview");
    if (config.get<boolean>("autoRunAi")) {
      await runReview();
    } else {
      // Prompt to run AI review
      const runAi = await vscode.window.showInformationMessage(
        `Loaded PR #${prInfo.number}: ${prInfo.title}`,
        "Run AI Review"
      );
      if (runAi) {
        await runReview();
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    setError(msg);
    vscode.window.showErrorMessage(`Failed to load PR: ${msg}`);
  }
}

/**
 * Load PR files
 */
async function loadPRFiles(owner: string, repo: string, prNumber: number) {
  const files = await fetchChangedFiles(owner, repo, prNumber);
  setFiles(files);
}

/**
 * Run AI review on the loaded PR
 */
async function runReview() {
  const state = getState();

  if (!state.pr) {
    vscode.window.showWarningMessage("No PR loaded. Start a review first.");
    return;
  }

  if (!state.diff) {
    vscode.window.showWarningMessage("No diff available.");
    return;
  }

  const provider = getAIProvider();
  if (provider === "none") {
    const configure = await vscode.window.showWarningMessage(
      "No AI provider configured.",
      "Open Settings"
    );
    if (configure) {
      vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "prReview.aiProvider"
      );
    }
    return;
  }

  setLoading(true);

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Running AI code review...",
        cancellable: false,
      },
      async (progress) => {
        progress.report({ message: "Analyzing code changes..." });

        const template = buildReviewPrompt(
          state.pr!.headBranch,
          state.pr!.baseBranch,
          state.pr!.title,
          state.diff
        );

        const comments = await runAIReview(state.diff, template);

        if (comments.length === 0) {
          vscode.window.showInformationMessage(
            "AI found no issues in this PR!"
          );
        } else {
          addComments(comments);
          vscode.window.showInformationMessage(
            `AI found ${comments.length} issue(s) to review`
          );
        }
      }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // Don't expose API keys
    const safeMsg = msg.replace(/sk-[a-zA-Z0-9]+/g, "[API_KEY]");
    vscode.window.showErrorMessage(`AI review failed: ${safeMsg}`);
  } finally {
    setLoading(false);
  }
}

/**
 * Submit approved comments to GitHub
 */
async function submitReview() {
  const state = getState();

  if (!state.pr) {
    vscode.window.showWarningMessage("No PR loaded.");
    return;
  }

  const approved = getApprovedComments();
  if (approved.length === 0) {
    vscode.window.showWarningMessage("No approved comments to submit.");
    return;
  }

  const confirm = await vscode.window.showInformationMessage(
    `Submit ${approved.length} comment(s) to PR #${state.pr.number}?`,
    { modal: true },
    "Submit"
  );

  if (confirm !== "Submit") return;

  try {
    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Submitting review...",
        cancellable: false,
      },
      async () => {
        return await submitReviewComments(state.pr!, approved);
      }
    );

    if (result.success) {
      const action = result.url ? "View on GitHub" : undefined;
      const selected = await vscode.window.showInformationMessage(
        result.message,
        ...(action ? [action] : [])
      );
      if (selected === "View on GitHub" && result.url) {
        vscode.env.openExternal(vscode.Uri.parse(result.url));
      }
    } else {
      vscode.window.showErrorMessage(result.message);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to submit: ${msg}`);
  }
}

/**
 * Edit a comment
 */
async function editComment(commentId: string) {
  const state = getState();
  const comment = state.files
    .flatMap((f) => f.comments)
    .find((c) => c.id === commentId);

  if (!comment) return;

  const currentText =
    comment.editedText || `**${comment.issue}**\n\n${comment.suggestion || ""}`;

  const newText = await vscode.window.showInputBox({
    prompt: "Edit comment",
    value: currentText,
    valueSelection: [0, currentText.length],
  });

  if (newText !== undefined) {
    updateCommentText(commentId, newText);
    updateCommentStatus(commentId, "approved");
  }
}

/**
 * Navigate to a comment in the editor
 */
async function goToComment(comment: ReviewComment) {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) return;

  const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, comment.file);

  try {
    const doc = await vscode.workspace.openTextDocument(fileUri);
    const editor = await vscode.window.showTextDocument(doc);

    const line = Math.min(Math.max(0, comment.line - 1), doc.lineCount - 1);
    const range = new vscode.Range(line, 0, line, 0);

    editor.selection = new vscode.Selection(range.start, range.start);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
  } catch {
    vscode.window.showWarningMessage(`Could not open file: ${comment.file}`);
  }
}

/**
 * Show comment details in a modal
 */
function showCommentDetails(comment: ReviewComment) {
  const md = new vscode.MarkdownString();
  md.appendMarkdown(`## ${comment.severity.toUpperCase()}\n\n`);
  md.appendMarkdown(`**Issue:** ${comment.issue}\n\n`);
  if (comment.suggestion) {
    md.appendMarkdown(`**Suggestion:** ${comment.suggestion}\n\n`);
  }
  md.appendMarkdown(`**File:** ${comment.file}:${comment.line}\n\n`);
  md.appendMarkdown(`**Status:** ${comment.status}`);

  vscode.window.showInformationMessage(
    `[${comment.severity.toUpperCase()}] ${comment.issue}`,
    { modal: false, detail: comment.suggestion }
  );
}

export function deactivate() {
  console.log("PR Review Assistant deactivated");
}
