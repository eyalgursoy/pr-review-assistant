/**
 * Tests for review rules loading and formatting
 */

import { describe, it, expect, vi } from "vitest";

// Mock vscode before importing
vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn((key: string) => (key === "customRulesPath" ? "" : "")),
    })),
  },
}));

import {
  loadRulesForContext,
  formatRulesForPrompt,
  type ReviewRuleSet,
} from "./review-rules";
import type { ProjectContext } from "./project-detector";

const minimalContext: ProjectContext = {
  projectType: "unknown",
  languages: [],
  frameworks: [],
  isMonorepo: false,
  rootPath: null,
};

describe("loadRulesForContext", () => {
  it("should return base rules for unknown project", async () => {
    const rules = await loadRulesForContext(minimalContext);
    expect(rules.name).toBe("merged");
    expect(rules.focusAreas.length).toBeGreaterThan(0);
    expect(rules.antiPatterns.length).toBeGreaterThan(0);
    expect(rules.bestPractices.length).toBeGreaterThan(0);
  });

  it("should include TypeScript rules when language is typescript", async () => {
    const context: ProjectContext = {
      ...minimalContext,
      languages: ["typescript"],
    };
    const rules = await loadRulesForContext(context);
    const focusText = rules.focusAreas.join(" ");
    expect(focusText).toContain("Type");
    expect(focusText).toContain("async");
  });

  it("should include React rules when framework is react", async () => {
    const context: ProjectContext = {
      ...minimalContext,
      languages: ["typescript"],
      frameworks: ["react"],
    };
    const rules = await loadRulesForContext(context);
    const focusText = rules.focusAreas.join(" ");
    expect(focusText).toContain("Hook");
    expect(focusText).toContain("component");
  });
});

describe("formatRulesForPrompt", () => {
  it("should format rules as markdown sections", () => {
    const rules: ReviewRuleSet = {
      name: "test",
      description: "Test rules",
      focusAreas: ["Area 1", "Area 2"],
      antiPatterns: ["Anti 1"],
      bestPractices: ["Best 1"],
    };
    const formatted = formatRulesForPrompt(rules);
    expect(formatted).toContain("## Focus Areas");
    expect(formatted).toContain("Area 1");
    expect(formatted).toContain("## Anti-Patterns to Flag");
    expect(formatted).toContain("Anti 1");
    expect(formatted).toContain("## Best Practices");
    expect(formatted).toContain("Best 1");
  });

  it("should include severity examples when present", () => {
    const rules: ReviewRuleSet = {
      name: "test",
      description: "Test",
      focusAreas: [],
      antiPatterns: [],
      bestPractices: [],
      severityExamples: { critical: "Security issues" },
    };
    const formatted = formatRulesForPrompt(rules);
    expect(formatted).toContain("## Severity Guidelines");
    expect(formatted).toContain("critical");
    expect(formatted).toContain("Security issues");
  });
});
