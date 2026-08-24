import { execSync } from "node:child_process";

const RESEED_COMMANDS = ["seed:clearDemoData", "seed:seedDemoData"] as const;

export function reseedDemoData(): boolean {
  try {
    for (const command of RESEED_COMMANDS) {
      execSync(`bunx convex run ${command}`, { stdio: "ignore" });
    }
    return true;
  } catch (cause) {
    console.warn(`[sannidhi-e2e] demo reseed skipped: ${String(cause)}`);
    return false;
  }
}

export default function globalSetup(): void {
  if (reseedDemoData()) {
    console.log("[sannidhi-e2e] demo data cleared and reseeded");
  } else {
    console.warn("[sannidhi-e2e] continuing without a deterministic reseed");
  }
}
