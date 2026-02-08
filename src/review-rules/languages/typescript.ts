/**
 * TypeScript/JavaScript specific review rules
 */

import type { ReviewRuleSet } from "../index";

export const typescriptRules: ReviewRuleSet = {
  name: "typescript",
  description: "TypeScript and JavaScript best practices",
  focusAreas: [
    "Type Safety: Avoid 'any', prefer strict types, null/undefined handling",
    "Async: Proper async/await usage, Promise error handling, avoid callback hell",
    "Imports: Barrel file performance, circular dependencies, tree-shaking",
    "React/JSX: If present, hooks rules, component patterns, key props",
    "Node/Browser: Correct API usage (Node.js vs browser globals)",
  ],
  antiPatterns: [
    "Using 'any' type without justification",
    "Ignoring or disabling TypeScript errors with @ts-ignore",
    "Unhandled promise rejections or missing .catch()",
    "Mutating function parameters or shared state",
    "Memory leaks from unsubscribed event listeners or intervals",
    "Using 'var' instead of 'const' or 'let'",
  ],
  bestPractices: [
    "Use const by default, let when reassignment needed",
    "Prefer optional chaining (?.) and nullish coalescing (??)",
    "Use proper TypeScript generics for reusable code",
    "Prefer async/await over raw Promises",
    "Export types explicitly for public APIs",
  ],
  ignorePatterns: [
    "*.d.ts declaration files unless type definitions are incorrect",
    "Generated or auto-generated code",
    "Third-party library wrappers without modifications",
  ],
  severityExamples: {
    critical: "Type-unsafe operations that could cause runtime crashes, security issues",
    high: "Missing error handling in async code, incorrect type assertions",
    medium: "Loose typing, unnecessary type assertions, deprecated API usage",
    low: "Style preferences, optional type improvements",
  },
};
