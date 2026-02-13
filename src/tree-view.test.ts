/**
 * Tests for PRReviewTreeProvider (tree view), focusing on getParent for reveal() support.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const mockGetState = vi.fn();
const mockGetAllComments = vi.fn();
const mockGetProgress = vi.fn();

vi.mock("vscode", () => ({
  EventEmitter: class {
    private listeners: Array<(data: unknown) => void> = [];
    event = (listener: (data: unknown) => void) => {
      this.listeners.push(listener);
      return { dispose: () => {} };
    };
    fire(_data: unknown) {
      this.listeners.forEach((l) => l(_data));
    }
  },
  window: {},
  ThemeIcon: class {},
  TreeItem: class {},
  Uri: {
    file: (p: string) => ({ path: p }),
    joinPath: (base: { uri: { fsPath: string } }, ...segments: string[]) =>
      ({ path: [base.uri.fsPath, ...segments].join("/") }),
  },
  MarkdownString: class {},
  workspace: {
    workspaceFolders: [{ uri: { fsPath: "/workspace" } }],
    onDidChangeConfiguration: () => ({ dispose: () => {} }),
  },
}));

vi.mock("./state", () => ({
  getState: () => mockGetState(),
  getAllComments: () => mockGetAllComments(),
  onStateChange: () => ({ dispose: () => {} }),
  allCommentsRejected: () => false,
}));

vi.mock("./streaming-progress", () => ({
  getProgress: () => mockGetProgress(),
  onProgressChange: () => ({ dispose: () => {} }),
  formatElapsedTime: (ms: number) => `${ms}ms`,
  formatCost: () => "",
  formatTokens: () => "",
}));

vi.mock("./ai-providers", () => ({
  getAIProvider: () => "cursor-cli" as const,
  getSelectedCursorModel: () => "gpt-4",
}));

import type { ReviewState, ChangedFile, ReviewComment } from "./types";
import { PRReviewTreeProvider } from "./tree-view";

function makeComment(overrides: Partial<ReviewComment> = {}): ReviewComment {
  return {
    id: "c1",
    file: "src/foo.ts",
    line: 10,
    side: "RIGHT",
    severity: "medium",
    issue: "Some issue",
    status: "pending",
    ...overrides,
  };
}

function makeFile(path: string, comments: ReviewComment[] = []): ChangedFile {
  return {
    path,
    status: "modified",
    additions: 5,
    deletions: 2,
    comments,
  };
}

describe("PRReviewTreeProvider", () => {
  let provider: PRReviewTreeProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetState.mockReturnValue({
      pr: { number: 1, owner: "o", repo: "r", title: "PR", headBranch: "main", baseBranch: "dev", url: "", host: "github" },
      isLocalMode: false,
      files: [],
      diff: "",
      summary: null,
      isLoading: false,
      error: null,
    } as ReviewState);
    mockGetAllComments.mockReturnValue([]);
    mockGetProgress.mockReturnValue({
      stage: "idle",
      message: "",
      currentFile: null,
      filesAnalyzed: [],
      tokensReceived: 0,
      estimatedCost: 0,
      elapsedMs: 0,
      details: null,
    });
    provider = new PRReviewTreeProvider();
  });

  describe("getParent", () => {
    it("returns undefined for root pr-info", () => {
      expect(
        provider.getParent({ type: "pr-info", label: "PR #1", description: "Title" })
      ).toBeUndefined();
    });

    it("returns undefined for root section", () => {
      expect(
        provider.getParent({ type: "section", label: "Changed Files", description: "2 files" })
      ).toBeUndefined();
    });

    it("returns undefined for root model-info", () => {
      expect(
        provider.getParent({ type: "model-info", label: "Model: gpt-4", description: "Cursor CLI" })
      ).toBeUndefined();
    });

    it("returns undefined for root progress", () => {
      expect(
        provider.getParent({ type: "progress", label: "AI Reviewing", description: "..." })
      ).toBeUndefined();
    });

    it("returns undefined for root-level status (Error)", () => {
      expect(
        provider.getParent({ type: "status", label: "Error: Something failed" })
      ).toBeUndefined();
    });

    it("returns undefined for root-level status (No issues found)", () => {
      expect(
        provider.getParent({
          type: "status",
          label: "No issues found! Your code looks great.",
          description: "✓",
        })
      ).toBeUndefined();
    });

    it("returns Review Summary section for status under summary", () => {
      mockGetAllComments.mockReturnValue([makeComment()]);
      const parent = provider.getParent({
        type: "status",
        label: "1 pending",
        description: "awaiting review",
      });
      expect(parent).toBeDefined();
      expect(parent!.type).toBe("section");
      expect(parent!.label).toBe("Review Summary");
      expect(parent!.description).toBe("1 comments");
    });

    it("returns Review Summary section for action under summary", () => {
      mockGetAllComments.mockReturnValue([makeComment()]);
      const parent = provider.getParent({
        type: "action",
        label: "Submit",
        actionCommand: "prReview.submitReview",
      });
      expect(parent).toBeDefined();
      expect(parent!.type).toBe("section");
      expect(parent!.label).toBe("Review Summary");
    });

    it("returns progress node for progress-detail", () => {
      mockGetProgress.mockReturnValue({
        stage: "ai-streaming",
        message: "Streaming...",
        currentFile: null,
        filesAnalyzed: [],
        tokensReceived: 0,
        estimatedCost: 0,
        elapsedMs: 0,
        details: null,
      });
      const parent = provider.getParent({
        type: "progress-detail",
        label: "File",
        description: "analyzing...",
      });
      expect(parent).toBeDefined();
      expect(parent!.type).toBe("progress");
      expect(parent!.label).toBe("AI Reviewing");
      expect(parent!.description).toBe("Streaming...");
    });

    it("returns progress node for progress-stats", () => {
      mockGetProgress.mockReturnValue({
        stage: "ai-analyzing",
        message: "Analyzing",
        currentFile: null,
        filesAnalyzed: [],
        tokensReceived: 0,
        estimatedCost: 0,
        elapsedMs: 0,
        details: null,
      });
      const parent = provider.getParent({
        type: "progress-stats",
        label: "100 tokens",
      });
      expect(parent).toBeDefined();
      expect(parent!.type).toBe("progress");
      expect(parent!.label).toBe("AI Analyzing");
    });

    it("returns Changed Files section for file when state has files", () => {
      mockGetState.mockReturnValue({
        pr: { number: 0, owner: "", repo: "", title: "", headBranch: "", baseBranch: "", url: "", host: "github" as const },
        isLocalMode: false,
        files: [makeFile("src/a.ts")],
        diff: "",
        summary: null,
        isLoading: false,
        error: null,
      } as ReviewState);
      const parent = provider.getParent({
        type: "file",
        label: "a.ts",
        description: "0 comments",
        file: makeFile("src/a.ts"),
      });
      expect(parent).toBeDefined();
      expect(parent!.type).toBe("section");
      expect(parent!.label).toBe("Changed Files");
      expect(parent!.description).toBe("1 files");
    });

    it("returns undefined for file when state has no files", () => {
      mockGetState.mockReturnValue({
        pr: { number: 1, owner: "o", repo: "r", title: "T", headBranch: "main", baseBranch: "dev", url: "", host: "github" },
        isLocalMode: false,
        files: [],
        diff: "",
        summary: null,
        isLoading: false,
        error: null,
      } as ReviewState);
      const parent = provider.getParent({
        type: "file",
        label: "a.ts",
        file: makeFile("src/a.ts"),
      });
      expect(parent).toBeUndefined();
    });

    it("returns file node for comment when file is in state", () => {
      const comment = makeComment({ id: "c1", file: "src/foo.ts" });
      const file = makeFile("src/foo.ts", [comment]);
      mockGetState.mockReturnValue({
        pr: { number: 0, owner: "", repo: "", title: "", headBranch: "", baseBranch: "", url: "", host: "github" as const },
        isLocalMode: false,
        files: [file],
        diff: "",
        summary: null,
        isLoading: false,
        error: null,
      } as ReviewState);
      const parent = provider.getParent({
        type: "comment",
        label: "Some issue",
        comment,
      });
      expect(parent).toBeDefined();
      expect(parent!.type).toBe("file");
      expect(parent!.label).toBe("foo.ts");
      expect(parent!.file).toBe(file);
    });

    it("returns undefined for comment when file not found in state", () => {
      mockGetState.mockReturnValue({
        pr: { number: 1, owner: "o", repo: "r", title: "T", headBranch: "main", baseBranch: "dev", url: "", host: "github" },
        isLocalMode: false,
        files: [],
        diff: "",
        summary: null,
        isLoading: false,
        error: null,
      } as ReviewState);
      const parent = provider.getParent({
        type: "comment",
        label: "Some issue",
        comment: makeComment(),
      });
      expect(parent).toBeUndefined();
    });
  });
});
