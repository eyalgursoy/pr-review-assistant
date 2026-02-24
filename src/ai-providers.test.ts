/**
 * Tests for AI provider schema validation and Cursor CLI model selection
 */

import { describe, it, expect, vi } from "vitest";
import { AIReviewOutputSchema, FindingSchema } from "./ai-review-schema";

vi.mock("vscode", () => ({
  window: {
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    createTreeView: vi.fn(),
    createStatusBarItem: vi.fn(() => ({ show: vi.fn(), dispose: vi.fn() })),
    withProgress: vi.fn(),
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: "/workspace" } }],
    getConfiguration: vi.fn(() => ({
      get: vi.fn((key: string) => {
        if (key === "aiProvider") return "cursor-cli";
        if (key === "aiProviderCursorModel") return "Auto";
        return undefined;
      }),
    })),
  },
  EventEmitter: class EventEmitter {
    event = vi.fn();
    fire = vi.fn();
    dispose = vi.fn();
  },
  StatusBarAlignment: { Left: 1, Right: 2 },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  Uri: { parse: vi.fn() },
  env: { openExternal: vi.fn() },
  commands: { executeCommand: vi.fn() },
}));

import { getEffectiveCursorModelForCLI } from "./ai-providers";

describe("FindingSchema", () => {
  it("should accept valid finding with all fields", () => {
    const result = FindingSchema.safeParse({
      file: "src/foo.ts",
      line: 42,
      side: "RIGHT",
      severity: "high",
      issue: "Missing error handling",
      suggestion: "Add try-catch",
      codeSnippet: "try { ... }",
    });
    expect(result.success).toBe(true);
  });

  it("should coerce line from string to number", () => {
    const result = FindingSchema.safeParse({
      file: "src/foo.ts",
      line: "42",
      issue: "Test",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.line).toBe(42);
    }
  });

  it("should reject line less than 1", () => {
    const result = FindingSchema.safeParse({
      file: "src/foo.ts",
      line: 0,
      issue: "Test",
    });
    expect(result.success).toBe(false);
  });

  it("should reject missing required fields", () => {
    expect(FindingSchema.safeParse({}).success).toBe(false);
    expect(FindingSchema.safeParse({ file: "x" }).success).toBe(false);
    expect(FindingSchema.safeParse({ issue: "x" }).success).toBe(false);
  });
});

describe("AIReviewOutputSchema", () => {
  it("should accept valid JSON with all fields", () => {
    const result = AIReviewOutputSchema.safeParse({
      summary: "Good work!",
      findings: [
        {
          file: "src/api.ts",
          line: 10,
          side: "RIGHT",
          severity: "medium",
          issue: "Consider adding validation",
          suggestion: "Use a schema",
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.summary).toBe("Good work!");
      expect(result.data.findings).toHaveLength(1);
    }
  });

  it("should accept empty findings", () => {
    const result = AIReviewOutputSchema.safeParse({
      summary: "No issues",
      findings: [],
    });
    expect(result.success).toBe(true);
  });

  it("should default findings to empty array when missing", () => {
    const result = AIReviewOutputSchema.safeParse({
      summary: "Done",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.findings).toEqual([]);
    }
  });

  it("should reject when findings is not an array", () => {
    const result = AIReviewOutputSchema.safeParse({
      summary: "Test",
      findings: "not an array",
    });
    expect(result.success).toBe(false);
  });

  it("should reject when findings contains invalid items", () => {
    const result = AIReviewOutputSchema.safeParse({
      summary: "Test",
      findings: [
        { file: "x", line: 1, issue: "ok" },
        { file: "y", line: 0, issue: "invalid line" },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe("getEffectiveCursorModelForCLI", () => {
  it('should return "Auto" when selected is "Auto"', () => {
    const result = getEffectiveCursorModelForCLI("Auto", ["Auto", "gpt-4"]);
    expect(result).toBe("Auto");
  });

  it('should return "Auto" when selected is undefined', () => {
    const result = getEffectiveCursorModelForCLI(undefined, ["Auto"]);
    expect(result).toBe("Auto");
  });

  it("should return the selected model when it is available", () => {
    const result = getEffectiveCursorModelForCLI("gpt-4", ["Auto", "gpt-4"]);
    expect(result).toBe("gpt-4");
  });

  it('should return "Auto" when selected model is not available', () => {
    const result = getEffectiveCursorModelForCLI("gpt-4", ["Auto"]);
    expect(result).toBe("Auto");
  });

  it('should return "Auto" when selected is empty string', () => {
    const result = getEffectiveCursorModelForCLI("", ["Auto", "gpt-4"]);
    expect(result).toBe("Auto");
  });

  it("should return selected model when it exactly matches available model", () => {
    const result = getEffectiveCursorModelForCLI("sonnet-4", [
      "Auto",
      "gpt-5",
      "sonnet-4",
    ]);
    expect(result).toBe("sonnet-4");
  });
});
