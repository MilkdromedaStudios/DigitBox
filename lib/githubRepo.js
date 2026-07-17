// The GitHub repo that stores the content. Reads default to the public repo
// so deployments serve games and posts without any environment configuration;
// the env variables stay as overrides, and writes (publish/delete) still
// require GITHUB_TOKEN.
const DEFAULT_OWNER = "MilkdromedaStudios";
const DEFAULT_REPO = "DigitBox";

export function getGithubRepo() {
  return {
    owner: process.env.GITHUB_REPO_OWNER || DEFAULT_OWNER,
    repo: process.env.GITHUB_REPO_NAME || DEFAULT_REPO,
    branch: process.env.GITHUB_REPO_BRANCH || "main",
  };
}
