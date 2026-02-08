/**
 * Rust specific review rules
 */

import type { ReviewRuleSet } from "../index";

export const rustRules: ReviewRuleSet = {
  name: "rust",
  description: "Rust best practices, ownership, and safety",
  focusAreas: [
    "Ownership: Proper borrowing, avoid unnecessary clones",
    "Error Handling: Result, Option, ? operator, avoid unwrap() in library code",
    "Unsafe: Minimize unsafe blocks, ensure safety invariants",
    "Async: tokio/async-std usage, proper Send + Sync bounds",
    "Performance: Avoid unnecessary allocations, use references",
  ],
  antiPatterns: [
    "unwrap() or expect() in library code without justification",
    "Unnecessary .clone() that could use references",
    "Unsound unsafe code or undefined behavior",
    "Blocking calls in async code",
    "Panic in production code paths",
    "Redundant or incorrect lifetime annotations",
  ],
  bestPractices: [
    "Use Result for fallible operations, Option for optional values",
    "Prefer references over cloning where possible",
    "Use cargo clippy for additional lint suggestions",
    "Document unsafe blocks with safety invariants",
    "Use derive for common traits (Debug, Clone, etc.)",
  ],
  ignorePatterns: [
    "Generated code",
    "target/ directory",
    "Build script output",
  ],
  severityExamples: {
    critical: "Unsound unsafe, undefined behavior, memory safety violations",
    high: "unwrap() in libraries, blocking in async, unnecessary clones in hot paths",
    medium: "Non-idiomatic patterns, missing error handling",
    low: "Style, clippy suggestions",
  },
};
