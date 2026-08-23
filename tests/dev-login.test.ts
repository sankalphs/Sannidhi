import { afterEach, describe, expect, it } from "vitest";

import { isDevLoginEnabled } from "@/lib/auth/dev-login";

const ORIGINAL: Record<string, string | undefined> = {
  ENABLE_DEV_LOGIN: process.env.ENABLE_DEV_LOGIN,
  NODE_ENV: process.env.NODE_ENV,
  VERCEL_ENV: process.env.VERCEL_ENV,
};

function setEnv(values: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

afterEach(() => {
  setEnv(ORIGINAL);
});

describe("isDevLoginEnabled", () => {
  it("is disabled unless explicitly enabled", () => {
    setEnv({ ENABLE_DEV_LOGIN: undefined });
    expect(isDevLoginEnabled()).toBe(false);
  });

  it("allows non-production environments when enabled", () => {
    setEnv({ ENABLE_DEV_LOGIN: "1", NODE_ENV: "development" });
    expect(isDevLoginEnabled()).toBe(true);
  });

  it("blocks production deployments even when enabled", () => {
    setEnv({ ENABLE_DEV_LOGIN: "1", NODE_ENV: "production", VERCEL_ENV: "production" });
    expect(isDevLoginEnabled()).toBe(false);
  });

  it("allows Vercel previews when enabled", () => {
    setEnv({ ENABLE_DEV_LOGIN: "1", NODE_ENV: "production", VERCEL_ENV: "preview" });
    expect(isDevLoginEnabled()).toBe(true);
  });
});
