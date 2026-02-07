/**
 * Tests for AI provider schema validation
 */

import { describe, it, expect } from "vitest";
import { AIReviewOutputSchema, FindingSchema } from "./ai-review-schema";

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
