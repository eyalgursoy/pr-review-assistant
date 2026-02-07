/**
 * Tests for SecretStorage-based API key management
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  initSecretStorage,
  getApiKey,
  setApiKey,
  deleteApiKey,
} from "./secrets";

function createMockSecretStorage() {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key),
    store: async (key: string, value: string) => {
      store.set(key, value);
    },
    delete: async (key: string) => {
      store.delete(key);
    },
  };
}

describe("secrets", () => {
  beforeEach(() => {
    initSecretStorage({
      secrets: createMockSecretStorage(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  });

  describe("setApiKey and getApiKey", () => {
    it("should store and retrieve API key", async () => {
      await setApiKey("anthropic", "sk-ant-test123");
      const key = await getApiKey("anthropic");
      expect(key).toBe("sk-ant-test123");
    });

    it("should return undefined for unset provider", async () => {
      const key = await getApiKey("openai");
      expect(key).toBeUndefined();
    });

    it("should support all providers", async () => {
      await setApiKey("anthropic", "key1");
      await setApiKey("openai", "key2");
      await setApiKey("gemini", "key3");
      await setApiKey("groq", "key4");

      expect(await getApiKey("anthropic")).toBe("key1");
      expect(await getApiKey("openai")).toBe("key2");
      expect(await getApiKey("gemini")).toBe("key3");
      expect(await getApiKey("groq")).toBe("key4");
    });
  });

  describe("deleteApiKey", () => {
    it("should remove stored key", async () => {
      await setApiKey("anthropic", "sk-ant-test");
      expect(await getApiKey("anthropic")).toBe("sk-ant-test");

      await deleteApiKey("anthropic");
      expect(await getApiKey("anthropic")).toBeUndefined();
    });

    it("should not throw when deleting non-existent key", async () => {
      await expect(deleteApiKey("openai")).resolves.not.toThrow();
    });
  });

  describe("getApiKey for unknown provider", () => {
    it("should return undefined for invalid provider", async () => {
      expect(await getApiKey("invalid-provider")).toBeUndefined();
      expect(await getApiKey("vscode-lm")).toBeUndefined();
      expect(await getApiKey("cursor-cli")).toBeUndefined();
    });
  });

  describe("setApiKey for unknown provider", () => {
    it("should silently ignore unknown providers", async () => {
      // Should not throw
      await expect(setApiKey("invalid-provider", "key")).resolves.not.toThrow();
      await expect(setApiKey("cursor-cli", "key")).resolves.not.toThrow();
    });
  });

  describe("deleteApiKey for unknown provider", () => {
    it("should silently ignore unknown providers", async () => {
      await expect(deleteApiKey("invalid-provider")).resolves.not.toThrow();
      await expect(deleteApiKey("vscode-lm")).resolves.not.toThrow();
    });
  });
});

describe("secrets without initialization", () => {
  // Test behavior when secretStorage is not initialized
  // We need a fresh module state, so we use dynamic import

  it("should return undefined when not initialized", async () => {
    // Reset module to get fresh state
    vi.resetModules();
    const { getApiKey: freshGetApiKey } = await import("./secrets");
    
    // Without calling initSecretStorage, should return undefined
    expect(await freshGetApiKey("anthropic")).toBeUndefined();
  });

  it("should not throw when setting key without initialization", async () => {
    vi.resetModules();
    const { setApiKey: freshSetApiKey } = await import("./secrets");
    
    await expect(freshSetApiKey("anthropic", "key")).resolves.not.toThrow();
  });

  it("should not throw when deleting key without initialization", async () => {
    vi.resetModules();
    const { deleteApiKey: freshDeleteApiKey } = await import("./secrets");
    
    await expect(freshDeleteApiKey("anthropic")).resolves.not.toThrow();
  });
});
