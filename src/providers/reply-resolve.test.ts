/**
 * Tests for provider replyToComment and setThreadResolved APIs
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("vscode", () => ({
  workspace: {
    workspaceFolders: [],
    getConfiguration: vi.fn(() => ({ get: () => undefined })),
  },
}));

import type { PRInfo, ReviewComment } from "../types";
import { githubProvider } from "./github";
import { gitlabProvider } from "./gitlab";
import { bitbucketProvider } from "./bitbucket";

const pr: PRInfo = {
  number: 1,
  owner: "o",
  repo: "r",
  title: "Test",
  headBranch: "main",
  baseBranch: "main",
  url: "https://github.com/o/r/pull/1",
  host: "github",
};

const baseComment: ReviewComment = {
  id: "host-gh-1",
  file: "src/a.ts",
  line: 1,
  side: "RIGHT",
  severity: "medium",
  issue: "Test",
  status: "pending",
  source: "host",
};

describe("replyToComment", () => {
  describe("GitHub", () => {
    it("returns error when hostCommentId is missing", async () => {
      const comment = { ...baseComment, hostCommentId: undefined };
      const result = await githubProvider.replyToComment!(
        { ...pr, host: "github" },
        comment,
        "Reply text"
      );
      expect(result.success).toBe(false);
      expect(result.message).toContain("host comment id");
    });

    it("returns error when hostCommentId is not a number", async () => {
      const comment = { ...baseComment, hostCommentId: "string-id" };
      const result = await githubProvider.replyToComment!(
        { ...pr, host: "github" },
        comment,
        "Reply text"
      );
      expect(result.success).toBe(false);
      expect(result.message).toContain("host comment id");
    });
  });

  describe("GitLab", () => {
    it("returns error when hostThreadId is missing", async () => {
      const comment = { ...baseComment, id: "host-gl-1", hostThreadId: undefined };
      const result = await gitlabProvider.replyToComment!(
        { ...pr, host: "gitlab" },
        comment,
        "Reply text"
      );
      expect(result.success).toBe(false);
      expect(result.message).toContain("discussion id");
    });
  });

  describe("Bitbucket", () => {
    it("returns error when hostCommentId is missing", async () => {
      const comment = { ...baseComment, id: "host-bb-1", hostCommentId: undefined };
      const result = await bitbucketProvider.replyToComment!(
        { ...pr, host: "bitbucket" },
        comment,
        "Reply text"
      );
      expect(result.success).toBe(false);
      expect(result.message).toContain("host comment id");
    });
  });
});

describe("setThreadResolved", () => {
  describe("Bitbucket", () => {
    it("returns success with not-supported message (no-op)", async () => {
      const result = await bitbucketProvider.setThreadResolved!(
        { ...pr, host: "bitbucket" },
        "thread-123",
        true
      );
      expect(result.success).toBe(true);
      expect(result.message?.toLowerCase()).toContain("not supported");
    });
  });
});
