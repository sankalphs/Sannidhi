import { spawnSync } from "node:child_process";

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: true });
  if (result.error !== undefined) {
    console.error("[build] failed to spawn:", result.error);
  }
  process.exit(result.status ?? 1);
}

// Deploy the Convex backend together with the frontend when a deploy key is
// present (Vercel production/preview). NOTE: `convex deploy --cmd` runs
// `next build` BEFORE Convex pushes functions/schema, and Convex does not roll
// back automatically if the Vercel publication fails afterwards — so backend
// changes must stay backward-compatible with the previous frontend during
// rollout. Locally there is no deploy key — just build.
if (process.env.CONVEX_DEPLOY_KEY) {
  run("convex", ["deploy", "--cmd", "next build --turbopack"]);
} else {
  run("next", ["build", "--turbopack"]);
}
