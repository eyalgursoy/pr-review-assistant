/**
 * Go specific review rules
 */

import type { ReviewRuleSet } from "../index";

export const goRules: ReviewRuleSet = {
  name: "go",
  description: "Go best practices and idioms",
  focusAreas: [
    "Error Handling: Explicit error handling, never ignore errors",
    "Concurrency: Goroutine usage, channel patterns, deadlock avoidance",
    "Interfaces: Use small interfaces, accept interfaces return structs",
    "Performance: Avoid unnecessary allocations, use sync.Pool where appropriate",
    "Context: Proper context propagation for cancellation",
  ],
  antiPatterns: [
    "Ignoring errors from function returns",
    "Starting goroutines without cleanup or panic recovery",
    "Shared mutable state without proper synchronization",
    "Using global variables for configuration",
    "Panic for recoverable errors",
    "Creating many goroutines without bounds (e.g., per-request)",
  ],
  bestPractices: [
    "Check errors explicitly; use errors.Is/As for errors",
    "Use context for cancellation and timeouts",
    "Prefer composition over embedding",
    "Return early to reduce nesting",
    "Use defer for cleanup (e.g., Close)",
  ],
  ignorePatterns: [
    "Generated code",
    "vendor/ directory",
    "*_gen.go files",
  ],
  severityExamples: {
    critical: "Unhandled errors, goroutine leaks, data races",
    high: "Ignored errors, missing context propagation, panic in library code",
    medium: "Non-idiomatic patterns, unnecessary allocations",
    low: "Style suggestions, minor optimizations",
  },
};
