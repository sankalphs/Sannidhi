import { afterEach, describe, expect, it } from "vitest";

import { isDemoLoginEnabled, isDevLoginEnabled } from "@/lib/auth/dev-login";

const ORIGINAL: Record<string, string | undefined> = {
  ENABLE_DEV_LOGIN: process.env.ENABLE_DEV_LOGIN,
  ENABLE_DEMO_LOGIN: process.env.ENABLE_DEMO_LOGIN,
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
    setEnv({ ENABLE_DEV_LOGIN: undefined, ENABLE_DEMO_LOGIN: undefined });
    expect(isDevLoginEnabled()).toBe(false);
  });

  it("allows non-production environments when enabled", () => {
    setEnv({ ENABLE_DEV_LOGIN: "1", NODE_ENV: "development", ENABLE_DEMO_LOGIN: undefined });
    expect(isDevLoginEnabled()).toBe(true);
  });

  it("blocks production deployments even when enabled", () => {
    setEnv({
      ENABLE_DEV_LOGIN: "1",
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      ENABLE_DEMO_LOGIN: undefined,
    });
    expect(isDevLoginEnabled()).toBe(false);
  });

  it("allows Vercel previews when enabled", () => {
    setEnv({ ENABLE_DEV_LOGIN: "1", NODE_ENV: "production", VERCEL_ENV: "preview" });
    expect(isDevLoginEnabled()).toBe(true);
  });
});

describe("isDemoLoginEnabled", () => {
  it("follows the dev-login gate when ENABLE_DEMO_LOGIN is unset", () => {
    setEnv({
      ENABLE_DEMO_LOGIN: undefined,
      ENABLE_DEV_LOGIN: "1",
      NODE_ENV: "development",
    });
    expect(isDemoLoginEnabled()).toBe(true);
    setEnv({ ENABLE_DEV_LOGIN: undefined });
    expect(isDemoLoginEnabled()).toBe(false);
  });

  it("is enabled in production when ENABLE_DEMO_LOGIN=1, even without dev login", () => {
    setEnv({
      ENABLE_DEMO_LOGIN: "1",
      ENABLE_DEV_LOGIN: undefined,
      NODE_ENV: "production",
      VERCEL_ENV: "production",
    });
    expect(isDemoLoginEnabled()).toBe(true);
    expect(isDevLoginEnabled()).toBe(false);
  });

  it("is disabled by default in production", () => {
    setEnv({
      ENABLE_DEMO_LOGIN: undefined,
      ENABLE_DEV_LOGIN: undefined,
      NODE_ENV: "production",
      VERCEL_ENV: "production",
    });
    expect(isDemoLoginEnabled()).toBe(false);
  });
});
