/**
 * Tests for action guards in extension.ts
 * Covers goToComment, fixInChat, generateSuggestionForComment
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockShowInformationMessage = vi.fn();
const mockShowWarningMessage = vi.fn();
const mockOpenTextDocument = vi.fn();
const mockShowTextDocument = vi.fn();

vi.mock("vscode", () => ({
  window: {
    showInformationMessage: (...args: unknown[]) =>
      mockShowInformationMessage(...args),
    showWarningMessage: (...args: unknown[]) => mockShowWarningMessage(...args),
    showTextDocument: (...args: unknown[]) => mockShowTextDocument(...args),
    createTreeView: vi.fn(),
    createStatusBarItem: vi.fn(() => ({ show: vi.fn(), dispose: vi.fn() })),
    withProgress: vi.fn(),
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: "/workspace" } }],
    openTextDocument: (...args: unknown[]) => mockOpenTextDocument(...args),
    onDidChangeTextEditorSelection: vi.fn(() => ({ dispose: vi.fn() })),
    onDidChangeActiveTextEditor: vi.fn(() => ({ dispose: vi.fn() })),
    onDidSaveTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
    onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
    getConfiguration: vi.fn(() => ({ get: () => "hide" })),
  },
  commands: {
    registerCommand: vi.fn(),
    executeCommand: vi.fn(),
  },
  EventEmitter: class {
    event = () => ({ dispose: () => {} });
    fire() {}
  },
  Uri: {
    file: (p: string) => ({ fsPath: p, path: p }),
    joinPath: (_base: unknown, ...parts: string[]) => ({
      fsPath: parts.join("/"),
    }),
  },
  Range: class {
    constructor(
      public startLine: number,
      public startChar: number,
      public endLine: number,
      public endChar: number
    ) {}
  },
  Selection: class {
    constructor(public anchor: unknown, public active: unknown) {}
  },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  TreeItem: class {},
  ThemeIcon: class {},
  ThemeColor: class {},
  MarkdownString: class {
    isTrusted = false;
    appendMarkdown() { return this; }
  },
  CommentThreadState: { Unresolved: 0, Resolved: 1 },
  CommentMode: { Preview: 0, Editing: 1 },
  CommentThreadCollapsibleState: { Collapsed: 0, Expanded: 1 },
  StatusBarAlignment: { Left: 1, Right: 2 },
  ProgressLocation: { Notification: 15 },
  TextEditorRevealType: { InCenter: 2 },
  OverviewRulerLane: { Left: 1 },
  comments: { createCommentController: vi.fn(() => ({ dispose: vi.fn(), createCommentThread: vi.fn() })) },
  extensions: { getExtension: vi.fn() },
  env: {
    openExternal: vi.fn(),
    clipboard: { writeText: vi.fn(), readText: vi.fn(() => "") },
  },
}));

vi.mock("./tree-view", () => ({
  PRReviewTreeProvider: class {
    onDidChangeTreeData = { dispose: () => {} };
    getTreeItem = vi.fn();
    getChildren = vi.fn(() => []);
    getParent = vi.fn();
    refresh = vi.fn();
  },
}));

vi.mock("./codelens", () => ({
  ReviewCodeLensProvider: class {
    onDidChangeCodeLenses = { dispose: () => {} };
    provideCodeLenses = vi.fn(() => []);
  },
  createCommentDecorations: vi.fn(() => ({
    pendingDecoration: { dispose: vi.fn() },
    approvedDecoration: { dispose: vi.fn() },
    rejectedDecoration: { dispose: vi.fn() },
  })),
  updateDecorations: vi.fn(),
}));

vi.mock("./comments", () => ({
  initCommentController: vi.fn(),
  disposeCommentThreads: vi.fn(),
  refreshCommentThreads: vi.fn(),
}));

vi.mock("./logger", () => ({
  initLogger: vi.fn(),
  log: vi.fn(),
  logSection: vi.fn(),
  showLog: vi.fn(),
}));

vi.mock("./state", () => ({
  getState: vi.fn(() => ({ status: "idle", comments: [], files: [] })),
  resetState: vi.fn(),
  setPRInfo: vi.fn(),
  setLocalMode: vi.fn(),
  setFiles: vi.fn(),
  setDiff: vi.fn(),
  setLoading: vi.fn(),
  setError: vi.fn(),
  addComments: vi.fn(),
  setSummary: vi.fn(),
  getSummary: vi.fn(() => ""),
  updateCommentStatus: vi.fn(),
  updateCommentText: vi.fn(),
  getApprovedComments: vi.fn(() => []),
  getPendingComments: vi.fn(() => []),
  getRejectedComments: vi.fn(() => []),
  allCommentsReviewed: vi.fn(() => false),
  allCommentsRejected: vi.fn(() => false),
  onStateChange: vi.fn(() => ({ dispose: vi.fn() })),
  getDisplayComments: vi.fn(() => []),
  getDisplayCommentsForFile: vi.fn(() => []),
}));

vi.mock("./github", () => ({
  parsePRUrl: vi.fn(),
  getLocalBranchInfo: vi.fn(),
  fetchLocalDiff: vi.fn(),
  parseDiffToChangedFiles: vi.fn(),
  getFileAtRevision: vi.fn(),
}));

vi.mock("./providers", () => ({
  getProvider: vi.fn(),
}));

vi.mock("./ai-providers", () => ({
  runAIReview: vi.fn(),
  getAIProvider: vi.fn(() => "cursor-cli"),
  getCursorCliModels: vi.fn(() => []),
  getSelectedCursorModel: vi.fn(() => "gpt-4"),
  generateCodeSuggestion: vi.fn(),
}));

vi.mock("./secrets", () => ({
  initSecretStorage: vi.fn(),
  setApiKey: vi.fn(),
  deleteApiKey: vi.fn(),
}));

vi.mock("./shell-utils", () => ({
  writeSecureTempFile: vi.fn(),
  validateGitPath: vi.fn((p: string) => p),
}));

vi.mock("./markdown-utils", () => ({
  sanitizeMarkdownForDisplay: (s: string) => s,
}));

vi.mock("./review-template", () => ({
  buildReviewPrompt: vi.fn(() => ""),
}));

vi.mock("./project-detector", () => ({
  detectProjectContext: vi.fn(() => ({
    type: "unknown",
    languages: [],
    frameworks: [],
    monorepo: false,
  })),
}));

import type { ReviewComment } from "./types";
import { goToComment, fixInChat, generateSuggestionForComment } from "./extension";

function makeComment(overrides: Partial<ReviewComment> = {}): ReviewComment {
  return {
    id: "c1",
    file: "src/foo.ts",
    line: 10,
    side: "RIGHT",
    severity: "medium",
    issue: "Some issue",
    status: "pending",
    source: "ai",
    ...overrides,
  };
}

beforeEach(() => {
  mockShowInformationMessage.mockReset();
  mockShowWarningMessage.mockReset();
  mockOpenTextDocument.mockReset();
  mockShowTextDocument.mockReset();
});

describe("goToComment guards", () => {
  it("shows outdated message and returns early for hostOutdated", async () => {
    await goToComment(makeComment({ hostOutdated: true }));
    expect(mockShowInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining("outdated")
    );
    expect(mockOpenTextDocument).not.toHaveBeenCalled();
  });

  it("shows resolved message and returns early for hostResolved", async () => {
    await goToComment(makeComment({ hostResolved: true }));
    expect(mockShowInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining("resolved")
    );
    expect(mockOpenTextDocument).not.toHaveBeenCalled();
  });

  it("proceeds to open file for normal comments", async () => {
    mockOpenTextDocument.mockResolvedValue({
      lineCount: 100,
      lineAt: () => ({ text: "" }),
    });
    mockShowTextDocument.mockResolvedValue({
      selection: null,
      revealRange: vi.fn(),
    });
    await goToComment(makeComment({ hostOutdated: false, hostResolved: false }));
    expect(mockShowInformationMessage).not.toHaveBeenCalled();
    expect(mockOpenTextDocument).toHaveBeenCalled();
  });

  it("does not show info message when both flags are false", async () => {
    mockOpenTextDocument.mockResolvedValue({ lineCount: 10, lineAt: () => ({ text: "" }) });
    mockShowTextDocument.mockResolvedValue({ selection: null, revealRange: vi.fn() });
    await goToComment(makeComment({ source: "host", hostOutdated: false, hostResolved: false }));
    expect(mockShowInformationMessage).not.toHaveBeenCalled();
  });
});

describe("fixInChat guards", () => {
  it("shows outdated message and returns early for hostOutdated", async () => {
    await fixInChat(makeComment({ hostOutdated: true }));
    expect(mockShowInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining("outdated")
    );
    expect(mockOpenTextDocument).not.toHaveBeenCalled();
  });

  it("shows resolved message and returns early for hostResolved", async () => {
    await fixInChat(makeComment({ hostResolved: true }));
    expect(mockShowInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining("resolved")
    );
    expect(mockOpenTextDocument).not.toHaveBeenCalled();
  });

  it("proceeds for normal comments without showing guard message", async () => {
    mockOpenTextDocument.mockResolvedValue({
      lineCount: 100,
      getText: () => "code",
      lineAt: () => ({ text: "" }),
    });
    mockShowTextDocument.mockResolvedValue({});
    await fixInChat(makeComment({ hostOutdated: false, hostResolved: false }));
    expect(mockShowInformationMessage).not.toHaveBeenCalledWith(
      expect.stringContaining("outdated")
    );
    expect(mockShowInformationMessage).not.toHaveBeenCalledWith(
      expect.stringContaining("resolved")
    );
  });
});

describe("generateSuggestionForComment guards", () => {
  it("shows outdated message and returns early for hostOutdated", async () => {
    await generateSuggestionForComment(makeComment({ hostOutdated: true }));
    expect(mockShowInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining("outdated")
    );
    expect(mockOpenTextDocument).not.toHaveBeenCalled();
  });

  it("shows resolved message and returns early for hostResolved", async () => {
    await generateSuggestionForComment(makeComment({ hostResolved: true }));
    expect(mockShowInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining("resolved")
    );
    expect(mockOpenTextDocument).not.toHaveBeenCalled();
  });

  it("proceeds for normal comments without showing guard message", async () => {
    mockOpenTextDocument.mockResolvedValue({
      lineCount: 100,
      getText: () => "code",
      lineAt: () => ({ text: "" }),
    });
    mockShowTextDocument.mockResolvedValue({});
    await generateSuggestionForComment(
      makeComment({ hostOutdated: false, hostResolved: false })
    );
    expect(mockShowInformationMessage).not.toHaveBeenCalledWith(
      expect.stringContaining("outdated")
    );
    expect(mockShowInformationMessage).not.toHaveBeenCalledWith(
      expect.stringContaining("resolved")
    );
  });
});
