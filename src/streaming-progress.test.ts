/**
 * Tests for streaming-progress utility functions
 */

import { describe, it, expect, vi } from "vitest";

// Mock vscode before importing
vi.mock("vscode", () => ({
  EventEmitter: class {
    event = () => ({ dispose: () => {} });
    fire() {}
  },
}));

// Mock logger to avoid vscode dependency
vi.mock("./logger", () => ({
  log: vi.fn(),
}));

import {
  formatElapsedTime,
  formatCost,
  formatTokens,
  estimateTokens,
} from "./streaming-progress";

describe("formatElapsedTime", () => {
  it("should format milliseconds", () => {
    expect(formatElapsedTime(500)).toBe("500ms");
    expect(formatElapsedTime(999)).toBe("999ms");
  });

  it("should format seconds", () => {
    expect(formatElapsedTime(1000)).toBe("1.0s");
    expect(formatElapsedTime(1500)).toBe("1.5s");
    expect(formatElapsedTime(30000)).toBe("30.0s");
    expect(formatElapsedTime(59999)).toBe("60.0s");
  });

  it("should format minutes and seconds", () => {
    expect(formatElapsedTime(60000)).toBe("1m 0s");
    expect(formatElapsedTime(90000)).toBe("1m 30s");
    expect(formatElapsedTime(125000)).toBe("2m 5s");
    expect(formatElapsedTime(3600000)).toBe("60m 0s");
  });

  it("should handle edge cases", () => {
    expect(formatElapsedTime(0)).toBe("0ms");
    expect(formatElapsedTime(1)).toBe("1ms");
  });
});

describe("formatCost", () => {
  it("should return 'free' for zero cost", () => {
    expect(formatCost(0)).toBe("free");
  });

  it("should format very small costs", () => {
    expect(formatCost(0.0001)).toBe("<$0.001");
    expect(formatCost(0.0009)).toBe("<$0.001");
  });

  it("should format small costs with 4 decimal places", () => {
    expect(formatCost(0.001)).toBe("$0.0010");
    expect(formatCost(0.0055)).toBe("$0.0055");
    expect(formatCost(0.0099)).toBe("$0.0099");
  });

  it("should format normal costs with 3 decimal places", () => {
    expect(formatCost(0.01)).toBe("$0.010");
    expect(formatCost(0.123)).toBe("$0.123");
    expect(formatCost(1.5)).toBe("$1.500");
    expect(formatCost(10.99)).toBe("$10.990");
  });
});

describe("formatTokens", () => {
  it("should format small token counts as-is", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(500)).toBe("500");
    expect(formatTokens(999)).toBe("999");
  });

  it("should format thousands with one decimal", () => {
    expect(formatTokens(1000)).toBe("1.0k");
    expect(formatTokens(1500)).toBe("1.5k");
    expect(formatTokens(9999)).toBe("10.0k");
  });

  it("should format large numbers rounded to k", () => {
    expect(formatTokens(10000)).toBe("10k");
    expect(formatTokens(15000)).toBe("15k");
    expect(formatTokens(100000)).toBe("100k");
    expect(formatTokens(1000000)).toBe("1000k");
  });
});

describe("estimateTokens", () => {
  it("should estimate ~4 chars per token", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("test")).toBe(1);
    expect(estimateTokens("hello")).toBe(2);
    expect(estimateTokens("hello world")).toBe(3);
  });

  it("should round up", () => {
    expect(estimateTokens("a")).toBe(1);
    expect(estimateTokens("ab")).toBe(1);
    expect(estimateTokens("abc")).toBe(1);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
  });

  it("should handle longer text", () => {
    const text = "a".repeat(100);
    expect(estimateTokens(text)).toBe(25);

    const longerText = "a".repeat(1000);
    expect(estimateTokens(longerText)).toBe(250);
  });
});
