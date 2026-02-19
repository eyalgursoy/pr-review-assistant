/**
 * Tests for CodeLens provider and decorations filtering
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetDisplayCommentsForFile = vi.fn();

vi.mock("vscode", () => ({
  EventEmitter: class {
    event = () => ({ dispose: () => {} });
    fire() {}
  },
  CodeLens: class {
    constructor(
      public range: unknown,
      public command: { title: string; command: string; arguments: unknown[] }
    ) {}
  },
  Range: class {
    constructor(
      public startLine: number,
      public startChar: number,
      public endLine: number,
      public endChar: number
    ) {}
  },
  MarkdownString: class {
    constructor(public value: string) {}
  },
  OverviewRulerLane: { Left: 1 },
  workspace: {
    getWorkspaceFolder: vi.fn(() => ({ uri: { fsPath: "/workspace" } })),
    asRelativePath: vi.fn((uri: { fsPath?: string }) => uri.fsPath ?? "test.ts"),
    getConfiguration: vi.fn(() => ({ get: () => "hide" })),
  },
  window: {
    createTextEditorDecorationType: vi.fn(() => ({
      dispose: () => {},
    })),
  },
}));

vi.mock("./state", () => ({
  getDisplayCommentsForFile: (...args: unknown[]) =>
    mockGetDisplayCommentsForFile(...args),
  onStateChange: () => ({ dispose: () => {} }),
}));

vi.mock("./markdown-utils", () => ({
  sanitizeMarkdownForDisplay: (s: string) => s,
}));

import type { ReviewComment } from "./types";
import { buildCodeLensTitle, ReviewCodeLensProvider } from "./codelens";

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

describe("buildCodeLensTitle", () => {
  it("shows [New] prefix for AI comments", () => {
    const title = buildCodeLensTitle(makeComment({ source: "ai" }));
    expect(title).toContain("[New]");
  });

  it("does not show [New] for host comments", () => {
    const title = buildCodeLensTitle(makeComment({ source: "host" }));
    expect(title).not.toContain("[New]");
  });

  it("includes severity emoji for medium", () => {
    const title = buildCodeLensTitle(makeComment({ severity: "medium" }));
    expect(title).toContain("🟡");
  });

  it("includes severity emoji for critical", () => {
    const title = buildCodeLensTitle(makeComment({ severity: "critical" }));
    expect(title).toContain("🔴");
  });

  it("includes status icon for pending", () => {
    const title = buildCodeLensTitle(makeComment({ status: "pending" }));
    expect(title).toContain("○");
  });

  it("includes status icon for approved", () => {
    const title = buildCodeLensTitle(makeComment({ status: "approved" }));
    expect(title).toContain("✓");
  });

  it("includes status icon for rejected", () => {
    const title = buildCodeLensTitle(makeComment({ status: "rejected" }));
    expect(title).toContain("✗");
  });

  it("includes the issue text", () => {
    const title = buildCodeLensTitle(makeComment({ issue: "Null pointer risk" }));
    expect(title).toContain("Null pointer risk");
  });

  it("truncates long issue text to 80 chars", () => {
    const longIssue = "a".repeat(100);
    const title = buildCodeLensTitle(makeComment({ issue: longIssue }));
    expect(title).toContain("...");
    const issuePart = title.split(" ").slice(2).join(" ");
    expect(issuePart.length).toBeLessThanOrEqual(80 + "[New] ".length);
  });
});

describe("ReviewCodeLensProvider.provideCodeLenses", () => {
  let provider: ReviewCodeLensProvider;

  beforeEach(() => {
    mockGetDisplayCommentsForFile.mockReset();
    provider = new ReviewCodeLensProvider();
  });

  it("returns empty array when no comments", () => {
    mockGetDisplayCommentsForFile.mockReturnValue([]);
    const document = {
      uri: { fsPath: "src/foo.ts" },
      lineCount: 100,
    } as unknown as import("vscode").TextDocument;

    const lenses = provider.provideCodeLenses(document);
    expect(lenses).toHaveLength(0);
  });

  it("returns one lens per comment", () => {
    mockGetDisplayCommentsForFile.mockReturnValue([
      makeComment({ id: "c1", line: 5 }),
      makeComment({ id: "c2", line: 10 }),
    ]);
    const document = {
      uri: { fsPath: "src/foo.ts" },
      lineCount: 100,
    } as unknown as import("vscode").TextDocument;

    const lenses = provider.provideCodeLenses(document);
    expect(lenses).toHaveLength(2);
  });

  it("uses getDisplayCommentsForFile (excludes hostResolved when filtered)", () => {
    // getDisplayCommentsForFile already returns filtered results — simulate it returning nothing
    // for a file with only hostResolved comments (the filter is applied in state.ts)
    mockGetDisplayCommentsForFile.mockReturnValue([]);
    const document = {
      uri: { fsPath: "src/foo.ts" },
      lineCount: 100,
    } as unknown as import("vscode").TextDocument;

    const lenses = provider.provideCodeLenses(document);
    expect(lenses).toHaveLength(0);
    expect(mockGetDisplayCommentsForFile).toHaveBeenCalled();
  });

  it("shows [New] in title for AI comments", () => {
    mockGetDisplayCommentsForFile.mockReturnValue([
      makeComment({ source: "ai", issue: "AI comment" }),
    ]);
    const document = {
      uri: { fsPath: "src/foo.ts" },
      lineCount: 100,
    } as unknown as import("vscode").TextDocument;

    const lenses = provider.provideCodeLenses(document);
    const title0 = (lenses[0]!.command as { title: string }).title;
    expect(title0).toContain("[New]");
  });

  it("does not show [New] in title for host comments", () => {
    mockGetDisplayCommentsForFile.mockReturnValue([
      makeComment({ source: "host", issue: "Host comment" }),
    ]);
    const document = {
      uri: { fsPath: "src/foo.ts" },
      lineCount: 100,
    } as unknown as import("vscode").TextDocument;

    const lenses = provider.provideCodeLenses(document);
    const title0 = (lenses[0]!.command as { title: string }).title;
    expect(title0).not.toContain("[New]");
  });

  it("clamps line to document bounds", () => {
    mockGetDisplayCommentsForFile.mockReturnValue([
      makeComment({ line: 999 }),
    ]);
    const document = {
      uri: { fsPath: "src/foo.ts" },
      lineCount: 10,
    } as unknown as import("vscode").TextDocument;

    const lenses = provider.provideCodeLenses(document);
    expect(lenses).toHaveLength(1);
    // Line should be clamped to lineCount - 1 = 9
    const range = lenses[0]!.range as unknown as { startLine: number };
    expect(range.startLine).toBe(9);
  });
});
