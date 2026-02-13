/**
 * Provider registry - resolve PRProvider by host
 */

import type { HostType } from "../types";
import type { PRProvider } from "./types";
import { githubProvider } from "./github";
import { gitlabProvider } from "./gitlab";
import { bitbucketProvider } from "./bitbucket";

const providers: Record<HostType, PRProvider> = {
  github: githubProvider,
  gitlab: gitlabProvider,
  bitbucket: bitbucketProvider,
};

export function getProvider(host: HostType): PRProvider {
  const provider = providers[host];
  if (!provider) {
    throw new Error(`Unsupported host: ${host}`);
  }
  return provider;
}

export { githubProvider } from "./github";
export { gitlabProvider } from "./gitlab";
export { bitbucketProvider } from "./bitbucket";
export type { PRProvider, AuthStatus, SubmitResult } from "./types";
