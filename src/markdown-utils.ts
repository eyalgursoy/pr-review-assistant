/**
 * Markdown sanitization utilities for safe display
 * Prevents XSS via HTML/JavaScript injection
 */

/**
 * Sanitize AI-generated content for safe display in markdown
 */
export function sanitizeMarkdownForDisplay(text: string): string {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\[([^\]]*)\]\((javascript|data):[^)]*\)/gi, "[$1](#)")
    .replace(/[\x00-\x1F\x7F]/g, " ");
}
