/**
 * Base review rules that apply to all projects
 */

import type { ReviewRuleSet } from "./index";

export const baseRules: ReviewRuleSet = {
  name: "base",
  description: "Universal code review rules for all projects",
  focusAreas: [
    "Critical Issues: Bugs, security vulnerabilities, data loss risks, breaking changes",
    "Code Quality: Best practices, maintainability, readability, consistency with codebase patterns",
    "Architecture: Design decisions, component structure, separation of concerns",
    "Performance: Memory leaks, inefficient algorithms, unnecessary work",
    "Error Handling: User-facing errors, edge cases, proper error propagation",
    "Documentation: Code comments, README updates, API documentation for public APIs",
  ],
  antiPatterns: [
    "Hardcoded secrets, API keys, or credentials",
    "SQL injection or other injection vulnerabilities",
    "Race conditions in async/concurrent code",
    "Missing validation of user input",
    "Silent failure or swallowing errors",
    "Unbounded loops or recursion without exit conditions",
  ],
  bestPractices: [
    "Validate input at boundaries",
    "Handle errors explicitly; avoid silent failures",
    "Keep functions small and focused",
    "Use meaningful names for variables and functions",
    "Prefer immutable data where practical",
  ],
  severityExamples: {
    critical: "Security vulnerabilities, data corruption, production-breaking bugs",
    high: "Logic errors, missing error handling that could cause crashes",
    medium: "Code quality issues, potential future bugs, maintainability concerns",
    low: "Style suggestions, minor optimizations, documentation improvements",
  },
};
