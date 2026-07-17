import { fetchWithRetry, toFriendlyNetworkError } from "./fetchWithRetry";
import { encodeBase64Utf8 } from "./base64";
import { getGithubRepo } from "./githubRepo";

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
  const { owner, repo, branch } = getGithubRepo();
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
      content: encodeBase64Utf8(content),
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


export async function deleteRepoFile({ path, message }) {
  const { owner, repo, branch } = getGithubRepo();
  const sha = await getFileSha(owner, repo, branch, path);
  if (!sha) throw new Error("File not found");

  const res = await fetchWithRetry(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}`, {
    method: "DELETE",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ message, sha, branch }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub delete failed (${res.status}): ${text}`);
  }

  return res.json();
}
