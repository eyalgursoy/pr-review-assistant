/**
 * Review template - based on PR_REVIEW_TEMPLATE.md
 * Supports project-aware rules for context-specific reviews
 */

import type { ProjectContext } from "./project-detector";
import {
  loadRulesForContext,
  formatRulesForPrompt,
} from "./review-rules";

export const REVIEW_TEMPLATE = `# Code Review Request

As a senior developer, please review the changes in this PR.

## Review Scope

1. **New Files First**: Prioritize review of newly added files/components
2. **Modified Files**: Review significant changes in existing files

## Output Format

Return a JSON object with findings grouped by severity.
For each finding, include:
- File path (exactly as shown in the diff)
- Line number (use NEW file line numbers from the diff, lines starting with +)
- Severity: critical, high, medium, or low
- Description of the issue
- Suggested fix or improvement
- Optional: code snippet showing the fix

## Constraints

- Do not make code changes; only provide recommendations
- Be constructive and specific
- Prioritize actionable feedback
- Only report actual issues, not style preferences`;

/**
 * Build the full prompt with PR info, project-aware rules, and diff
 */
export async function buildReviewPrompt(
  headBranch: string,
  baseBranch: string,
  prTitle: string,
  _diff: string,
  projectContext: ProjectContext,
  workspaceRoot?: string | null
): Promise<string> {
  const rules = await loadRulesForContext(
    projectContext,
    workspaceRoot ?? projectContext.rootPath ?? undefined
  );
  const rulesSection = formatRulesForPrompt(rules);

  return `${REVIEW_TEMPLATE}

---

## Project Context

Detected: ${projectContext.projectType} project${projectContext.languages.length ? `, languages: ${projectContext.languages.join(", ")}` : ""}${projectContext.frameworks.length ? `, frameworks: ${projectContext.frameworks.join(", ")}` : ""}

${rulesSection}

---

## PR Information

- **Title**: ${prTitle}
- **Branch**: ${headBranch} → ${baseBranch}

## Code Changes

Please review the following diff:`;
}
