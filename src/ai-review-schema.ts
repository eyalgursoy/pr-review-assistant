/**
 * Zod schema for AI review output validation
 * Isolated module for testability (no vscode dependency)
 */

import { z } from "zod";

export const FindingSchema = z
  .object({
    file: z.string(),
    line: z
      .union([z.number(), z.string()])
      .transform((v) => (typeof v === "string" ? parseInt(v, 10) : v)),
    endLine: z.number().optional(),
    side: z.enum(["LEFT", "RIGHT"]).optional(),
    severity: z.string().optional(),
    issue: z.string(),
    suggestion: z.string().optional(),
    codeSnippet: z.string().optional(),
  })
  .refine((f) => f.line >= 1, { message: "line must be >= 1", path: ["line"] });

export const AIReviewOutputSchema = z.object({
  summary: z.string().optional(),
  findings: z.array(FindingSchema).default([]),
});
