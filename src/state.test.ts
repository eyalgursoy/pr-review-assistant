/**
 * Tests for state management
 * Note: Some functions use vscode.commands which we mock
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

let mockShowResolvedOrOutdated = "hide";

// Mock vscode before importing state
vi.mock("vscode", () => ({
  EventEmitter: class {
    private listeners: Array<(data: unknown) => void> = [];
    event = (listener: (data: unknown) => void) => {
      this.listeners.push(listener);
      return { dispose: () => {} };
    };
    fire(data: unknown) {
      this.listeners.forEach((l) => l(data));
    }
  },
  commands: {
    executeCommand: vi.fn(),
  },
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: (_key: string, defaultValue: string) => mockShowResolvedOrOutdated ?? defaultValue,
    })),
  },
}));

import {
  getState,
  resetState,
  setPRInfo,
  setLocalMode,
  setFiles,
  setDiff,
  setLoading,
  setError,
  setSummary,
  getSummary,
  addComments,
  updateCommentStatus,
  updateCommentText,
  getAllComments,
  getApprovedComments,
  getPendingComments,
  getRejectedComments,
  allCommentsReviewed,
  allCommentsRejected,
  getCommentsForFile,
  getDisplayComments,
  getDisplayCommentsForFile,
  deduplicateComments,
  clearAIComments,
} from "./state";
import type { PRInfo, ChangedFile, ReviewComment } from "./types";

describe("state", () => {
  beforeEach(() => {
    resetState();
  });

  describe("initial state", () => {
    it("should have null PR info", () => {
      const state = getState();
      expect(state.pr).toBeNull();
    });

    it("should have empty files array", () => {
      const state = getState();
      expect(state.files).toEqual([]);
    });

    it("should not be loading", () => {
      const state = getState();
      expect(state.isLoading).toBe(false);
    });

    it("should have no error", () => {
      const state = getState();
      expect(state.error).toBeNull();
    });
  });

  describe("setPRInfo", () => {
    it("should set PR info", () => {
      const pr: PRInfo = {
        number: 123,
        owner: "octocat",
        repo: "hello-world",
        title: "Test PR",
        headBranch: "feature",
        baseBranch: "main",
        url: "https://github.com/octocat/hello-world/pull/123",
        host: "github",
      };

      setPRInfo(pr);
      const state = getState();

      expect(state.pr).toEqual(pr);
      expect(state.isLocalMode).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe("setLocalMode", () => {
    it("should set local mode with synthetic PR info", () => {
      setLocalMode("feature/test", "main");
      const state = getState();

      expect(state.isLocalMode).toBe(true);
      expect(state.pr).not.toBeNull();
      expect(state.pr?.number).toBe(0);
      expect(state.pr?.title).toBe("Local Review");
      expect(state.pr?.headBranch).toBe("feature/test");
      expect(state.pr?.baseBranch).toBe("main");
    });
  });

  describe("setFiles", () => {
    it("should set changed files", () => {
      const files: ChangedFile[] = [
        { path: "src/index.ts", status: "modified", additions: 10, deletions: 5, comments: [] },
        { path: "src/new.ts", status: "added", additions: 50, deletions: 0, comments: [] },
      ];

      setFiles(files);
      const state = getState();

      expect(state.files).toHaveLength(2);
      expect(state.files[0].path).toBe("src/index.ts");
      expect(state.files[1].status).toBe("added");
    });
  });

  describe("setDiff", () => {
    it("should set diff content", () => {
      setDiff("diff --git a/file.ts b/file.ts\n...");
      const state = getState();

      expect(state.diff).toContain("diff --git");
    });
  });

  describe("setLoading", () => {
    it("should set loading state", () => {
      setLoading(true);
      expect(getState().isLoading).toBe(true);

      setLoading(false);
      expect(getState().isLoading).toBe(false);
    });
  });

  describe("setError", () => {
    it("should set error and clear loading", () => {
      setLoading(true);
      setError("Something went wrong");

      const state = getState();
      expect(state.error).toBe("Something went wrong");
      expect(state.isLoading).toBe(false);
    });

    it("should clear error when set to null", () => {
      setError("Error");
      setError(null);

      expect(getState().error).toBeNull();
    });
  });

  describe("summary", () => {
    it("should set and get summary", () => {
      expect(getSummary()).toBeNull();

      setSummary("This PR adds new features");
      expect(getSummary()).toBe("This PR adds new features");

      setSummary(null);
      expect(getSummary()).toBeNull();
    });
  });

  describe("comments", () => {
    const createComment = (id: string, file: string, status: "pending" | "approved" | "rejected" = "pending"): ReviewComment => ({
      id,
      file,
      line: 10,
      side: "RIGHT",
      severity: "medium",
      issue: `Issue ${id}`,
      status,
      source: "ai",
    });

    beforeEach(() => {
      setFiles([
        { path: "src/a.ts", status: "modified", additions: 5, deletions: 2, comments: [] },
        { path: "src/b.ts", status: "modified", additions: 3, deletions: 1, comments: [] },
      ]);
    });

    describe("addComments", () => {
      it("should add comments to existing files", () => {
        addComments([
          createComment("1", "src/a.ts"),
          createComment("2", "src/a.ts"),
          createComment("3", "src/b.ts"),
        ]);

        expect(getAllComments()).toHaveLength(3);
        expect(getCommentsForFile("src/a.ts")).toHaveLength(2);
        expect(getCommentsForFile("src/b.ts")).toHaveLength(1);
      });

      it("should create file entry for comments on unknown files", () => {
        addComments([createComment("1", "src/new.ts")]);

        expect(getCommentsForFile("src/new.ts")).toHaveLength(1);
      });
    });

    describe("updateCommentStatus", () => {
      it("should update comment status", () => {
        addComments([createComment("1", "src/a.ts")]);

        updateCommentStatus("1", "approved");
        expect(getAllComments()[0].status).toBe("approved");

        updateCommentStatus("1", "rejected");
        expect(getAllComments()[0].status).toBe("rejected");
      });
    });

    describe("updateCommentText", () => {
      it("should update comment text", () => {
        addComments([createComment("1", "src/a.ts")]);

        updateCommentText("1", "Edited comment text");
        expect(getAllComments()[0].editedText).toBe("Edited comment text");
      });
    });

    describe("getApprovedComments", () => {
      it("should return only approved comments", () => {
        addComments([
          createComment("1", "src/a.ts", "approved"),
          createComment("2", "src/a.ts", "pending"),
          createComment("3", "src/b.ts", "approved"),
        ]);

        const approved = getApprovedComments();
        expect(approved).toHaveLength(2);
        expect(approved.every((c) => c.status === "approved")).toBe(true);
      });
    });

    describe("getPendingComments", () => {
      it("should return only pending comments", () => {
        addComments([
          createComment("1", "src/a.ts", "approved"),
          createComment("2", "src/a.ts", "pending"),
          createComment("3", "src/b.ts", "pending"),
        ]);

        const pending = getPendingComments();
        expect(pending).toHaveLength(2);
        expect(pending.every((c) => c.status === "pending")).toBe(true);
      });
    });

    describe("getRejectedComments", () => {
      it("should return only rejected comments", () => {
        addComments([
          createComment("1", "src/a.ts", "rejected"),
          createComment("2", "src/a.ts", "pending"),
          createComment("3", "src/b.ts", "rejected"),
        ]);

        const rejected = getRejectedComments();
        expect(rejected).toHaveLength(2);
        expect(rejected.every((c) => c.status === "rejected")).toBe(true);
      });
    });

    describe("allCommentsReviewed", () => {
      it("should return false when no comments", () => {
        expect(allCommentsReviewed()).toBe(false);
      });

      it("should return false when some comments are pending", () => {
        addComments([
          createComment("1", "src/a.ts", "approved"),
          createComment("2", "src/a.ts", "pending"),
        ]);

        expect(allCommentsReviewed()).toBe(false);
      });

      it("should return true when all comments are reviewed", () => {
        addComments([
          createComment("1", "src/a.ts", "approved"),
          createComment("2", "src/a.ts", "rejected"),
        ]);

        expect(allCommentsReviewed()).toBe(true);
      });
    });

    describe("allCommentsRejected", () => {
      it("should return false when no comments", () => {
        expect(allCommentsRejected()).toBe(false);
      });

      it("should return false when some comments are not rejected", () => {
        addComments([
          createComment("1", "src/a.ts", "rejected"),
          createComment("2", "src/a.ts", "approved"),
        ]);

        expect(allCommentsRejected()).toBe(false);
      });

      it("should return true when all comments are rejected", () => {
        addComments([
          createComment("1", "src/a.ts", "rejected"),
          createComment("2", "src/b.ts", "rejected"),
        ]);

        expect(allCommentsRejected()).toBe(true);
      });
    });

    describe("getCommentsForFile", () => {
      it("should return comments for specific file", () => {
        addComments([
          createComment("1", "src/a.ts"),
          createComment("2", "src/a.ts"),
          createComment("3", "src/b.ts"),
        ]);

        expect(getCommentsForFile("src/a.ts")).toHaveLength(2);
        expect(getCommentsForFile("src/b.ts")).toHaveLength(1);
      });

      it("should return empty array for file with no comments", () => {
        expect(getCommentsForFile("src/nonexistent.ts")).toEqual([]);
      });
    });

    describe("getDisplayComments", () => {
      beforeEach(() => {
        mockShowResolvedOrOutdated = "hide";
      });

      it("excludes hostResolved comments when setting is hide", () => {
        addComments([
          { ...createComment("1", "src/a.ts"), source: "host", hostResolved: false },
          { ...createComment("2", "src/a.ts"), source: "host", hostResolved: true },
        ]);
        const display = getDisplayComments();
        expect(display).toHaveLength(1);
        expect(display[0].id).toBe("1");
      });

      it("excludes hostOutdated comments when setting is hide", () => {
        addComments([
          { ...createComment("1", "src/a.ts"), source: "host", hostOutdated: false },
          { ...createComment("2", "src/a.ts"), source: "host", hostOutdated: true },
        ]);
        const display = getDisplayComments();
        expect(display).toHaveLength(1);
        expect(display[0].id).toBe("1");
      });

      it("includes all comments when setting is show", () => {
        mockShowResolvedOrOutdated = "show";
        addComments([
          { ...createComment("1", "src/a.ts"), source: "host", hostResolved: true },
          { ...createComment("2", "src/a.ts"), source: "host", hostOutdated: true },
        ]);
        const display = getDisplayComments();
        expect(display).toHaveLength(2);
      });

      it("never filters AI comments", () => {
        addComments([
          createComment("1", "src/a.ts"),
          { ...createComment("2", "src/a.ts"), source: "host", hostResolved: true },
        ]);
        const display = getDisplayComments();
        expect(display).toHaveLength(1);
        expect(display[0].source).toBe("ai");
      });

      it("keeps comments with undefined hostResolved/hostOutdated", () => {
        addComments([
          createComment("1", "src/a.ts"),
          createComment("2", "src/b.ts"),
        ]);
        const display = getDisplayComments();
        expect(display).toHaveLength(2);
      });
    });

    describe("getDisplayCommentsForFile", () => {
      beforeEach(() => {
        mockShowResolvedOrOutdated = "hide";
      });

      it("excludes hostResolved comments for a specific file when setting is hide", () => {
        addComments([
          { ...createComment("1", "src/a.ts"), source: "host", hostResolved: false },
          { ...createComment("2", "src/a.ts"), source: "host", hostResolved: true },
          { ...createComment("3", "src/b.ts"), source: "host", hostResolved: true },
        ]);
        expect(getDisplayCommentsForFile("src/a.ts")).toHaveLength(1);
        expect(getDisplayCommentsForFile("src/b.ts")).toHaveLength(0);
      });

      it("excludes hostOutdated comments for a specific file when setting is hide", () => {
        addComments([
          { ...createComment("1", "src/a.ts"), source: "host", hostOutdated: true },
          { ...createComment("2", "src/a.ts"), source: "host", hostOutdated: false },
        ]);
        expect(getDisplayCommentsForFile("src/a.ts")).toHaveLength(1);
        expect(getDisplayCommentsForFile("src/a.ts")[0].id).toBe("2");
      });

      it("includes all comments for a specific file when setting is show", () => {
        mockShowResolvedOrOutdated = "show";
        addComments([
          { ...createComment("1", "src/a.ts"), source: "host", hostResolved: true },
          { ...createComment("2", "src/a.ts"), source: "host", hostOutdated: true },
        ]);
        expect(getDisplayCommentsForFile("src/a.ts")).toHaveLength(2);
      });

      it("returns empty array for file with no comments", () => {
        expect(getDisplayCommentsForFile("src/nonexistent.ts")).toEqual([]);
      });
    });
  });

  describe("deduplicateComments", () => {
    const make = (id: string, file: string, line: number): ReviewComment => ({
      id,
      file,
      line,
      side: "RIGHT",
      severity: "medium",
      issue: `Issue ${id}`,
      status: "pending",
      source: "ai",
    });

    it("returns all incoming when no existing comments", () => {
      const incoming = [make("1", "src/a.ts", 5), make("2", "src/b.ts", 10)];
      const result = deduplicateComments(incoming, []);
      expect(result).toHaveLength(2);
      expect(result).toEqual(incoming);
    });

    it("filters comment with exact same file and line", () => {
      const existing = [make("e1", "src/foo.ts", 10)];
      const incoming = [make("i1", "src/foo.ts", 10)];
      const result = deduplicateComments(incoming, existing);
      expect(result).toHaveLength(0);
    });

    it("filters comment within ±1 line tolerance", () => {
      const existing = [make("e1", "src/foo.ts", 10)];
      expect(deduplicateComments([make("i1", "src/foo.ts", 9)], existing)).toHaveLength(0);
      expect(deduplicateComments([make("i1", "src/foo.ts", 11)], existing)).toHaveLength(0);
    });

    it("keeps comment on different file, same line", () => {
      const existing = [make("e1", "src/a.ts", 10)];
      const incoming = [make("i1", "src/b.ts", 10)];
      const result = deduplicateComments(incoming, existing);
      expect(result).toHaveLength(1);
      expect(result[0]!.file).toBe("src/b.ts");
    });

    it("keeps comment on same file when line difference is greater than 1", () => {
      const existing = [make("e1", "src/foo.ts", 10)];
      const incoming = [make("i1", "src/foo.ts", 12)];
      const result = deduplicateComments(incoming, existing);
      expect(result).toHaveLength(1);
      expect(result[0]!.line).toBe(12);
    });
  });

  describe("clearAIComments", () => {
    const make = (id: string, file: string, source: "ai" | "host"): ReviewComment => ({
      id,
      file,
      line: 10,
      side: "RIGHT",
      severity: "medium",
      issue: `Issue ${id}`,
      status: "pending",
      source,
    });

    it("removes all source ai comments", () => {
      setFiles([
        { path: "src/a.ts", status: "modified", additions: 0, deletions: 0, comments: [] },
        { path: "src/b.ts", status: "modified", additions: 0, deletions: 0, comments: [] },
      ]);
      addComments([make("ai1", "src/a.ts", "ai"), make("ai2", "src/b.ts", "ai")]);
      expect(getAllComments()).toHaveLength(2);
      clearAIComments();
      expect(getAllComments()).toHaveLength(0);
    });

    it("preserves all source host comments", () => {
      setFiles([{ path: "src/a.ts", status: "modified", additions: 0, deletions: 0, comments: [] }]);
      addComments([make("h1", "src/a.ts", "host"), make("ai1", "src/a.ts", "ai")]);
      clearAIComments();
      const comments = getAllComments();
      expect(comments).toHaveLength(1);
      expect(comments[0]!.source).toBe("host");
      expect(comments[0]!.id).toBe("h1");
    });

    it("on empty state does not throw", () => {
      expect(() => clearAIComments()).not.toThrow();
    });

    it("prunes file entries with no remaining comments", () => {
      setFiles([
        { path: "src/ai-only.ts", status: "modified", additions: 0, deletions: 0, comments: [] },
        { path: "src/mixed.ts", status: "modified", additions: 0, deletions: 0, comments: [] },
      ]);
      addComments([
        make("ai1", "src/ai-only.ts", "ai"),
        make("ai2", "src/mixed.ts", "ai"),
        make("h1", "src/mixed.ts", "host"),
      ]);
      clearAIComments();
      const files = getState().files;
      expect(files).toHaveLength(1);
      expect(files[0]!.path).toBe("src/mixed.ts");
      expect(files[0]!.comments).toHaveLength(1);
    });
  });

  describe("resetState", () => {
    it("should reset all state to initial values", () => {
      setPRInfo({
        number: 1,
        owner: "test",
        repo: "test",
        title: "Test",
        headBranch: "feature",
        baseBranch: "main",
        url: "http://test",
        host: "github",
      });
      setFiles([{ path: "test.ts", status: "modified", additions: 1, deletions: 0, comments: [] }]);
      setDiff("diff");
      setLoading(true);
      setError("error");
      setSummary("summary");

      resetState();
      const state = getState();

      expect(state.pr).toBeNull();
      expect(state.files).toEqual([]);
      expect(state.diff).toBe("");
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.summary).toBeNull();
    });
  });
});
