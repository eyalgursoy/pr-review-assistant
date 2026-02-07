/**
 * Tests for review-template
 */

import { describe, it, expect } from "vitest";
import { buildReviewPrompt, REVIEW_TEMPLATE } from "./review-template";

describe("REVIEW_TEMPLATE", () => {
  it("should contain review scope section", () => {
    expect(REVIEW_TEMPLATE).toContain("## Review Scope");
    expect(REVIEW_TEMPLATE).toContain("New Files First");
    expect(REVIEW_TEMPLATE).toContain("Modified Files");
  });

  it("should contain focus areas", () => {
    expect(REVIEW_TEMPLATE).toContain("## Focus Areas");
    expect(REVIEW_TEMPLATE).toContain("Critical Issues");
    expect(REVIEW_TEMPLATE).toContain("Code Quality");
    expect(REVIEW_TEMPLATE).toContain("Performance");
    expect(REVIEW_TEMPLATE).toContain("security"); // lowercase in "security vulnerabilities"
  });

  it("should contain output format instructions", () => {
    expect(REVIEW_TEMPLATE).toContain("## Output Format");
    expect(REVIEW_TEMPLATE).toContain("JSON");
    expect(REVIEW_TEMPLATE).toContain("severity");
  });

  it("should contain constraints", () => {
    expect(REVIEW_TEMPLATE).toContain("## Constraints");
    expect(REVIEW_TEMPLATE).toContain("Do not make code changes");
  });
});

describe("buildReviewPrompt", () => {
  it("should include PR information", () => {
    const prompt = buildReviewPrompt(
      "feature/new-feature",
      "main",
      "Add new feature",
      "diff content here"
    );

    expect(prompt).toContain("## PR Information");
    expect(prompt).toContain("**Title**: Add new feature");
    expect(prompt).toContain("**Branch**: feature/new-feature → main");
  });

  it("should include the review template", () => {
    const prompt = buildReviewPrompt(
      "feature/test",
      "develop",
      "Test PR",
      "some diff"
    );

    expect(prompt).toContain("# Code Review Request");
    expect(prompt).toContain("## Review Scope");
    expect(prompt).toContain("## Focus Areas");
  });

  it("should include code changes section header", () => {
    const prompt = buildReviewPrompt(
      "fix/bug",
      "main",
      "Fix critical bug",
      "the diff"
    );

    expect(prompt).toContain("## Code Changes");
    expect(prompt).toContain("Please review the following diff:");
  });

  it("should handle special characters in PR title", () => {
    const prompt = buildReviewPrompt(
      "feature/test",
      "main",
      "Fix \"quotes\" and <brackets>",
      "diff"
    );

    expect(prompt).toContain("Fix \"quotes\" and <brackets>");
  });

  it("should handle branch names with slashes", () => {
    const prompt = buildReviewPrompt(
      "feature/user/auth/login",
      "develop/v2",
      "Auth feature",
      "diff"
    );

    expect(prompt).toContain("feature/user/auth/login → develop/v2");
  });
});
