/**
 * Vercel ignored-build step.
 * Exit 1 → compile and deploy. Exit 0 → cancel the deployment.
 *
 * Git starts a Vercel build at the same time as GitHub Actions. This waits for
 * the CI workflow on the same commit and cancels the build unless that run
 * passed, so a red check does not spend a Next.js compile.
 */

const sha = process.env.VERCEL_GIT_COMMIT_SHA;
const owner = process.env.VERCEL_GIT_REPO_OWNER;
const repo = process.env.VERCEL_GIT_REPO_SLUG;

const code = await decision();
process.exitCode = code;

async function decision() {
  if (!sha || !owner || !repo) {
    console.log("No Vercel git metadata; building.");
    return 1;
  }

  const deadline = Date.now() + 30 * 60 * 1000;
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/ci.yml/runs?head_sha=${encodeURIComponent(sha)}&per_page=20`;

  while (true) {
    const response = await fetch(url, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "stadium-vercel-ignore" },
    });

    if (response.status === 403 || response.status === 429) {
      console.log(`GitHub rate limited (${response.status}); waiting.`);
    } else if (!response.ok) {
      console.log(`Could not read CI (${response.status}); building so a lookup failure does not block a release.`);
      return 1;
    } else {
      const body = await response.json();
      const runs = [...(body.workflow_runs ?? [])].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
      const run = runs[0];
      if (run?.status === "completed") {
        if (run.conclusion === "success") {
          console.log(`CI passed for ${sha.slice(0, 7)}; building.`);
          return 1;
        }
        console.log(`CI ${run.conclusion} for ${sha.slice(0, 7)}; skipping the Vercel build.`);
        return 0;
      }
      console.log(run ? `CI is ${run.status}; waiting.` : "CI has not started; waiting.");
    }

    if (Date.now() > deadline) {
      console.log("CI did not finish within 30 minutes; skipping the Vercel build.");
      return 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 45_000));
  }
}
