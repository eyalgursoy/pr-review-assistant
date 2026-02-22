/**
 * Tests for GitHub GraphQL resolution helpers (applyGraphQLResolution).
 */

import { describe, it, expect } from "vitest";
import {
  applyGraphQLResolution,
  type CommentThreadState,
} from "./github-graphql";
import type { ReviewComment } from "../types";

function makeComment(
  id: string,
  overrides: Partial<ReviewComment> = {}
): ReviewComment {
  return {
    id,
    file: "src/a.ts",
    line: 10,
    side: "RIGHT",
    severity: "medium",
    issue: "Test",
    status: "pending",
    source: "host",
    ...overrides,
  };
}

describe("applyGraphQLResolution", () => {
  it("sets hostResolved and hostOutdated from map when comment id has host-gh- prefix", () => {
    const comments = [
      makeComment("host-gh-PRRC_1"),
      makeComment("host-gh-PRRC_2"),
    ];
    const map = new Map<string, CommentThreadState>();
    map.set("PRRC_1", { isResolved: true, isOutdated: false });

    const result = applyGraphQLResolution(comments, map);

    expect(result).toHaveLength(2);
    expect(result[0].hostResolved).toBe(true);
    expect(result[0].hostOutdated).toBe(false);
    expect(result[1].hostResolved).toBeUndefined();
    expect(result[1].hostOutdated).toBeUndefined();
  });

  it("leaves comment unchanged when its node id is not in the map", () => {
    const comments = [makeComment("host-gh-PRRC_2")];
    const map = new Map<string, CommentThreadState>();
    map.set("PRRC_1", { isResolved: true, isOutdated: false });

    const result = applyGraphQLResolution(comments, map);

    expect(result).toHaveLength(1);
    expect(result[0].hostResolved).toBeUndefined();
    expect(result[0].hostOutdated).toBeUndefined();
    expect(result[0].id).toBe("host-gh-PRRC_2");
  });

  it("leaves comment unchanged when id does not start with host-gh-", () => {
    const comments = [makeComment("ai-123")];
    const map = new Map<string, CommentThreadState>();
    map.set("123", { isResolved: true, isOutdated: true });

    const result = applyGraphQLResolution(comments, map);

    expect(result).toHaveLength(1);
    expect(result[0].hostResolved).toBeUndefined();
    expect(result[0].hostOutdated).toBeUndefined();
    expect(result[0].id).toBe("ai-123");
  });

  it("does not mutate the input array", () => {
    const comments = [makeComment("host-gh-PRRC_1")];
    const map = new Map<string, CommentThreadState>();
    map.set("PRRC_1", { isResolved: true, isOutdated: false });

    applyGraphQLResolution(comments, map);

    expect(comments[0].hostResolved).toBeUndefined();
    expect(comments[0].hostOutdated).toBeUndefined();
  });

  it("sets both hostOutdated and hostResolved when thread is outdated and resolved", () => {
    const comments = [makeComment("host-gh-PRRC_x")];
    const map = new Map<string, CommentThreadState>();
    map.set("PRRC_x", { isResolved: true, isOutdated: true });

    const result = applyGraphQLResolution(comments, map);

    expect(result[0].hostResolved).toBe(true);
    expect(result[0].hostOutdated).toBe(true);
  });
});
