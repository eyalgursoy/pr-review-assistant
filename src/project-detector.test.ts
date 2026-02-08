/**
 * Tests for project detection
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const workspaceFolders = [{ uri: { fsPath: "/test/workspace" } }];
const mockReadFile = vi.fn();
const mockStat = vi.fn();
const mockReadDirectory = vi.fn();
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
      stat: (...args: unknown[]) => mockStat(...args),
      readDirectory: (...args: unknown[]) => mockReadDirectory(...args),
    },
    findFiles: (...args: unknown[]) => mockFindFiles(...args),
  },
  Uri: {
    file: (path: string) => ({ fsPath: path }),
    joinPath: (base: { fsPath: string }, ...segments: string[]) => ({
      fsPath: `${base.fsPath}/${segments.join("/")}`,
    }),
  },
}));

import { detectProjectContext } from "./project-detector";

describe("detectProjectContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindFiles.mockResolvedValue([]);
    mockStat.mockRejectedValue(new Error("not found"));
    mockReadFile.mockRejectedValue(new Error("not found"));
    mockReadDirectory.mockRejectedValue(new Error("not found"));
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
    // stat succeeds for package.json (first manifest check)
    mockStat.mockResolvedValueOnce({ type: 1 });
    // readFile for framework detection
    mockReadFile.mockResolvedValueOnce(
      new TextEncoder().encode(JSON.stringify({ name: "test", dependencies: {} }))
    );

    const context = await detectProjectContext();
    expect(context.projectType).toBe("node");
  });

  it("should detect python project from pyproject.toml", async () => {
    // stat fails for package.json, requirements.txt, then succeeds for pyproject.toml
    mockStat
      .mockRejectedValueOnce(new Error("not found")) // package.json
      .mockRejectedValueOnce(new Error("not found")) // requirements.txt
      .mockResolvedValueOnce({ type: 1 }); // pyproject.toml

    // readFile for framework detection (pyproject.toml)
    mockReadFile.mockResolvedValueOnce(
      new TextEncoder().encode("[project]\nname = 'test'")
    );

    const context = await detectProjectContext();
    expect(context.projectType).toBe("python");
  });

  it("should add languages from changed file extensions", async () => {
    // stat succeeds for package.json
    mockStat.mockResolvedValueOnce({ type: 1 });
    // readFile for framework detection
    mockReadFile.mockResolvedValueOnce(
      new TextEncoder().encode(JSON.stringify({ name: "test" }))
    );

    const context = await detectProjectContext(["src/foo.ts", "src/bar.tsx"]);
    expect(context.projectType).toBe("node");
    expect(context.languages).toContain("typescript");
  });
});
