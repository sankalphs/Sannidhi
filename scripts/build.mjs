import { spawnSync } from "node:child_process";

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  process.exit(result.status ?? 1);
}

// Keep the Convex deployment in lockstep with the frontend: when a deploy key
// is present (Vercel production/preview), push functions and build in one
// atomic `convex deploy --cmd` so the app and its backend can never drift.
// Locally there is no deploy key — just build.
if (process.env.CONVEX_DEPLOY_KEY) {
  run("npx", ["convex", "deploy", "--cmd", "next build --turbopack"]);
} else {
  run("npx", ["next", "build", "--turbopack"]);
}
