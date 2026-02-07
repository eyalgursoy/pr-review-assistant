/**
 * Review template - based on PR_REVIEW_TEMPLATE.md
 */

export const REVIEW_TEMPLATE = `# Code Review Request

As a senior developer, please review the changes in this PR.

## Review Scope

1. **New Files First**: Prioritize review of newly added files/components
2. **Modified Files**: Review significant changes in existing files

## Focus Areas

- **Critical Issues**: Bugs, security vulnerabilities, data loss risks, breaking changes
- **Code Quality**: Best practices, maintainability, readability, consistency with codebase patterns
- **Architecture**: Design decisions, component structure, separation of concerns
- **Performance**: Unnecessary re-renders, memory leaks, inefficient algorithms, bundle size impact
- **Testing**: Test coverage for new/changed functionality, test quality
- **Accessibility**: ARIA attributes, keyboard navigation, screen reader support
- **Type Safety**: TypeScript usage, type definitions, null/undefined handling
- **Error Handling**: User-facing errors, edge cases, error boundaries
- **Documentation**: Code comments, README updates, API documentation

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
 * Build the full prompt with PR info and diff
 */
export function buildReviewPrompt(
  headBranch: string,
  baseBranch: string,
  prTitle: string,
  _diff: string
): string {
  return `${REVIEW_TEMPLATE}

---

## PR Information

- **Title**: ${prTitle}
- **Branch**: ${headBranch} → ${baseBranch}

## Code Changes

Please review the following diff:`;
}
