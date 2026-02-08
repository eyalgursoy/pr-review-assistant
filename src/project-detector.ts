/**
 * Project detection for context-aware code review
 * Detects project type, languages, and frameworks from workspace files
 */

import * as vscode from "vscode";
import { log } from "./logger";

export type ProjectType =
  | "node"
  | "python"
  | "rust"
  | "go"
  | "java"
  | "dotnet"
  | "unknown";

export type Framework =
  | "react"
  | "vue"
  | "angular"
  | "svelte"
  | "express"
  | "fastify"
  | "nest"
  | "django"
  | "fastapi"
  | "flask"
  | "jest"
  | "vitest"
  | "pytest"
  | "playwright"
  | "cypress";

export interface ProjectContext {
  projectType: ProjectType;
  languages: string[];
  frameworks: Framework[];
  isMonorepo: boolean;
  rootPath: string | null;
}

const MANIFEST_INDICATORS: Array<{
  file: string;
  type: ProjectType;
}> = [
  { file: "package.json", type: "node" },
  { file: "requirements.txt", type: "python" },
  { file: "pyproject.toml", type: "python" },
  { file: "setup.py", type: "python" },
  { file: "Cargo.toml", type: "rust" },
  { file: "go.mod", type: "go" },
  { file: "pom.xml", type: "java" },
  { file: "build.gradle", type: "java" },
  { file: "build.gradle.kts", type: "java" },
];

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".kt": "kotlin",
  ".cs": "csharp",
  ".rb": "ruby",
};

/**
 * Get preferred language override from settings
 */
function getPreferredLanguageOverride(): string[] {
  const config = vscode.workspace.getConfiguration("prReview");
  const override = config.get<string>("preferredLanguageRules", "");
  if (!override?.trim()) return [];
  return override.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/**
 * Detect project context from workspace
 */
export async function detectProjectContext(
  changedFilePaths?: string[]
): Promise<ProjectContext> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  const rootPath = workspaceFolders?.[0]?.uri.fsPath ?? null;

  const context: ProjectContext = {
    projectType: "unknown",
    languages: [],
    frameworks: [],
    isMonorepo: false,
    rootPath,
  };

  if (!rootPath) {
    log("No workspace folder for project detection");
    return context;
  }

  const rootUri = vscode.Uri.file(rootPath);

  // Detect project type from manifest files
  const detectedType = await detectProjectType(rootUri);
  context.projectType = detectedType;

  // Infer languages from project type and changed files
  const languages = new Set<string>();
  if (detectedType === "node") {
    languages.add("javascript");
    languages.add("typescript");
  } else if (detectedType === "python") {
    languages.add("python");
  } else if (detectedType === "rust") {
    languages.add("rust");
  } else if (detectedType === "go") {
    languages.add("go");
  } else if (detectedType === "java") {
    languages.add("java");
  } else if (detectedType === "dotnet") {
    languages.add("csharp");
  }

  // Refine languages from changed file extensions
  if (changedFilePaths?.length) {
    for (const path of changedFilePaths) {
      const ext = path.match(/\.[^.]+$/)?.[0];
      if (ext && EXTENSION_TO_LANGUAGE[ext]) {
        languages.add(EXTENSION_TO_LANGUAGE[ext]);
      }
    }
  }

  // Apply language override if set
  const preferredOverride = getPreferredLanguageOverride();
  context.languages =
    preferredOverride.length > 0 ? preferredOverride : Array.from(languages);

  // Detect frameworks from package.json (Node) or pyproject.toml (Python)
  if (detectedType === "node") {
    context.frameworks = await detectNodeFrameworks(rootUri);
  } else if (detectedType === "python") {
    context.frameworks = await detectPythonFrameworks(rootUri);
  }

  // Detect monorepo
  context.isMonorepo = await detectMonorepo(rootUri);

  log(
    `Project detected: type=${context.projectType}, languages=[${context.languages.join(", ")}], frameworks=[${context.frameworks.join(", ")}], monorepo=${context.isMonorepo}`
  );

  return context;
}

async function detectProjectType(rootUri: vscode.Uri): Promise<ProjectType> {
  for (const { file, type } of MANIFEST_INDICATORS) {
    const uri = vscode.Uri.joinPath(rootUri, file);
    try {
      await vscode.workspace.fs.readFile(uri);
      return type;
    } catch {
      // File doesn't exist, continue
    }
  }

  // Check for .NET projects
  const csprojFiles = await vscode.workspace.findFiles("**/*.csproj", null, 1);
  if (csprojFiles.length > 0) return "dotnet";

  return "unknown";
}

async function detectNodeFrameworks(rootUri: vscode.Uri): Promise<Framework[]> {
  const frameworks: Framework[] = [];
  const packageJsonUri = vscode.Uri.joinPath(rootUri, "package.json");

  try {
    const content = await vscode.workspace.fs.readFile(packageJsonUri);
    const json = JSON.parse(content.toString()) as Record<string, unknown>;
    const deps = {
      ...((json.dependencies as Record<string, string>) ?? {}),
      ...((json.devDependencies as Record<string, string>) ?? {}),
    };

    const depNames = Object.keys(deps).map((k) => k.toLowerCase());

    if (depNames.some((d) => d.includes("react"))) frameworks.push("react");
    if (depNames.some((d) => d.includes("vue"))) frameworks.push("vue");
    if (depNames.some((d) => d.includes("@angular"))) frameworks.push("angular");
    if (depNames.some((d) => d.includes("svelte"))) frameworks.push("svelte");
    if (depNames.some((d) => d.includes("express"))) frameworks.push("express");
    if (depNames.some((d) => d.includes("fastify"))) frameworks.push("fastify");
    if (depNames.some((d) => d.includes("@nestjs"))) frameworks.push("nest");
    if (depNames.some((d) => d.includes("jest"))) frameworks.push("jest");
    if (depNames.some((d) => d.includes("vitest"))) frameworks.push("vitest");
    if (depNames.some((d) => d.includes("playwright"))) frameworks.push("playwright");
    if (depNames.some((d) => d.includes("cypress"))) frameworks.push("cypress");
  } catch {
    // No package.json or parse error
  }

  return frameworks;
}

async function detectPythonFrameworks(rootUri: vscode.Uri): Promise<Framework[]> {
  const frameworks: Framework[] = [];

  // Check pyproject.toml
  const pyprojectUri = vscode.Uri.joinPath(rootUri, "pyproject.toml");
  try {
    const content = await vscode.workspace.fs.readFile(pyprojectUri);
    const text = content.toString();
    if (text.includes("django")) frameworks.push("django");
    if (text.includes("fastapi")) frameworks.push("fastapi");
    if (text.includes("flask")) frameworks.push("flask");
    if (text.includes("pytest")) frameworks.push("pytest");
  } catch {
    // File doesn't exist
  }

  // Check requirements.txt
  const reqUri = vscode.Uri.joinPath(rootUri, "requirements.txt");
  try {
    const content = await vscode.workspace.fs.readFile(reqUri);
    const text = content.toString().toLowerCase();
    if (text.includes("django")) frameworks.push("django");
    if (text.includes("fastapi")) frameworks.push("fastapi");
    if (text.includes("flask")) frameworks.push("flask");
    if (text.includes("pytest")) frameworks.push("pytest");
  } catch {
    // File doesn't exist
  }

  return [...new Set(frameworks)];
}

async function detectMonorepo(rootUri: vscode.Uri): Promise<boolean> {
  // Check for common monorepo patterns
  const indicators = [
    "packages/",
    "apps/",
    "pnpm-workspace.yaml",
    "lerna.json",
    "nx.json",
    "turbo.json",
  ];

  for (const indicator of indicators) {
    if (indicator.endsWith("/")) {
      const dirUri = vscode.Uri.joinPath(rootUri, indicator);
      try {
        await vscode.workspace.fs.readDirectory(dirUri);
        return true;
      } catch {
        // Directory doesn't exist
      }
    } else {
      const fileUri = vscode.Uri.joinPath(rootUri, indicator);
      try {
        await vscode.workspace.fs.readFile(fileUri);
        return true;
      } catch {
        // File doesn't exist
      }
    }
  }

  // Check package.json workspaces
  const packageJsonUri = vscode.Uri.joinPath(rootUri, "package.json");
  try {
    const content = await vscode.workspace.fs.readFile(packageJsonUri);
    const json = JSON.parse(content.toString()) as Record<string, unknown>;
    const workspaces = json.workspaces;
    if (workspaces && (Array.isArray(workspaces) ? workspaces.length > 0 : true)) {
      return true;
    }
  } catch {
    // Ignore
  }

  return false;
}
