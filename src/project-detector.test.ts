/**
 * Tests for project detection
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const workspaceFolders = [{ uri: { fsPath: "/test/workspace" } }];
const mockReadFile = vi.fn();
const mockFindFiles = vi.fn();

// Mock vscode before importing
vi.mock("vscode", () => ({
  workspace: {
    get workspaceFolders() {
      return workspaceFolders;
    },
    getConfiguration: vi.fn(() => ({
      get: vi.fn(() => ""),
    })),
    fs: {
      readFile: (...args: unknown[]) => mockReadFile(...args),
    },
    readDirectory: vi.fn(),
    findFiles: (...args: unknown[]) => mockFindFiles(...args),
  },
  Uri: {
    file: (path: string) => ({ fsPath: path }),
    joinPath: (_base: unknown, ...segments: string[]) => ({
      fsPath: segments.join("/"),
    }),
  },
}));

import { detectProjectContext } from "./project-detector";

describe("detectProjectContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindFiles.mockResolvedValue([]);
    workspaceFolders.length = 1;
    workspaceFolders[0] = { uri: { fsPath: "/test/workspace" } };
  });

  it("should return unknown when no workspace", async () => {
    workspaceFolders.length = 0;
    const context = await detectProjectContext();
    expect(context.projectType).toBe("unknown");
    expect(context.languages).toEqual([]);
    expect(context.frameworks).toEqual([]);
  });

  it("should detect node project from package.json", async () => {
    mockReadFile.mockResolvedValueOnce(
      Buffer.from(JSON.stringify({ name: "test", dependencies: {} }))
    );

    const context = await detectProjectContext();
    expect(context.projectType).toBe("node");
  });

  it("should detect python project from pyproject.toml", async () => {
    mockReadFile
      .mockRejectedValueOnce(new Error("not found"))
      .mockRejectedValueOnce(new Error("not found"))
      .mockRejectedValueOnce(new Error("not found"))
      .mockResolvedValueOnce(Buffer.from("[project]\nname = 'test'"));

    const context = await detectProjectContext();
    expect(context.projectType).toBe("python");
  });

  it("should add languages from changed file extensions", async () => {
    mockReadFile.mockResolvedValueOnce(
      Buffer.from(JSON.stringify({ name: "test" }))
    );

    const context = await detectProjectContext(["src/foo.ts", "src/bar.tsx"]);
    expect(context.projectType).toBe("node");
    expect(context.languages).toContain("typescript");
  });
});
