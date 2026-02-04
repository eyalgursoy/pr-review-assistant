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
import { initCommentController, disposeCommentThreads } from "./comments";
import { initLogger, log, logSection, showLog } from "./logger";
import {
  getState,
  resetState,
  setPRInfo,
  setLocalMode,
  setFiles,
  setDiff,
  setLoading,
  setError,
  addComments,
  setSummary,
  getSummary,
  updateCommentStatus,
  updateCommentText,
  getApprovedComments,
  getPendingComments,
  allCommentsReviewed,
  allCommentsRejected,
  onStateChange,
} from "./state";
import {
  parsePRUrl,
  checkGhCli,
  fetchPRInfo,
  fetchChangedFiles,
  fetchPRDiff,
  submitReviewComments,
  approvePR,
  getLocalBranchInfo,
  fetchLocalDiff,
  parseDiffToChangedFiles,
} from "./github";
import { runAIReview, getAIProvider } from "./ai-providers";
import { buildReviewPrompt } from "./review-template";
import {
  startProgress,
  updateStage,
  resetProgress,
  completeProgress,
  errorProgress,
} from "./streaming-progress";
import type { ReviewComment } from "./types";

let treeProvider: PRReviewTreeProvider;
let decorations: ReturnType<typeof createCommentDecorations>;

export function activate(context: vscode.ExtensionContext) {
  // Initialize logger first
  initLogger(context);
  log("PR Review Assistant activated");

  // Create tree view provider
  treeProvider = new PRReviewTreeProvider();
  const treeView = vscode.window.createTreeView("prReviewAssistant", {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  // Create status bar item for submit/approve (visible when ready)
  const reviewStatusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  context.subscriptions.push(reviewStatusBar);

  // Update status bar when state changes
  onStateChange(() => {
    const state = getState();
    const approved = getApprovedComments().length;
    const pending = getPendingComments().length;
    const rejected = allCommentsRejected();

    // Only show in PR mode (not local review)
    if (state.isLocalMode || !state.pr || state.pr.number === 0) {
      reviewStatusBar.hide();
      return;
    }

    if (approved > 0 && pending === 0) {
      reviewStatusBar.command = "prReview.submitReview";
      reviewStatusBar.text = `$(cloud-upload) Submit PR Review (${approved})`;
      reviewStatusBar.tooltip = `Submit ${approved} approved comment(s) to GitHub`;
      reviewStatusBar.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.warningBackground"
      );
      reviewStatusBar.show();
    } else if (rejected) {
      reviewStatusBar.command = "prReview.approvePR";
      reviewStatusBar.text = `$(check-all) Approve PR`;
      reviewStatusBar.tooltip = "All comments rejected - Approve PR with LGTM";
      reviewStatusBar.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.prominentBackground"
      );
      reviewStatusBar.show();
    } else {
      reviewStatusBar.hide();
    }
  });

  // Initialize Comments API (native comment threads)
  initCommentController(context);

  // Create CodeLens provider (simplified - just shows line indicators)
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

  // Review Local Changes - diff current branch vs main
  context.subscriptions.push(
    vscode.commands.registerCommand("prReview.reviewLocalChanges", async () => {
      await reviewLocalChanges();
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

  // Approve PR (when all comments rejected)
  context.subscriptions.push(
    vscode.commands.registerCommand("prReview.approvePR", async () => {
      await approvePRFlow();
    })
  );

  // Clear Review
  context.subscriptions.push(
    vscode.commands.registerCommand("prReview.clearReview", () => {
      resetState();
      vscode.window.showInformationMessage("Review cleared");
    })
  );

  // Approve Comment (handles both string ID and TreeItemData from tree view)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "prReview.approveComment",
      async (arg: string | { comment?: ReviewComment }) => {
        const commentId = typeof arg === "string" ? arg : arg?.comment?.id;
        if (commentId) {
          updateCommentStatus(commentId, "approved");
          await checkAllCommentsReviewed();
        }
      }
    )
  );

  // Reject Comment (handles both string ID and TreeItemData from tree view)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "prReview.rejectComment",
      async (arg: string | { comment?: ReviewComment }) => {
        const commentId = typeof arg === "string" ? arg : arg?.comment?.id;
        if (commentId) {
          updateCommentStatus(commentId, "rejected");
          await checkAllCommentsReviewed();
        }
      }
    )
  );

  // Edit Comment (handles both string ID and TreeItemData from tree view)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "prReview.editComment",
      async (arg: string | { comment?: ReviewComment }) => {
        const commentId = typeof arg === "string" ? arg : arg?.comment?.id;
        if (commentId) {
          await editComment(commentId);
        }
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

  // Show Log
  context.subscriptions.push(
    vscode.commands.registerCommand("prReview.showLog", () => {
      showLog();
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
  resetProgress();
  startProgress();
  setLoading(true);

  try {
    // Fetch PR info
    updateStage("fetching-pr", "Fetching PR information...");
    const prInfo = await fetchPRInfo(parsed.owner, parsed.repo, parsed.number);
    setPRInfo(prInfo);

    // Fetch changed files
    updateStage("loading-diff", "Loading changed files...");
    await loadPRFiles(parsed.owner, parsed.repo, parsed.number);

    // Fetch diff
    updateStage("loading-diff", "Loading diff...", `${prInfo.title}`);
    const diff = await fetchPRDiff(parsed.owner, parsed.repo, parsed.number);
    setDiff(diff);

    setLoading(false);
    resetProgress(); // Clear progress when done loading

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
 * Review local branch changes (diff against main)
 */
async function reviewLocalChanges() {
  resetState();
  resetProgress();
  startProgress();
  setLoading(true);

  try {
    updateStage("fetching-pr", "Getting branch info...");
    const { branch, baseBranch } = await getLocalBranchInfo();
    setLocalMode(branch, baseBranch);

    updateStage("loading-diff", "Loading local diff...");
    const diff = await fetchLocalDiff(baseBranch);

    if (!diff || diff.trim().length === 0) {
      setLoading(false);
      resetProgress();
      vscode.window.showInformationMessage(
        "No changes to review. Your branch is up to date with " + baseBranch + "."
      );
      return;
    }

    setDiff(diff);

    const files = parseDiffToChangedFiles(diff);
    setFiles(files);

    setLoading(false);
    resetProgress();

    // Auto-run AI
    const config = vscode.workspace.getConfiguration("prReview");
    if (config.get<boolean>("autoRunAi")) {
      await runReview();
    } else {
      const runAi = await vscode.window.showInformationMessage(
        `Loaded ${branch} → ${baseBranch} (${files.length} files changed)`,
        "Run AI Review"
      );
      if (runAi) {
        await runReview();
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    setError(msg);
    vscode.window.showErrorMessage(`Failed to load local diff: ${msg}`);
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

  logSection("STARTING AI REVIEW");
  log("PR Info:", state.pr);
  log("Diff length:", state.diff?.length || 0);
  log("Number of files:", state.files.length);

  if (!state.pr) {
    vscode.window.showWarningMessage("No PR loaded. Start a review first.");
    return;
  }

  if (!state.diff) {
    vscode.window.showWarningMessage("No diff available.");
    return;
  }

  const provider = getAIProvider();
  log("AI Provider:", provider);

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
  startProgress();

  try {
    // Build the prompt
    const template = buildReviewPrompt(
      state.pr!.headBranch,
      state.pr!.baseBranch,
      state.pr!.title,
      state.diff
    );

    log("Review template length:", template.length);

    // Run AI review (progress is tracked inside runAIReview)
    const result = await runAIReview(state.diff, template);

    logSection("ADDING COMMENTS TO STATE");
    log(`Summary: ${result.summary}`);
    log(`Received ${result.comments.length} comments from AI`);

    // Store the summary
    setSummary(result.summary);

    if (result.comments.length === 0) {
      vscode.window.showInformationMessage(
        result.summary || "AI found no issues in this PR!"
      );
    } else {
      addComments(result.comments);
      log(`Added ${result.comments.length} comments to state`);

      // Check if user wants to see log prompt
      const config = vscode.workspace.getConfiguration("prReview");
      const showLogPrompt = config.get<boolean>("showLogPrompt", false);

      if (showLogPrompt) {
        // Show log prompt for debugging
        const viewLog = await vscode.window.showInformationMessage(
          `AI found ${result.comments.length} issue(s) to review`,
          "View Log"
        );
        if (viewLog === "View Log") {
          showLog();
        }
      } else {
        // Just show a simple notification without blocking
        vscode.window.showInformationMessage(
          `AI found ${result.comments.length} issue(s) to review`
        );
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // Don't expose API keys
    const safeMsg = msg.replace(/sk-[a-zA-Z0-9]+/g, "[API_KEY]");
    errorProgress(safeMsg);
    vscode.window.showErrorMessage(`AI review failed: ${safeMsg}`);
  } finally {
    setLoading(false);
    // Don't reset progress here - let the tree view show the final state
  }
}

/**
 * Check if all comments have been reviewed and show a helpful toast
 */
async function checkAllCommentsReviewed(): Promise<void> {
  const state = getState();
  if (allCommentsReviewed() && !state.isLocalMode) {
    const approved = getApprovedComments();
    const pending = getPendingComments();

    if (approved.length > 0 && pending.length === 0) {
      const action = await vscode.window.showInformationMessage(
        `All comments reviewed! ${approved.length} approved and ready to submit.`,
        "Submit PR Review",
        "Dismiss"
      );

      if (action === "Submit PR Review") {
        vscode.commands.executeCommand("prReview.submitReview");
      }
    }
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

  if (state.isLocalMode) {
    vscode.window.showInformationMessage(
      "This is a local review. Create a PR on GitHub to submit comments."
    );
    return;
  }

  const approved = getApprovedComments();
  const pending = getPendingComments();

  if (approved.length === 0) {
    vscode.window.showWarningMessage("No approved comments to submit.");
    return;
  }

  // Warn if there are still pending comments
  let confirmMessage = `Submit ${approved.length} comment(s) to PR #${state.pr.number}?`;
  if (pending.length > 0) {
    confirmMessage = `You have ${pending.length} pending comment(s) not yet reviewed.\n\nSubmit ${approved.length} approved comment(s) anyway?`;
  }

  const confirm = await vscode.window.showInformationMessage(
    confirmMessage,
    { modal: true },
    "Submit"
  );

  if (confirm !== "Submit") return;

  try {
    const summary = getSummary();
    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Submitting review...",
        cancellable: false,
      },
      async () => {
        return await submitReviewComments(state.pr!, approved, summary);
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
 * Approve PR with LGTM (when all comments rejected)
 */
async function approvePRFlow() {
  const state = getState();

  if (!state.pr || state.isLocalMode) {
    vscode.window.showWarningMessage("No PR loaded or local review mode.");
    return;
  }

  if (state.pr.number === 0) {
    vscode.window.showWarningMessage("Cannot approve local review.");
    return;
  }

  const summary = getSummary();
  const defaultBody = summary
    ? `LGTM! ${summary}`
    : "LGTM! Code reviewed with PR Review Assistant.";

  const body = await vscode.window.showInputBox({
    prompt: "Approve PR - optional comment (or press Enter for default)",
    value: defaultBody,
    placeHolder: "LGTM! ...",
  });

  if (body === undefined) return; // User cancelled

  const confirm = await vscode.window.showInformationMessage(
    `Approve PR #${state.pr.number}?`,
    { modal: true },
    "Approve"
  );

  if (confirm !== "Approve") return;

  try {
    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Approving PR...",
        cancellable: false,
      },
      async () => approvePR(state.pr!, body || defaultBody)
    );

    if (result.success) {
      const selected = await vscode.window.showInformationMessage(
        result.message,
        ...(result.url ? ["View on GitHub"] : [])
      );
      if (selected === "View on GitHub" && result.url) {
        vscode.env.openExternal(vscode.Uri.parse(result.url));
      }
    } else {
      vscode.window.showErrorMessage(result.message);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to approve: ${msg}`);
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
  disposeCommentThreads();
}
