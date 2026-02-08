/**
 * Tests for review-template
 */

import { describe, it, expect, vi } from "vitest";

// Mock vscode before importing review-template (which pulls in review-rules/custom-rules)
vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn(() => ""),
    })),
    workspaceFolders: [],
  },
}));
import { buildReviewPrompt, REVIEW_TEMPLATE } from "./review-template";
import type { ProjectContext } from "./project-detector";

const minimalContext: ProjectContext = {
  projectType: "unknown",
  languages: [],
  frameworks: [],
  isMonorepo: false,
  rootPath: null,
};

describe("REVIEW_TEMPLATE", () => {
  it("should contain review scope section", () => {
    expect(REVIEW_TEMPLATE).toContain("## Review Scope");
    expect(REVIEW_TEMPLATE).toContain("New Files First");
    expect(REVIEW_TEMPLATE).toContain("Modified Files");
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
  it("should include PR information", async () => {
    const prompt = await buildReviewPrompt(
      "feature/new-feature",
      "main",
      "Add new feature",
      "diff content here",
      minimalContext
    );

    expect(prompt).toContain("## PR Information");
    expect(prompt).toContain("**Title**: Add new feature");
    expect(prompt).toContain("**Branch**: feature/new-feature → main");
  });

  it("should include the review template", async () => {
    const prompt = await buildReviewPrompt(
      "feature/test",
      "develop",
      "Test PR",
      "some diff",
      minimalContext
    );

    expect(prompt).toContain("# Code Review Request");
    expect(prompt).toContain("## Review Scope");
    expect(prompt).toContain("## Focus Areas");
  });

  it("should include code changes section header", async () => {
    const prompt = await buildReviewPrompt(
      "fix/bug",
      "main",
      "Fix critical bug",
      "the diff",
      minimalContext
    );

    expect(prompt).toContain("## Code Changes");
    expect(prompt).toContain("Please review the following diff:");
  });

  it("should handle special characters in PR title", async () => {
    const prompt = await buildReviewPrompt(
      "feature/test",
      "main",
      "Fix \"quotes\" and <brackets>",
      "diff",
      minimalContext
    );

    expect(prompt).toContain("Fix \"quotes\" and <brackets>");
  });

  it("should handle branch names with slashes", async () => {
    const prompt = await buildReviewPrompt(
      "feature/user/auth/login",
      "develop/v2",
      "Auth feature",
      "diff",
      minimalContext
    );

    expect(prompt).toContain("feature/user/auth/login → develop/v2");
  });

  it("should include project context section", async () => {
    const prompt = await buildReviewPrompt(
      "feature/test",
      "main",
      "Test",
      "diff",
      minimalContext
    );

    expect(prompt).toContain("## Project Context");
  });
});
