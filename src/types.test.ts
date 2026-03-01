/**
 * Tests for ReviewComment type fields added in Task 1:
 * source, hostOutdated, hostResolved, parentId
 */

import { describe, it, expect } from "vitest";
import type { ReviewComment } from "./types";

/** Minimal valid AI comment */
const baseAiComment: ReviewComment = {
  id: "comment-1234-0",
  file: "src/utils.ts",
  line: 10,
  side: "RIGHT",
  severity: "medium",
  issue: "Missing error handling",
  status: "pending",
  source: "ai",
};

/** Minimal valid host comment */
const baseHostComment: ReviewComment = {
  id: "host-gh-abc123",
  file: "src/utils.ts",
  line: 10,
  side: "RIGHT",
  severity: "medium",
  issue: "Consider adding validation",
  status: "pending",
  source: "host",
};

describe("ReviewComment source field", () => {
  it("accepts source: 'ai'", () => {
    expect(baseAiComment.source).toBe("ai");
  });

  it("accepts source: 'host'", () => {
    expect(baseHostComment.source).toBe("host");
  });

  it("source is required - AI comment has source set", () => {
    expect("source" in baseAiComment).toBe(true);
  });

  it("source is required - host comment has source set", () => {
    expect("source" in baseHostComment).toBe(true);
  });
});

describe("ReviewComment hostOutdated field", () => {
  it("is undefined by default", () => {
    expect(baseAiComment.hostOutdated).toBeUndefined();
    expect(baseHostComment.hostOutdated).toBeUndefined();
  });

  it("accepts true for outdated host comment", () => {
    const comment: ReviewComment = {
      ...baseHostComment,
      hostOutdated: true,
    };
    expect(comment.hostOutdated).toBe(true);
  });

  it("accepts false for non-outdated host comment", () => {
    const comment: ReviewComment = {
      ...baseHostComment,
      hostOutdated: false,
    };
    expect(comment.hostOutdated).toBe(false);
  });
});

describe("ReviewComment hostResolved field", () => {
  it("is undefined by default", () => {
    expect(baseAiComment.hostResolved).toBeUndefined();
    expect(baseHostComment.hostResolved).toBeUndefined();
  });

  it("accepts true for resolved host comment", () => {
    const comment: ReviewComment = {
      ...baseHostComment,
      hostResolved: true,
    };
    expect(comment.hostResolved).toBe(true);
  });

  it("accepts false for unresolved host comment", () => {
    const comment: ReviewComment = {
      ...baseHostComment,
      hostResolved: false,
    };
    expect(comment.hostResolved).toBe(false);
  });

  it("hostResolved is independent of local status", () => {
    // A comment can be locally approved but not host-resolved
    const comment: ReviewComment = {
      ...baseHostComment,
      status: "approved",
      hostResolved: false,
    };
    expect(comment.status).toBe("approved");
    expect(comment.hostResolved).toBe(false);

    // A comment can be host-resolved but still locally pending
    const comment2: ReviewComment = {
      ...baseHostComment,
      status: "pending",
      hostResolved: true,
    };
    expect(comment2.status).toBe("pending");
    expect(comment2.hostResolved).toBe(true);
  });
});

describe("ReviewComment parentId field", () => {
  it("is undefined for root comments", () => {
    expect(baseAiComment.parentId).toBeUndefined();
    expect(baseHostComment.parentId).toBeUndefined();
  });

  it("accepts a parent ID string for replies", () => {
    const reply: ReviewComment = {
      ...baseHostComment,
      id: "host-gh-child456",
      parentId: "host-gh-abc123",
    };
    expect(reply.parentId).toBe("host-gh-abc123");
  });

  it("can model a reply chain: root → reply", () => {
    const root: ReviewComment = { ...baseHostComment, id: "host-gh-root" };
    const reply: ReviewComment = {
      ...baseHostComment,
      id: "host-gh-reply",
      parentId: root.id,
    };
    expect(root.parentId).toBeUndefined();
    expect(reply.parentId).toBe(root.id);
  });
});

describe("ReviewComment combined host fields", () => {
  it("fully-populated host comment is valid", () => {
    const comment: ReviewComment = {
      id: "host-gh-abc",
      file: "src/foo.ts",
      line: 5,
      side: "RIGHT",
      severity: "low",
      issue: "Nitpick",
      status: "pending",
      authorName: "alice",
      source: "host",
      hostOutdated: false,
      hostResolved: false,
      parentId: undefined,
    };
    expect(comment.source).toBe("host");
    expect(comment.hostOutdated).toBe(false);
    expect(comment.hostResolved).toBe(false);
    expect(comment.parentId).toBeUndefined();
  });

  it("outdated reply with resolved parent thread is valid", () => {
    const comment: ReviewComment = {
      ...baseHostComment,
      id: "host-gh-reply",
      parentId: "host-gh-root",
      hostOutdated: true,
      hostResolved: true,
    };
    expect(comment.hostOutdated).toBe(true);
    expect(comment.hostResolved).toBe(true);
    expect(comment.parentId).toBe("host-gh-root");
  });
});

describe("ReviewComment hostCommentId and hostThreadId fields", () => {
  it("hostCommentId is undefined by default", () => {
    expect(baseAiComment.hostCommentId).toBeUndefined();
    expect(baseHostComment.hostCommentId).toBeUndefined();
  });

  it("accepts hostCommentId as number (e.g. GitHub REST id)", () => {
    const comment: ReviewComment = {
      ...baseHostComment,
      hostCommentId: 12345,
    };
    expect(comment.hostCommentId).toBe(12345);
  });

  it("accepts hostCommentId as string (e.g. GitLab note id)", () => {
    const comment: ReviewComment = {
      ...baseHostComment,
      hostCommentId: "abc-def",
    };
    expect(comment.hostCommentId).toBe("abc-def");
  });

  it("hostThreadId is undefined by default", () => {
    expect(baseAiComment.hostThreadId).toBeUndefined();
    expect(baseHostComment.hostThreadId).toBeUndefined();
  });

  it("accepts hostThreadId (e.g. GitHub PRRT_xxx, GitLab discussion id)", () => {
    const comment: ReviewComment = {
      ...baseHostComment,
      hostThreadId: "PRRT_kwDOxyz",
    };
    expect(comment.hostThreadId).toBe("PRRT_kwDOxyz");
  });
});
