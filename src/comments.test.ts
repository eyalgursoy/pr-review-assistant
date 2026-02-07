/**
 * Tests for comment markdown sanitization
 */

import { describe, it, expect } from "vitest";
import { sanitizeMarkdownForDisplay } from "./markdown-utils";

describe("sanitizeMarkdownForDisplay", () => {
  it("should escape HTML entities", () => {
    expect(sanitizeMarkdownForDisplay("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;"
    );
    expect(sanitizeMarkdownForDisplay("a & b")).toBe("a &amp; b");
  });

  it("should remove javascript: links", () => {
    const input = "Click [here](javascript:alert('xss'))";
    expect(sanitizeMarkdownForDisplay(input)).toContain("[here](#)");
    expect(sanitizeMarkdownForDisplay(input)).not.toContain("javascript:");
  });

  it("should remove data: links", () => {
    const input = "See [image](data:text/html,<script>alert(1)</script>)";
    expect(sanitizeMarkdownForDisplay(input)).toContain("[image](#)");
    expect(sanitizeMarkdownForDisplay(input)).not.toContain("data:");
  });

  it("should strip control characters", () => {
    expect(sanitizeMarkdownForDisplay("hello\x00world")).toContain("hello");
    expect(sanitizeMarkdownForDisplay("a\nb")).toContain("a b");
  });

  it("should return empty string for empty input", () => {
    expect(sanitizeMarkdownForDisplay("")).toBe("");
    expect(sanitizeMarkdownForDisplay(null as any)).toBe("");
  });

  it("should preserve safe content", () => {
    const input = "Normal **bold** text with `code`";
    expect(sanitizeMarkdownForDisplay(input)).toBe(input);
  });
});
