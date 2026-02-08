/**
 * Python specific review rules
 */

import type { ReviewRuleSet } from "../index";

export const pythonRules: ReviewRuleSet = {
  name: "python",
  description: "Python best practices and PEP conventions",
  focusAreas: [
    "Type Hints: Use type annotations for function signatures and complex logic",
    "Error Handling: Appropriate exception types, avoid bare except",
    "PEP 8: Style consistency, naming conventions, line length",
    "Async: asyncio usage, proper await, avoiding blocking calls in async code",
    "Security: Input validation, SQL injection, path traversal",
  ],
  antiPatterns: [
    "Bare except: except: without specifying exception type",
    "Mutable default arguments (e.g., def fn(x=[]))",
    "Using == for None instead of 'is None'",
    "Catching Exception too broadly without re-raising",
    "Blocking I/O in async functions",
    "Using eval() or exec() with user input",
  ],
  bestPractices: [
    "Use pathlib for file paths",
    "Prefer context managers (with) for resources",
    "Use dataclasses or Pydantic for structured data",
    "Follow PEP 8 for style (black, ruff, or similar)",
    "Use type hints for public APIs",
  ],
  ignorePatterns: [
    "__pycache__",
    "*.pyc",
    "Auto-generated protobuf or similar",
  ],
  severityExamples: {
    critical: "Security vulnerabilities, data corruption, eval/exec with user input",
    high: "Bare except, mutable default args, blocking in async",
    medium: "Missing type hints, PEP 8 violations, poor exception handling",
    low: "Style suggestions, optional type hints",
  },
};
