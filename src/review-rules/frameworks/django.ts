/**
 * Django specific review rules
 */

import type { ReviewRuleSet } from "../index";

export const djangoRules: ReviewRuleSet = {
  name: "django",
  description: "Django framework best practices",
  focusAreas: [
    "ORM: Efficient queries, avoid N+1, use select_related/prefetch_related",
    "Security: CSRF, XSS, SQL injection, authentication",
    "Views: Class-based vs function-based, proper use of mixins",
    "Forms: Validation, CSRF, model forms",
    "Migrations: Reversibility, data migrations safety",
  ],
  antiPatterns: [
    "Raw SQL without parameterization",
    "Missing @csrf_exempt without justification",
    "N+1 queries in loops",
    "Sensitive data in logs or error messages",
    "Missing authentication on views that need it",
    "Using get() when object might not exist (use get_object_or_404 or filter)",
  ],
  bestPractices: [
    "Use get_object_or_404 for single object retrieval",
    "Use select_related/prefetch_related for related data",
    "Validate and sanitize user input in forms",
    "Use Django's built-in auth and permission system",
    "Follow Django's async views patterns when using async",
  ],
  ignorePatterns: [
    "migrations/ auto-generated files",
    "manage.py",
    "wsgi.py / asgi.py boilerplate",
  ],
  severityExamples: {
    critical: "SQL injection, missing auth, CSRF bypass",
    high: "N+1 queries, raw SQL injection risk, missing validation",
    medium: "Inefficient queries, non-idiomatic Django patterns",
    low: "Style, optional queryset optimization",
  },
};
