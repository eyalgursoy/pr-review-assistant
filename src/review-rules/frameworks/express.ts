/**
 * Express.js specific review rules
 */

import type { ReviewRuleSet } from "../index";

export const expressRules: ReviewRuleSet = {
  name: "express",
  description: "Express.js backend best practices",
  focusAreas: [
    "Middleware: Proper ordering, error handling middleware",
    "Security: Input validation, sanitization, rate limiting",
    "Async: Proper async/await in route handlers, no unhandled rejections",
    "Error Handling: Centralized error handling, correct status codes",
    "API Design: REST conventions, consistent response format",
  ],
  antiPatterns: [
    "Synchronous code in route handlers that blocks event loop",
    "Sending raw error objects or stack traces to clients",
    "Missing authentication/authorization on protected routes",
    "SQL/NoSQL injection from unsanitized input",
    "Not using next() in middleware to pass errors",
    "Hardcoded secrets or credentials",
  ],
  bestPractices: [
    "Use async route handlers with try/catch or express-async-errors",
    "Validate and sanitize all user input",
    "Use helmet for security headers",
    "Return consistent JSON error format",
    "Use middleware for cross-cutting concerns",
  ],
  ignorePatterns: [
    "Boilerplate route setup",
    "Generated OpenAPI/Swagger code",
  ],
  severityExamples: {
    critical: "Security vulnerabilities, unhandled rejections, credential exposure",
    high: "Missing validation, blocking event loop, incorrect error handling",
    medium: "Missing security headers, inconsistent API design",
    low: "Code organization, optional middleware",
  },
};
