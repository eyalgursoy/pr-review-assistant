/**
 * Tests for SecretStorage-based API key management
 */

import { describe, it, expect, beforeEach } from "vitest";
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
    } as unknown as { secrets: { get: (key: string) => Thenable<string | undefined>; store: (key: string, value: string) => Thenable<void>; delete: (key: string) => Thenable<void> } });
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
});
