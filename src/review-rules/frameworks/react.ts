/**
 * React specific review rules
 */

import type { ReviewRuleSet } from "../index";

export const reactRules: ReviewRuleSet = {
  name: "react",
  description: "React best practices and patterns",
  focusAreas: [
    "Hooks: Rules of hooks, dependency arrays, avoid stale closures",
    "Performance: Unnecessary re-renders, useMemo/useCallback when appropriate",
    "State: Lift state appropriately, avoid prop drilling",
    "Accessibility: ARIA attributes, keyboard navigation, focus management",
    "Component Design: Single responsibility, composition over inheritance",
  ],
  antiPatterns: [
    "Calling hooks conditionally or in loops",
    "Missing key prop on list items",
    "Inline object/array creation in JSX causing unnecessary re-renders",
    "Direct state mutation (e.g., mutating state object)",
    "Using index as key when list order can change",
    "useEffect without proper cleanup for subscriptions/timers",
  ],
  bestPractices: [
    "Use functional components and hooks",
    "Keep components small and focused",
    "Use React.memo for expensive pure components",
    "Provide alt text for images",
    "Handle loading and error states in UI",
  ],
  ignorePatterns: [
    "Third-party component wrappers without changes",
    "Generated Storybook or test fixtures",
  ],
  severityExamples: {
    critical: "Rules of hooks violations, memory leaks from missing cleanup",
    high: "Missing keys, stale closure bugs, direct state mutation",
    medium: "Unnecessary re-renders, prop drilling, accessibility gaps",
    low: "Style improvements, optional memoization",
  },
};
