import { fetchWithRetry, toFriendlyNetworkError } from "./fetchWithRetry";

const GITHUB_API = "https://api.github.com";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function authHeaders() {
  return {
    Authorization: `Bearer ${required("GITHUB_TOKEN")}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function getFileSha(owner, repo, branch, path) {
  const res = await fetchWithRetry(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${branch}`, { headers: authHeaders() }, { retries: 3, timeoutMs: 12000 });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub lookup failed (${res.status})`);
  const json = await res.json();
  return json.sha;
}

export async function upsertRepoFile({ path, content, message }) {
  const owner = required("GITHUB_REPO_OWNER");
  const repo = required("GITHUB_REPO_NAME");
  const branch = process.env.GITHUB_REPO_BRANCH || "main";
  let sha;
  try {
    sha = await getFileSha(owner, repo, branch, path);
  } catch (error) {
    throw new Error(`GitHub lookup error: ${toFriendlyNetworkError(error)}`);
  }

  let res;
  try {
    res = await fetchWithRetry(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}`, {
    method: "PUT",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      content: Buffer.from(content, "utf8").toString("base64"),
      branch,
      sha: sha || undefined,
    }),
  });

  } catch (error) {
    throw new Error(`GitHub write network error: ${toFriendlyNetworkError(error)}`);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub write failed (${res.status}): ${text}`);
  }

  return res.json();
}
