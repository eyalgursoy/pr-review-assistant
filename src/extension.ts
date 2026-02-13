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
  getRejectedComments,
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
  getFileAtRevision,
} from "./github";
import {
  runAIReview,
  getAIProvider,
  getCursorCliModels,
  getSelectedCursorModel,
  generateCodeSuggestion,
} from "./ai-providers";
import { initSecretStorage, setApiKey, deleteApiKey } from "./secrets";
import { writeSecureTempFile, validateGitPath } from "./shell-utils";
import { sanitizeMarkdownForDisplay } from "./markdown-utils";
import { buildReviewPrompt } from "./review-template";
import {
  detectProjectContext,
  type ProjectContext,
  type Framework,
} from "./project-detector";
import {
  startProgress,
  updateStage,
  resetProgress,
  errorProgress,
} from "./streaming-progress";
import type { ReviewComment } from "./types";
import {
  getCurrentBranch,
  hasUncommittedChanges,
  gitFetch,
  stashAndCheckout,
  checkoutBranch,
  findStashByMessage,
  popStash,
  checkout,
  updateBranchFromRemote,
  type RestoreStackEntry,
} from "./git-utils";

const RESTORE_STACK_KEY = "prReview.restoreStack";

/**
 * Resolve and validate comment file path; returns null if path escapes workspace.
 */
function resolveCommentFilePath(comment: ReviewComment): string | null {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) return null;
  try {
    return validateGitPath(comment.file, workspaceFolder.uri.fsPath);
  } catch {
    return null;
  }
}

let treeProvider: PRReviewTreeProvider;
let treeView: vscode.TreeView<unknown>;
let decorations: ReturnType<typeof createCommentDecorations>;
let extensionContext: vscode.ExtensionContext;

/**
 * Restore stack: branch names and stash messages for PR review checkout.
 * Persisted in globalState (prReview.restoreStack) across sessions.
 * Cleared when user dismisses restore prompt or completes restore.
 */
function getRestoreStack(): RestoreStackEntry[] {
  const raw = extensionContext.globalState.get<RestoreStackEntry[]>(
    RESTORE_STACK_KEY
  );
  return Array.isArray(raw) ? raw : [];
}

function setRestoreStack(stack: RestoreStackEntry[]): void {
  extensionContext.globalState.update(RESTORE_STACK_KEY, stack);
}

/**
 * Restore branch(es) and stashes from the restore stack (reverse order).
 * Clears the stack on success. On stash pop conflict, leaves stash in place.
 * @returns true if all entries were restored and the stack was cleared; false on early exit (checkout or stash pop failure).
 */
async function restoreFromStack(): Promise<boolean> {
  const stack = getRestoreStack();
  if (stack.length === 0) return true;

  for (let i = stack.length - 1; i >= 0; i--) {
    const entry = stack[i];
    try {
      await checkout(entry.branch);
      if (entry.stashMessage) {
        const ref = await findStashByMessage(entry.stashMessage);
        if (ref) {
          try {
            await popStash(ref);
          } catch (popErr) {
            const msg =
              popErr instanceof Error ? popErr.message : String(popErr);
            vscode.window.showErrorMessage(
              `Stash pop failed: ${msg}. Resolve manually and run \`git stash pop\`.`
            );
            // Leave remaining entries for retry; don't clear stack
            return false;
          }
        } else {
          vscode.window.showWarningMessage(
            `Stash not found for branch "${entry.branch}"; it may have been dropped or applied elsewhere. Only the branch was restored. Check \`git stash list\` or re-apply changes manually if needed.`
          );
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Restore failed: ${msg}`);
      return false;
    }
  }
  setRestoreStack([]);
  return true;
}

/**
 * Ensure we're on the PR head branch. Stash if needed, push to restore stack.
 * Returns true to proceed, false to abort.
 */
async function ensureBranchForReview(
  headBranch: string,
  isSwitchingReview: boolean
): Promise<boolean> {
  const config = vscode.workspace.getConfiguration("prReview");
  if (!config.get<boolean>("checkoutPrBranch", true)) {
    vscode.window.showWarningMessage(
      "PR branch checkout disabled. Comments may drift if you're on a different branch."
    );
    return true;
  }

  try {
    const currentBranch = await getCurrentBranch();
    if (currentBranch === headBranch) {
      await gitFetch();
      await updateBranchFromRemote(headBranch);
      return true;
    }

    await gitFetch();

    const dirty = await hasUncommittedChanges();
    if (dirty && !isSwitchingReview) {
      const choice = await vscode.window.showWarningMessage(
        "You have uncommitted changes. Stash and switch to PR branch for accurate line numbers?",
        "Stash & Switch",
        "Continue Anyway",
        "Cancel"
      );
      if (choice === "Cancel") return false;
      if (choice === "Continue Anyway") {
        vscode.window.showWarningMessage(
          "Continuing without checkout. Comments may point to wrong lines."
        );
        return true;
      }
      // Stash & Switch
      const entry = await stashAndCheckout(currentBranch, headBranch);
      setRestoreStack([...getRestoreStack(), entry]);
      await updateBranchFromRemote(headBranch);
      return true;
    }

    if (dirty && isSwitchingReview) {
      const entry = await stashAndCheckout(currentBranch, headBranch);
      setRestoreStack([...getRestoreStack(), entry]);
      await updateBranchFromRemote(headBranch);
      return true;
    }

    // Clean
    const entry = await checkoutBranch(currentBranch, headBranch);
    setRestoreStack([...getRestoreStack(), entry]);
    await updateBranchFromRemote(headBranch);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Branch checkout failed: ${msg}`);
    return false;
  }
}

/**
 * Focus the PR Review Assistant tree view (in Source Control sidebar).
 * Call when AI review completes so the user sees the comments.
 */
function focusCommentsView(): void {
  try {
    vscode.commands.executeCommand("workbench.view.scm");
    const rootItems = treeProvider.getChildren(undefined);
    if (rootItems && rootItems.length > 0) {
      treeView.reveal(rootItems[0], { focus: true });
    }
  } catch {
    // Ignore - view may not be ready
  }
}

/**
 * On activation: if restore stack has entries, prompt to restore.
 */
async function checkPendingRestoreOnActivation(): Promise<void> {
  const stack = getRestoreStack();
  if (stack.length === 0) return;

  const choice = await vscode.window.showInformationMessage(
    "PR Review: You were reviewing a PR. Restore your previous branch(es)?",
    "Restore",
    "Dismiss"
  );
  if (choice === "Restore") {
    await restoreFromStack();
  } else if (choice === "Dismiss") {
    setRestoreStack([]);
  }
}

export async function activate(context: vscode.ExtensionContext) {
  extensionContext = context;

  // Initialize logger first
  initLogger(context);
  log("PR Review Assistant activated");

  // Initialize secure storage for API keys
  initSecretStorage(context);

  // Create tree view provider
  treeProvider = new PRReviewTreeProvider();
  treeView = vscode.window.createTreeView("prReviewAssistant", {
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

  // Await pending restore so stack is consistent before activation returns
  await checkPendingRestoreOnActivation();
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
    vscode.commands.registerCommand("prReview.clearReview", async () => {
      const restored = await restoreFromStack();
      resetState();
      if (restored) {
        vscode.window.showInformationMessage("Review cleared");
      } else {
        vscode.window.showErrorMessage(
          "Could not restore your previous branch(es). You may still be on the PR branch. Restore your branch manually or use the Restore prompt when you reopen."
        );
      }
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

  // Fix in Chat - open file and copy context for Cursor chat
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "prReview.fixInChat",
      async (arg: ReviewComment | { comment?: ReviewComment } | unknown) => {
        const comment = resolveCommentArg(arg);
        if (comment) await fixInChat(comment);
      }
    )
  );

  // Generate Suggested Fix - AI generates code suggestion
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "prReview.generateSuggestion",
      async (arg: ReviewComment | { comment?: ReviewComment } | unknown) => {
        const comment = resolveCommentArg(arg);
        if (comment) await generateSuggestionForComment(comment);
      }
    )
  );

  // View Diff - side-by-side old vs new for comment's file
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "prReview.viewDiff",
      async (arg: ReviewComment | { comment?: ReviewComment } | unknown) => {
        const comment = resolveCommentArg(arg);
        if (comment) await viewDiffForComment(comment);
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

  // Select Cursor CLI Model (only when provider is cursor-cli)
  context.subscriptions.push(
    vscode.commands.registerCommand("prReview.selectCursorModel", async () => {
      if (getAIProvider() !== "cursor-cli") {
        await vscode.window.showInformationMessage(
          "Cursor CLI model selection only applies when AI provider is Cursor CLI. Change 'prReview.aiProvider' to 'Cursor CLI' first."
        );
        return;
      }
      const models = await getCursorCliModels();
      const current = getSelectedCursorModel() || "Auto";
      const picked = await vscode.window.showQuickPick(
        models.map((m) => ({ label: m, description: m === current ? "Current" : undefined })),
        { placeHolder: "Select Cursor CLI model", title: "PR Review: Cursor CLI Model" }
      );
      if (picked) {
        const config = vscode.workspace.getConfiguration("prReview");
        await config.update("aiProviderCursorModel", picked.label, vscode.ConfigurationTarget.Global);
        await vscode.window.showInformationMessage(`Cursor CLI model set to: ${picked.label}`);
      }
    })
  );

  // Set API Key (secure storage)
  context.subscriptions.push(
    vscode.commands.registerCommand("prReview.setApiKey", async () => {
      await setApiKeyCommand();
    })
  );

  // Clear API Key
  context.subscriptions.push(
    vscode.commands.registerCommand("prReview.clearApiKey", async () => {
      await clearApiKeyCommand();
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

  const hadActiveReview = !!getState().pr;

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

    // Checkout PR branch for accurate line numbers
    updateStage("fetching-pr", "Checking out PR branch...");
    const proceed = await ensureBranchForReview(
      prInfo.headBranch,
      hadActiveReview
    );
    if (!proceed) {
      setLoading(false);
      resetProgress();
      return;
    }

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
    // Detect project context for rules (unless disabled)
    const config = vscode.workspace.getConfiguration("prReview");
    const enableProjectDetection = config.get<boolean>(
      "enableProjectDetection",
      true
    );
    const changedPaths = state.files.map((f) => f.path);
    const projectContext: ProjectContext = enableProjectDetection
      ? await detectProjectContext(changedPaths)
      : {
          projectType: "unknown",
          languages: [],
          frameworks: [] as Framework[],
          isMonorepo: false,
          rootPath: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null,
        };

    log(
      "Project context:",
      { type: projectContext.projectType, languages: projectContext.languages, frameworks: projectContext.frameworks }
    );

    // Build the prompt
    const template = await buildReviewPrompt(
      state.pr!.headBranch,
      state.pr!.baseBranch,
      state.pr!.title,
      state.diff,
      projectContext,
      projectContext.rootPath
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
      focusCommentsView();
      vscode.window.showInformationMessage(
        result.summary || "AI found no issues in this PR!"
      );
    } else {
      addComments(result.comments);
      log(`Added ${result.comments.length} comments to state`);

      focusCommentsView();

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
    // Don't expose API keys (all provider formats)
    const safeMsg = msg
      .replace(/sk-[a-zA-Z0-9-_]+/g, "[API_KEY]") // OpenAI
      .replace(/AIza[a-zA-Z0-9-_]+/g, "[API_KEY]") // Gemini
      .replace(/gsk_[a-zA-Z0-9]+/g, "[API_KEY]") // Groq
      .replace(/sk-ant-[a-zA-Z0-9-_]+/g, "[API_KEY]"); // Anthropic
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
  if (!allCommentsReviewed()) return;

  const state = getState();
  const approved = getApprovedComments();
  const pending = getPendingComments();

  if (pending.length > 0) return;

  if (state.isLocalMode) {
    // Local flow: show completion message (no submit option)
    vscode.window.showInformationMessage(
      `All comments reviewed! ${approved.length} approved, ${getRejectedComments().length} rejected. Review complete.`
    );
    return;
  }

  // PR flow: show submit option
  if (approved.length > 0) {
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

  // Revert to pending so user can re-review after edit
  updateCommentStatus(commentId, "pending");

  const currentText =
    comment.editedText || `**${comment.issue}**\n\n${comment.suggestion || ""}`;

  const newText = await vscode.window.showInputBox({
    prompt: "Edit comment (status reset to pending for re-review)",
    value: currentText,
    valueSelection: [0, currentText.length],
  });

  if (newText !== undefined) {
    updateCommentText(commentId, newText);
  }
}

/**
 * Resolve comment from various command argument types
 */
function resolveCommentArg(arg: unknown): ReviewComment | undefined {
  if (!arg) return undefined;
  if (typeof arg === "object" && "comment" in arg && arg.comment) {
    return arg.comment as ReviewComment;
  }
  if (typeof arg === "object" && "file" in arg && "line" in arg) {
    return arg as ReviewComment;
  }
  // From comment thread: arg may be CommentThread or PRReviewComment
  if (typeof arg === "object" && "comments" in arg) {
    const thread = arg as { comments: Array<{ reviewComment?: ReviewComment }> };
    const first = thread.comments[0];
    return first?.reviewComment;
  }
  if (typeof arg === "object" && "reviewComment" in arg) {
    return (arg as { reviewComment: ReviewComment }).reviewComment;
  }
  return undefined;
}

/**
 * Fix in Chat - open file, copy context, try to open Cursor chat
 */
async function fixInChat(comment: ReviewComment) {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showWarningMessage("No workspace folder open");
    return;
  }
  const safePath = resolveCommentFilePath(comment);
  if (!safePath) {
    vscode.window.showWarningMessage("Invalid or unsafe file path for this comment.");
    return;
  }

  const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, safePath);
  let codeSnippet = "";

  try {
    const doc = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(doc);

    const lineIdx = Math.max(0, comment.line - 1);
    const start = Math.max(0, lineIdx - 3);
    const end = Math.min(doc.lineCount, lineIdx + 4);
    codeSnippet = doc.getText(new vscode.Range(start, 0, end, 0));
  } catch {
    codeSnippet = `File: ${safePath}, Line: ${comment.line}`;
  }

  const context = `Fix this code review issue:

**File:** ${safePath}
**Line:** ${comment.line}

**Issue:** ${comment.issue}
${comment.suggestion ? `**Suggestion:** ${comment.suggestion}` : ""}

**Code:**
\`\`\`
${codeSnippet}
\`\`\`

Please fix the issue.`;

  await vscode.env.clipboard.writeText(context);

  // Try Cursor/Copilot chat commands
  const chatCommands = [
    "aichat.newchat",
    "workbench.action.chat.open",
    "composer.openNewChat",
  ];
  for (const cmd of chatCommands) {
    try {
      await vscode.commands.executeCommand(cmd, context);
      vscode.window.showInformationMessage("Context sent to chat");
      return;
    } catch {
      // Try next command
    }
  }

  vscode.window.showInformationMessage(
    "Context copied to clipboard. Open chat (Cmd+L) and paste to fix the issue."
  );
}

/**
 * Generate AI suggestion and add to comment
 */
async function generateSuggestionForComment(comment: ReviewComment) {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showWarningMessage("No workspace folder open");
    return;
  }
  const safePath = resolveCommentFilePath(comment);
  if (!safePath) {
    vscode.window.showWarningMessage("Invalid or unsafe file path for this comment.");
    return;
  }

  const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, safePath);

  try {
    const doc = await vscode.workspace.openTextDocument(fileUri);
    const lineIdx = Math.max(0, comment.line - 1);
    const start = Math.max(0, lineIdx - 2);
    const end = Math.min(doc.lineCount, lineIdx + 3);
    const codeSnippet = doc.getText(new vscode.Range(start, 0, end, 0));

    const suggestedCode = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Generating suggested fix...",
        cancellable: false,
      },
      () => generateCodeSuggestion(codeSnippet, comment.issue, comment.suggestion)
    );

    const suggestionBlock = `\n\n\`\`\`suggestion\n${suggestedCode}\n\`\`\``;
    const currentBody = comment.editedText || `**${comment.issue}**\n\n${comment.suggestion || ""}`;
    const newBody = currentBody.includes("```suggestion")
      ? currentBody
      : currentBody + suggestionBlock;

    updateCommentText(comment.id, newBody);
    updateCommentStatus(comment.id, "pending");

    vscode.window.showInformationMessage("Suggested fix added to comment");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to generate suggestion: ${msg}`);
  }
}

/**
 * View side-by-side diff for comment's file (old vs new)
 */
async function viewDiffForComment(comment: ReviewComment) {
  const state = getState();
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showWarningMessage("No workspace folder open");
    return;
  }
  const safePath = resolveCommentFilePath(comment);
  if (!safePath) {
    vscode.window.showWarningMessage("Invalid or unsafe file path for this comment.");
    return;
  }

  const baseBranch = state.pr?.baseBranch || "main";
  const newUri = vscode.Uri.joinPath(workspaceFolder.uri, safePath);

  try {
    const oldContent = await getFileAtRevision(safePath, baseBranch);

    const path = await import("path");
    const basename = path.basename(safePath);
    const tempFile = await writeSecureTempFile(
      `pr-review-old-${basename}`,
      "",
      oldContent
    );
    const oldUri = vscode.Uri.file(tempFile);

    await vscode.commands.executeCommand("vscode.diff", oldUri, newUri, `${safePath} (${baseBranch} vs current)`);

    // Clean up temp file after a delay (diff editor may still be reading it)
    setTimeout(async () => {
      try {
        const fs = await import("fs");
        fs.unlinkSync(tempFile);
      } catch {
        // Ignore
      }
    }, 60000);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to show diff: ${msg}`);
  }
}

/**
 * Navigate to a comment in the editor
 */
async function goToComment(comment: ReviewComment) {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) return;

  const safePath = resolveCommentFilePath(comment);
  if (!safePath) {
    vscode.window.showWarningMessage("Invalid or unsafe file path for this comment.");
    return;
  }

  const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, safePath);

  try {
    const doc = await vscode.workspace.openTextDocument(fileUri);
    const editor = await vscode.window.showTextDocument(doc);

    const line = Math.min(Math.max(0, comment.line - 1), doc.lineCount - 1);
    const range = new vscode.Range(line, 0, line, 0);

    editor.selection = new vscode.Selection(range.start, range.start);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
  } catch {
    vscode.window.showWarningMessage(`Could not open file: ${safePath}`);
  }
}

/**
 * Show comment details in a modal
 */
function showCommentDetails(comment: ReviewComment) {
  const safeIssue = sanitizeMarkdownForDisplay(comment.issue);
  const safeSuggestion = comment.suggestion
    ? sanitizeMarkdownForDisplay(comment.suggestion)
    : "";
  const safeFile = sanitizeMarkdownForDisplay(comment.file);

  const md = new vscode.MarkdownString();
  md.appendMarkdown(`## ${comment.severity.toUpperCase()}\n\n`);
  md.appendMarkdown(`**Issue:** ${safeIssue}\n\n`);
  if (safeSuggestion) {
    md.appendMarkdown(`**Suggestion:** ${safeSuggestion}\n\n`);
  }
  md.appendMarkdown(`**File:** ${safeFile}:${comment.line}\n\n`);
  md.appendMarkdown(`**Status:** ${comment.status}`);

  vscode.window.showInformationMessage(
    `[${comment.severity.toUpperCase()}] ${safeIssue}`,
    { modal: false, detail: safeSuggestion || undefined }
  );
}

const API_KEY_PROVIDERS = [
  { id: "anthropic", label: "Anthropic Claude" },
  { id: "openai", label: "OpenAI GPT-4" },
  { id: "gemini", label: "Google Gemini" },
  { id: "groq", label: "Groq" },
] as const;

async function setApiKeyCommand(): Promise<void> {
  const provider = await vscode.window.showQuickPick(
    API_KEY_PROVIDERS.map((p) => ({ label: p.label, descriptor: p })),
    { placeHolder: "Select AI provider" }
  );
  if (!provider) return;

  const key = await vscode.window.showInputBox({
    prompt: `Enter API key for ${provider.descriptor.label}`,
    password: true,
    placeHolder: "Paste your API key",
  });
  if (key === undefined) return;

  if (!key.trim()) {
    vscode.window.showWarningMessage("API key cannot be empty");
    return;
  }

  await setApiKey(provider.descriptor.id, key.trim());
  vscode.window.showInformationMessage(
    `${provider.descriptor.label} API key stored securely`
  );
}

async function clearApiKeyCommand(): Promise<void> {
  const provider = await vscode.window.showQuickPick(
    API_KEY_PROVIDERS.map((p) => ({ label: p.label, descriptor: p })),
    { placeHolder: "Select AI provider" }
  );
  if (!provider) return;

  await deleteApiKey(provider.descriptor.id);
  vscode.window.showInformationMessage(
    `${provider.descriptor.label} API key removed`
  );
}

export function deactivate() {
  console.log("PR Review Assistant deactivated");
  disposeCommentThreads();
  const clearOnDeactivate = vscode.workspace
    .getConfiguration("prReview")
    .get<boolean>("clearRestoreStackOnDeactivate", false);
  if (clearOnDeactivate && extensionContext) {
    setRestoreStack([]);
  }
}
