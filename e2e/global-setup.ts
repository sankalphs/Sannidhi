import { execSync } from "node:child_process";

/** Wipes the local deployment and reloads fixtures (needs SANNIDHI_TEST_FIXTURES=1 on Convex). */
export function resetFixtures(): boolean {
  try {
    execSync("bunx convex run testFixtures:reset", { stdio: "ignore" });
    return true;
  } catch (cause) {
    console.warn(`[sannidhi-e2e] fixture reset skipped: ${String(cause)}`);
    return false;
  }
}

export default function globalSetup(): void {
  if (resetFixtures()) {
    console.log("[sannidhi-e2e] test fixtures reset");
    return;
  }
  if (process.env.SANNIDHI_E2E_ALLOW_STALE_SEED === "1") {
    console.warn("[sannidhi-e2e] continuing without a deterministic fixture reset");
    return;
  }
  throw new Error(
    "[sannidhi-e2e] fixture reset failed; aborting the suite. " +
      "Set SANNIDHI_TEST_FIXTURES=1 on the Convex deployment, or " +
      "SANNIDHI_E2E_ALLOW_STALE_SEED=1 to run against stale data.",
  );
}
