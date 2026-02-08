/**
 * Review rules loader and merger
 * Combines base rules with language-specific and framework-specific rules
 */

import type { ProjectContext } from "../project-detector";
import { baseRules } from "./base-rules";
import { typescriptRules } from "./languages/typescript";
import { pythonRules } from "./languages/python";
import { goRules } from "./languages/go";
import { rustRules } from "./languages/rust";
import { reactRules } from "./frameworks/react";
import { expressRules } from "./frameworks/express";
import { djangoRules } from "./frameworks/django";
import { loadCustomRules } from "./custom-rules";

export interface ReviewRuleSet {
  name: string;
  description: string;
  focusAreas: string[];
  antiPatterns: string[];
  bestPractices: string[];
  ignorePatterns?: string[];
  severityExamples?: Partial<
    Record<"critical" | "high" | "medium" | "low", string>
  >;
}

const LANGUAGE_RULES: Record<string, ReviewRuleSet> = {
  typescript: typescriptRules,
  javascript: typescriptRules, // Share TypeScript rules
  python: pythonRules,
  go: goRules,
  rust: rustRules,
};

const FRAMEWORK_RULES: Record<string, ReviewRuleSet> = {
  react: reactRules,
  express: expressRules,
  django: djangoRules,
};

/**
 * Merge multiple rule sets into one
 */
function mergeRuleSets(sets: ReviewRuleSet[]): ReviewRuleSet {
  const merged: ReviewRuleSet = {
    name: "merged",
    description: "Merged rules from multiple sources",
    focusAreas: [],
    antiPatterns: [],
    bestPractices: [],
  };

  const seenFocus = new Set<string>();
  const seenAnti = new Set<string>();
  const seenBest = new Set<string>();

  for (const set of sets) {
    for (const item of set.focusAreas) {
      const key = item.toLowerCase().trim();
      if (!seenFocus.has(key)) {
        seenFocus.add(key);
        merged.focusAreas.push(item);
      }
    }
    for (const item of set.antiPatterns) {
      const key = item.toLowerCase().trim();
      if (!seenAnti.has(key)) {
        seenAnti.add(key);
        merged.antiPatterns.push(item);
      }
    }
    for (const item of set.bestPractices) {
      const key = item.toLowerCase().trim();
      if (!seenBest.has(key)) {
        seenBest.add(key);
        merged.bestPractices.push(item);
      }
    }
    if (set.ignorePatterns?.length) {
      merged.ignorePatterns = [
        ...(merged.ignorePatterns ?? []),
        ...set.ignorePatterns,
      ];
    }
    if (set.severityExamples) {
      merged.severityExamples = {
        ...merged.severityExamples,
        ...set.severityExamples,
      };
    }
  }

  return merged;
}

/**
 * Load and merge rules for the given project context
 */
export async function loadRulesForContext(
  context: ProjectContext,
  workspaceRoot?: string
): Promise<ReviewRuleSet> {
  const sets: ReviewRuleSet[] = [baseRules];

  // Add language rules
  for (const lang of context.languages) {
    const ruleSet = LANGUAGE_RULES[lang];
    if (ruleSet) {
      sets.push(ruleSet);
    }
  }

  // Add framework rules
  for (const fw of context.frameworks) {
    const ruleSet = FRAMEWORK_RULES[fw];
    if (ruleSet) {
      sets.push(ruleSet);
    }
  }

  // Add custom rules from workspace
  const customRules = await loadCustomRules(workspaceRoot ?? context.rootPath);
  if (customRules) {
    sets.push(customRules);
  }

  return mergeRuleSets(sets);
}

/**
 * Format merged rules as prompt text for the AI
 */
export function formatRulesForPrompt(rules: ReviewRuleSet): string {
  const sections: string[] = [];

  if (rules.focusAreas.length > 0) {
    sections.push(
      "## Focus Areas\n\n" +
        rules.focusAreas.map((a) => `- ${a}`).join("\n")
    );
  }

  if (rules.antiPatterns.length > 0) {
    sections.push(
      "## Anti-Patterns to Flag\n\n" +
        rules.antiPatterns.map((a) => `- ${a}`).join("\n")
    );
  }

  if (rules.bestPractices.length > 0) {
    sections.push(
      "## Best Practices\n\n" +
        rules.bestPractices.map((b) => `- ${b}`).join("\n")
    );
  }

  if (rules.ignorePatterns?.length) {
    sections.push(
      "## Do NOT Comment On\n\n" +
        rules.ignorePatterns.map((i) => `- ${i}`).join("\n")
    );
  }

  if (rules.severityExamples && Object.keys(rules.severityExamples).length > 0) {
    const severityLines = Object.entries(rules.severityExamples)
      .map(([level, desc]) => `- **${level}**: ${desc}`)
      .join("\n");
    sections.push("## Severity Guidelines\n\n" + severityLines);
  }

  return sections.join("\n\n");
}
