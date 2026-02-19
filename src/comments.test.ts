/**
 * Tests for comment markdown sanitization and getThreadState
 */

import { describe, it, expect, vi } from "vitest";
import { sanitizeMarkdownForDisplay } from "./markdown-utils";

vi.mock("vscode", () => ({
  CommentThreadState: { Unresolved: 0, Resolved: 1 },
  CommentMode: { Preview: 0, Editing: 1 },
  EventEmitter: class {
    event = () => ({ dispose: () => {} });
    fire() {}
  },
  comments: { createCommentController: vi.fn() },
  commands: { registerCommand: vi.fn(), executeCommand: vi.fn() },
  workspace: {
    workspaceFolders: [],
    getConfiguration: vi.fn(() => ({ get: () => "hide" })),
  },
  window: { showInformationMessage: vi.fn() },
  Uri: { file: (p: string) => ({ path: p }), joinPath: () => ({}) },
  Range: class {},
  MarkdownString: class {
    isTrusted = false;
    supportHtml = false;
    appendMarkdown() { return this; }
  },
}));

import { getThreadState } from "./comments";
import type { ReviewComment } from "./types";

function makeComment(overrides: Partial<ReviewComment> = {}): ReviewComment {
  return {
    id: "test-1",
    file: "test.ts",
    line: 10,
    side: "RIGHT",
    severity: "medium",
    issue: "Test issue",
    status: "pending",
    source: "ai",
    ...overrides,
  };
}

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

describe("getThreadState", () => {
  it("returns Resolved for hostResolved comments", () => {
    const state = getThreadState(makeComment({ hostResolved: true, source: "host" }));
    expect(state).toBe(1); // CommentThreadState.Resolved
  });

  it("returns Resolved for hostOutdated comments", () => {
    const state = getThreadState(makeComment({ hostOutdated: true, source: "host" }));
    expect(state).toBe(1);
  });

  it("returns Unresolved for pending comments", () => {
    const state = getThreadState(makeComment({ status: "pending" }));
    expect(state).toBe(0); // CommentThreadState.Unresolved
  });

  it("returns Unresolved for locally approved comments (no strikethrough)", () => {
    const state = getThreadState(
      makeComment({ status: "approved", hostResolved: false, hostOutdated: false })
    );
    expect(state).toBe(0);
  });

  it("returns Unresolved for locally rejected comments (no strikethrough)", () => {
    const state = getThreadState(
      makeComment({ status: "rejected", hostResolved: false, hostOutdated: false })
    );
    expect(state).toBe(0);
  });

  it("returns Unresolved when hostResolved and hostOutdated are undefined", () => {
    const state = getThreadState(makeComment());
    expect(state).toBe(0);
  });

  it("returns Resolved when both hostResolved and hostOutdated are true", () => {
    const state = getThreadState(
      makeComment({ hostResolved: true, hostOutdated: true, source: "host" })
    );
    expect(state).toBe(1);
  });
});
