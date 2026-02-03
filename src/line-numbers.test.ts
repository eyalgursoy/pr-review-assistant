/**
 * Tests for line number and side accuracy in PR review comments
 *
 * These tests verify that:
 * 1. Line numbers are correctly parsed from AI responses
 * 2. Side (LEFT/RIGHT) is correctly determined
 * 3. GitHub API payload is correctly formatted
 */

import { describe, it, expect } from "vitest";

// Mock types matching our actual types
type DiffSide = "LEFT" | "RIGHT";

interface ReviewComment {
  id: string;
  file: string;
  line: number;
  side: DiffSide;
  severity: string;
  issue: string;
  suggestion?: string;
  status: string;
}

/**
 * Normalize side value (mirrors the actual implementation)
 */
function normalizeSide(s: string | undefined): DiffSide {
  if (!s) return "RIGHT";
  const upper = String(s).toUpperCase().trim();
  if (upper === "LEFT" || upper === "L") return "LEFT";
  if (upper === "RIGHT" || upper === "R") return "RIGHT";
  return "RIGHT";
}

/**
 * Parse a finding from AI response (simplified version)
 */
function parseFinding(
  finding: {
    file: string;
    line: number;
    side?: string;
    severity: string;
    issue: string;
    suggestion?: string;
  },
  idx: number
): ReviewComment {
  return {
    id: `comment-${Date.now()}-${idx}`,
    file: finding.file.replace(/^[ab]\//, ""),
    line: Math.floor(finding.line),
    side: normalizeSide(finding.side),
    severity: finding.severity,
    issue: finding.issue,
    suggestion: finding.suggestion,
    status: "pending",
  };
}

/**
 * Build GitHub API comment payload
 */
function buildGitHubComment(comment: ReviewComment) {
  return {
    path: comment.file,
    line: comment.line,
    side: comment.side,
    body: `**${comment.severity.toUpperCase()}**: ${comment.issue}`,
  };
}

describe("Side Normalization", () => {
  it("should default to RIGHT when side is undefined", () => {
    expect(normalizeSide(undefined)).toBe("RIGHT");
  });

  it("should default to RIGHT when side is empty string", () => {
    expect(normalizeSide("")).toBe("RIGHT");
  });

  it("should normalize LEFT correctly", () => {
    expect(normalizeSide("LEFT")).toBe("LEFT");
    expect(normalizeSide("left")).toBe("LEFT");
    expect(normalizeSide("Left")).toBe("LEFT");
    expect(normalizeSide("L")).toBe("LEFT");
    expect(normalizeSide("l")).toBe("LEFT");
  });

  it("should normalize RIGHT correctly", () => {
    expect(normalizeSide("RIGHT")).toBe("RIGHT");
    expect(normalizeSide("right")).toBe("RIGHT");
    expect(normalizeSide("Right")).toBe("RIGHT");
    expect(normalizeSide("R")).toBe("RIGHT");
    expect(normalizeSide("r")).toBe("RIGHT");
  });

  it("should default to RIGHT for invalid values", () => {
    expect(normalizeSide("invalid")).toBe("RIGHT");
    expect(normalizeSide("center")).toBe("RIGHT");
    expect(normalizeSide("MIDDLE")).toBe("RIGHT");
  });
});

describe("Finding Parsing", () => {
  it("should parse a finding with RIGHT side for added lines", () => {
    const finding = {
      file: "src/utils.ts",
      line: 42,
      side: "RIGHT",
      severity: "high",
      issue: "Missing error handling",
    };

    const comment = parseFinding(finding, 0);

    expect(comment.file).toBe("src/utils.ts");
    expect(comment.line).toBe(42);
    expect(comment.side).toBe("RIGHT");
    expect(comment.severity).toBe("high");
  });

  it("should parse a finding with LEFT side for deleted lines", () => {
    const finding = {
      file: "src/old-code.ts",
      line: 15,
      side: "LEFT",
      severity: "medium",
      issue: "Important validation was removed",
    };

    const comment = parseFinding(finding, 0);

    expect(comment.file).toBe("src/old-code.ts");
    expect(comment.line).toBe(15);
    expect(comment.side).toBe("LEFT");
  });

  it("should default to RIGHT when side is missing", () => {
    const finding = {
      file: "src/utils.ts",
      line: 42,
      severity: "high",
      issue: "Missing error handling",
    };

    const comment = parseFinding(finding, 0);

    expect(comment.side).toBe("RIGHT");
  });

  it("should clean file path with a/ prefix", () => {
    const finding = {
      file: "a/src/utils.ts",
      line: 42,
      side: "RIGHT",
      severity: "high",
      issue: "Test",
    };

    const comment = parseFinding(finding, 0);

    expect(comment.file).toBe("src/utils.ts");
  });

  it("should clean file path with b/ prefix", () => {
    const finding = {
      file: "b/src/utils.ts",
      line: 42,
      side: "RIGHT",
      severity: "high",
      issue: "Test",
    };

    const comment = parseFinding(finding, 0);

    expect(comment.file).toBe("src/utils.ts");
  });

  it("should floor decimal line numbers", () => {
    const finding = {
      file: "src/utils.ts",
      line: 42.7,
      side: "RIGHT",
      severity: "high",
      issue: "Test",
    };

    const comment = parseFinding(finding, 0);

    expect(comment.line).toBe(42);
  });
});

describe("GitHub API Payload", () => {
  it("should include side in the payload for added lines", () => {
    const comment: ReviewComment = {
      id: "test-1",
      file: "src/utils.ts",
      line: 42,
      side: "RIGHT",
      severity: "high",
      issue: "Missing error handling",
      status: "approved",
    };

    const payload = buildGitHubComment(comment);

    expect(payload).toEqual({
      path: "src/utils.ts",
      line: 42,
      side: "RIGHT",
      body: "**HIGH**: Missing error handling",
    });
  });

  it("should include side in the payload for deleted lines", () => {
    const comment: ReviewComment = {
      id: "test-2",
      file: "src/old-code.ts",
      line: 15,
      side: "LEFT",
      severity: "medium",
      issue: "Important validation was removed",
      status: "approved",
    };

    const payload = buildGitHubComment(comment);

    expect(payload).toEqual({
      path: "src/old-code.ts",
      line: 15,
      side: "LEFT",
      body: "**MEDIUM**: Important validation was removed",
    });
  });
});

describe("Diff Line Number Scenarios", () => {
  /**
   * Example diff:
   * @@ -10,5 +12,7 @@
   *  context line (unchanged)
   * -deleted line (was line 11 in old file)
   * +added line (is line 13 in new file)
   *  another context line
   */

  it("should use LEFT side with old line number for deleted lines", () => {
    // Comment about the deleted line at old file line 11
    const finding = {
      file: "src/example.ts",
      line: 11, // Old file line number
      side: "LEFT",
      severity: "medium",
      issue: "This deleted code contained important logic",
    };

    const comment = parseFinding(finding, 0);
    const payload = buildGitHubComment(comment);

    expect(payload.side).toBe("LEFT");
    expect(payload.line).toBe(11);
  });

  it("should use RIGHT side with new line number for added lines", () => {
    // Comment about the added line at new file line 13
    const finding = {
      file: "src/example.ts",
      line: 13, // New file line number
      side: "RIGHT",
      severity: "high",
      issue: "This new code has a bug",
    };

    const comment = parseFinding(finding, 0);
    const payload = buildGitHubComment(comment);

    expect(payload.side).toBe("RIGHT");
    expect(payload.line).toBe(13);
  });

  it("should use RIGHT side with new line number for context lines", () => {
    // Comment about unchanged context line
    const finding = {
      file: "src/example.ts",
      line: 12, // New file line number for context
      side: "RIGHT",
      severity: "low",
      issue: "This existing code could be improved",
    };

    const comment = parseFinding(finding, 0);
    const payload = buildGitHubComment(comment);

    expect(payload.side).toBe("RIGHT");
    expect(payload.line).toBe(12);
  });
});

describe("Multiple Findings", () => {
  it("should correctly parse multiple findings with different sides", () => {
    const findings = [
      {
        file: "src/api.ts",
        line: 45,
        side: "RIGHT",
        severity: "high",
        issue: "New code missing error handling",
      },
      {
        file: "src/api.ts",
        line: 20,
        side: "LEFT",
        severity: "medium",
        issue: "Removed important validation",
      },
      {
        file: "src/utils.ts",
        line: 10,
        side: "RIGHT",
        severity: "low",
        issue: "Could use better naming",
      },
    ];

    const comments = findings.map((f, i) => parseFinding(f, i));

    expect(comments).toHaveLength(3);

    expect(comments[0].side).toBe("RIGHT");
    expect(comments[0].line).toBe(45);

    expect(comments[1].side).toBe("LEFT");
    expect(comments[1].line).toBe(20);

    expect(comments[2].side).toBe("RIGHT");
    expect(comments[2].line).toBe(10);
  });
});
