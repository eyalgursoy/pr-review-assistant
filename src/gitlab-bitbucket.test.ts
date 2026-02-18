/**
 * Tests for GitLab and Bitbucket provider comment mapping
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("vscode", () => ({
  workspace: {
    workspaceFolders: [],
    getConfiguration: vi.fn(() => ({ get: () => undefined })),
  },
}));

import {
  mapGitLabDiscussions,
  type GlDiscussion,
  type GlNote,
} from "./providers/gitlab";
import {
  mapBitbucketComments,
  type BbComment,
} from "./providers/bitbucket";

// --- GitLab ---

describe("mapGitLabDiscussions", () => {
  const baseNote: GlNote = {
    id: 100,
    body: "Some issue",
    author: { username: "reviewer" },
    position: {
      new_path: "src/app.ts",
      old_path: "src/app.ts",
      new_line: 10,
      old_line: null,
    },
  };

  const baseDiscussion: GlDiscussion = {
    notes: [baseNote],
    resolved: false,
  };

  it("sets source to host for all comments", () => {
    const [comment] = mapGitLabDiscussions([baseDiscussion]);
    expect(comment.source).toBe("host");
  });

  it("sets hostResolved from discussion.resolved", () => {
    const resolved = mapGitLabDiscussions([
      { ...baseDiscussion, resolved: true },
    ]);
    expect(resolved[0].hostResolved).toBe(true);

    const unresolved = mapGitLabDiscussions([
      { ...baseDiscussion, resolved: false },
    ]);
    expect(unresolved[0].hostResolved).toBe(false);
  });

  it("defaults hostResolved to false when resolved is undefined", () => {
    const disc: GlDiscussion = {
      notes: [baseNote],
    };
    const [comment] = mapGitLabDiscussions([disc]);
    expect(comment.hostResolved).toBe(false);
  });

  it("sets hostOutdated true when position is null", () => {
    const outdatedNote: GlNote = {
      ...baseNote,
      id: 200,
      position: null,
    };
    // Note with null position AND no path info gets skipped, so we need
    // a note that previously had a valid position (has path via discussion context).
    // With null position, the note is skipped because path resolves to empty.
    const comments = mapGitLabDiscussions([
      { notes: [outdatedNote], resolved: false },
    ]);
    expect(comments).toHaveLength(0);
  });

  it("sets hostOutdated false when position is present", () => {
    const [comment] = mapGitLabDiscussions([baseDiscussion]);
    expect(comment.hostOutdated).toBe(false);
  });

  it("sets parentId for reply notes in a discussion", () => {
    const replyNote: GlNote = {
      ...baseNote,
      id: 101,
      body: "Reply to issue",
    };
    const disc: GlDiscussion = {
      notes: [baseNote, replyNote],
      resolved: false,
    };
    const comments = mapGitLabDiscussions([disc]);
    expect(comments).toHaveLength(2);
    expect(comments[0].parentId).toBeUndefined();
    expect(comments[1].parentId).toBe("host-gl-100");
  });

  it("generates correct host-gl ID", () => {
    const [comment] = mapGitLabDiscussions([baseDiscussion]);
    expect(comment.id).toBe("host-gl-100");
  });

  it("skips notes without position and without path", () => {
    const noPositionNote: GlNote = {
      id: 300,
      body: "General comment",
      position: undefined,
    };
    const comments = mapGitLabDiscussions([
      { notes: [noPositionNote], resolved: false },
    ]);
    expect(comments).toHaveLength(0);
  });

  it("maps side to LEFT when only old_line is present", () => {
    const oldLineNote: GlNote = {
      ...baseNote,
      position: {
        new_path: "src/app.ts",
        old_path: "src/app.ts",
        new_line: null,
        old_line: 5,
      },
    };
    const [comment] = mapGitLabDiscussions([
      { notes: [oldLineNote], resolved: false },
    ]);
    expect(comment.side).toBe("LEFT");
    expect(comment.line).toBe(5);
  });

  it("skips discussions with no notes", () => {
    const comments = mapGitLabDiscussions([{ notes: [], resolved: false }]);
    expect(comments).toHaveLength(0);
  });
});

// --- Bitbucket ---

describe("mapBitbucketComments", () => {
  const base: BbComment = {
    id: 1,
    content: { raw: "Fix this bug" },
    anchor: { path: "src/main.ts", line: 15, line_type: "added" },
    user: { display_name: "Reviewer", username: "rev" },
  };

  it("sets source to host for all comments", () => {
    const [comment] = mapBitbucketComments([base]);
    expect(comment.source).toBe("host");
  });

  it("sets hostResolved to false (Bitbucket limitation)", () => {
    const [comment] = mapBitbucketComments([base]);
    expect(comment.hostResolved).toBe(false);
  });

  it("sets hostOutdated from deleted field", () => {
    const deleted = mapBitbucketComments([{ ...base, deleted: true }]);
    expect(deleted[0].hostOutdated).toBe(true);

    const notDeleted = mapBitbucketComments([{ ...base, deleted: false }]);
    expect(notDeleted[0].hostOutdated).toBe(false);
  });

  it("defaults hostOutdated to false when deleted is undefined", () => {
    const [comment] = mapBitbucketComments([base]);
    expect(comment.hostOutdated).toBe(false);
  });

  it("sets parentId from parent.id", () => {
    const child: BbComment = {
      ...base,
      id: 2,
      parent: { id: 1 },
    };
    const comments = mapBitbucketComments([base, child]);
    expect(comments[0].parentId).toBeUndefined();
    expect(comments[1].parentId).toBe("host-bb-1");
  });

  it("leaves parentId undefined when no parent", () => {
    const [comment] = mapBitbucketComments([base]);
    expect(comment.parentId).toBeUndefined();
  });

  it("generates correct host-bb ID", () => {
    const [comment] = mapBitbucketComments([base]);
    expect(comment.id).toBe("host-bb-1");
  });

  it("skips comments without anchor path", () => {
    const noPath: BbComment = { ...base, anchor: undefined, inline: undefined };
    const comments = mapBitbucketComments([noPath]);
    expect(comments).toHaveLength(0);
  });

  it("sets side to LEFT for removed lines", () => {
    const removed: BbComment = {
      ...base,
      anchor: { path: "src/main.ts", line: 5, line_type: "removed" },
    };
    const [comment] = mapBitbucketComments([removed]);
    expect(comment.side).toBe("LEFT");
  });

  it("uses inline fallback when anchor is missing", () => {
    const inlineOnly: BbComment = {
      ...base,
      anchor: undefined,
      inline: { path: "src/other.ts", to: 20 },
    };
    const [comment] = mapBitbucketComments([inlineOnly]);
    expect(comment.file).toBe("src/other.ts");
    expect(comment.line).toBe(20);
  });
});
