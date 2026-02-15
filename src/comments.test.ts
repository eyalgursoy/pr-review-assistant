/**
 * Tests for comment markdown sanitization and comment command handlers
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { sanitizeMarkdownForDisplay } from "./markdown-utils";

describe("sanitizeMarkdownForDisplay", () => {
  it("should escape HTML entities", () => {
    expect(sanitizeMarkdownForDisplay("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;"
    );
    expect(sanitizeMarkdownForDisplay("a & b")).toBe("a &amp; b");
  });

  it("should remove javascript: links", () => {
    const input = "Click [here](javascript:alert('xss'))";
    expect(sanitizeMarkdownForDisplay(input)).toContain("[here](#)");
    expect(sanitizeMarkdownForDisplay(input)).not.toContain("javascript:");
  });

  it("should remove data: links", () => {
    const input = "See [image](data:text/html,<script>alert(1)</script>)";
    expect(sanitizeMarkdownForDisplay(input)).toContain("[image](#)");
    expect(sanitizeMarkdownForDisplay(input)).not.toContain("data:");
  });

  it("should strip control characters", () => {
    expect(sanitizeMarkdownForDisplay("hello\x00world")).toContain("hello");
    expect(sanitizeMarkdownForDisplay("a\nb")).toContain("a b");
  });

  it("should return empty string for empty input", () => {
    expect(sanitizeMarkdownForDisplay("")).toBe("");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(sanitizeMarkdownForDisplay(null as any)).toBe("");
  });

  it("should preserve safe content", () => {
    const input = "Normal **bold** text with `code`";
    expect(sanitizeMarkdownForDisplay(input)).toBe(input);
  });
});

const commandHandlers: Record<string, (...args: unknown[]) => void> = {};
const mockShowInformationMessage = vi.fn();
const mockUpdateCommentStatus = vi.fn();

vi.mock("vscode", () => ({
  commands: {
    registerCommand: (id: string, handler: (...args: unknown[]) => void) => {
      commandHandlers[id] = handler;
      return { dispose: vi.fn() };
    },
  },
  window: {
    showInformationMessage: (...args: unknown[]) =>
      mockShowInformationMessage(...args),
  },
}));

vi.mock("./state", () => ({
  updateCommentStatus: (...args: unknown[]) => mockUpdateCommentStatus(...args),
  onStateChange: () => ({ dispose: vi.fn() }),
  updateCommentText: vi.fn(),
  getAllComments: vi.fn(() => []),
  getDisplayComments: vi.fn(() => []),
  getReplies: vi.fn(() => []),
}));

vi.mock("./logger", () => ({ log: vi.fn() }));

describe("registerCommentCommands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(commandHandlers).forEach((k) => delete commandHandlers[k]);
  });

  const createMockContext = () => ({ subscriptions: [] as { dispose(): void }[] });

  const makeReviewComment = (
    overrides: Partial<{ id: string; outdated: boolean; resolved: boolean }> = {}
  ) => ({
    id: "comment-1",
    file: "src/a.ts",
    line: 1,
    side: "RIGHT" as const,
    severity: "medium" as const,
    issue: "Test issue",
    status: "pending" as const,
    outdated: false,
    resolved: false,
    ...overrides,
  });

  it("approve: calls updateCommentStatus with comment id when arg is PRReviewComment", async () => {
    const { registerCommentCommands } = await import("./comments");
    registerCommentCommands(createMockContext());

    const reviewComment = makeReviewComment({ id: "my-id" });
    const arg = { id: "my-id", reviewComment };
    commandHandlers["prReview.comment.approve"]!(arg);

    expect(mockUpdateCommentStatus).toHaveBeenCalledWith("my-id", "approved");
    expect(mockShowInformationMessage).toHaveBeenCalledWith("Comment approved ✓");
  });

  it("approve: uses reviewComment.id when arg is CommentThread (comments[0])", async () => {
    const { registerCommentCommands } = await import("./comments");
    registerCommentCommands(createMockContext());

    const reviewComment = makeReviewComment({ id: "thread-root-id" });
    const arg = { comments: [{ id: "thread-root-id", reviewComment }] };
    commandHandlers["prReview.comment.approve"]!(arg);

    expect(mockUpdateCommentStatus).toHaveBeenCalledWith(
      "thread-root-id",
      "approved"
    );
  });

  it("approve: does not call updateCommentStatus when comment is outdated", async () => {
    const { registerCommentCommands } = await import("./comments");
    registerCommentCommands(createMockContext());

    const reviewComment = makeReviewComment({ id: "x", outdated: true });
    const arg = { id: "x", reviewComment };
    commandHandlers["prReview.comment.approve"]!(arg);

    expect(mockUpdateCommentStatus).not.toHaveBeenCalled();
    expect(mockShowInformationMessage).toHaveBeenCalledWith(
      "This comment is outdated or resolved and cannot be changed."
    );
  });

  it("approve: does not call updateCommentStatus when comment is resolved", async () => {
    const { registerCommentCommands } = await import("./comments");
    registerCommentCommands(createMockContext());

    const reviewComment = makeReviewComment({ id: "x", resolved: true });
    const arg = { id: "x", reviewComment };
    commandHandlers["prReview.comment.approve"]!(arg);

    expect(mockUpdateCommentStatus).not.toHaveBeenCalled();
    expect(mockShowInformationMessage).toHaveBeenCalledWith(
      "This comment is outdated or resolved and cannot be changed."
    );
  });

  it("approve: does nothing when reviewComment is undefined (e.g. empty thread)", async () => {
    const { registerCommentCommands } = await import("./comments");
    registerCommentCommands(createMockContext());

    const arg = { comments: [] };
    commandHandlers["prReview.comment.approve"]!(arg);

    expect(mockUpdateCommentStatus).not.toHaveBeenCalled();
    expect(mockShowInformationMessage).not.toHaveBeenCalled();
  });

  it("reject: calls updateCommentStatus with comment id when arg is PRReviewComment", async () => {
    const { registerCommentCommands } = await import("./comments");
    registerCommentCommands(createMockContext());

    const reviewComment = makeReviewComment({ id: "reject-id" });
    const arg = { id: "reject-id", reviewComment };
    commandHandlers["prReview.comment.reject"]!(arg);

    expect(mockUpdateCommentStatus).toHaveBeenCalledWith(
      "reject-id",
      "rejected"
    );
    expect(mockShowInformationMessage).toHaveBeenCalledWith(
      "Comment rejected ✗"
    );
  });

  it("reject: does not call updateCommentStatus when comment is outdated", async () => {
    const { registerCommentCommands } = await import("./comments");
    registerCommentCommands(createMockContext());

    const reviewComment = makeReviewComment({ id: "x", outdated: true });
    const arg = { id: "x", reviewComment };
    commandHandlers["prReview.comment.reject"]!(arg);

    expect(mockUpdateCommentStatus).not.toHaveBeenCalled();
    expect(mockShowInformationMessage).toHaveBeenCalledWith(
      "This comment is outdated or resolved and cannot be changed."
    );
  });
});
