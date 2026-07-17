#!/usr/bin/env node
// Uploads game/post HTML files as assets on a GitHub release so deployed
// builds can fetch them at runtime. The files are far too big for the repo
// itself (Crystal Seeker 3D alone is over GitHub's 100 MB file limit), but
// release assets allow up to 2 GB per file with free downloads.
//
// Run this on a machine that has the REAL files (not git-lfs pointers):
//
//   node scripts/upload-games-to-github.mjs "/path/to/games directory"
//   node scripts/upload-games-to-github.mjs "/path/to/Crystal Seeker 3D.html"
//
// Needs GITHUB_TOKEN (with repo write access), GITHUB_REPO_OWNER and
// GITHUB_REPO_NAME — from the environment or .env.local/.env. The release is
// looked up by tag, GITHUB_ASSETS_TAG (default "game-assets"), and created if
// it does not exist. Existing assets with the same name are replaced.

import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const GITHUB_API = "https://api.github.com";

function loadEnvFile(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^(['"])(.*)\1$/, "$2");
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name} (set it in the environment or .env.local)`);
    process.exit(1);
  }
  return value;
}

const token = required("GITHUB_TOKEN");
const owner = process.env.GITHUB_REPO_OWNER || "MilkdromedaStudios";
const repo = process.env.GITHUB_REPO_NAME || "DigitBox";
const tag = process.env.GITHUB_ASSETS_TAG || "game-assets";

function apiHeaders(extra) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...extra,
  };
}

// Must match normalizeAssetName in lib/githubAssets.js: GitHub sanitizes
// uploaded asset names ("Appel 3D.html" is stored as "Appel.3D.html").
function normalizeAssetName(name) {
  return String(name || "")
    .replace(/[^0-9A-Za-z_.-]/g, ".")
    .replace(/\.{2,}/g, ".")
    .toLowerCase();
}

function isGitLfsPointer(buffer) {
  return buffer.slice(0, 60).toString("utf8").startsWith("version https://git-lfs.github.com/spec/v1");
}

async function collectFiles(target) {
  const info = await stat(target);
  if (info.isFile()) return [target];
  const entries = await readdir(target, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /\.(html|md)$/i.test(entry.name))
    .map((entry) => path.join(target, entry.name));
}

async function getOrCreateRelease() {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`, {
    headers: apiHeaders(),
  });
  if (res.ok) return res.json();
  if (res.status !== 404) throw new Error(`Release lookup failed (${res.status}): ${await res.text()}`);

  console.log(`Creating release "${tag}"...`);
  const createRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/releases`, {
    method: "POST",
    headers: apiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      tag_name: tag,
      name: "Game assets",
      body: "Game HTML files served to the site at runtime. Managed by scripts/upload-games-to-github.mjs — do not delete.",
      prerelease: true,
    }),
  });
  if (!createRes.ok) throw new Error(`Release create failed (${createRes.status}): ${await createRes.text()}`);
  return createRes.json();
}

async function deleteExistingAsset(release, name) {
  const wanted = normalizeAssetName(name);
  const existing = (release.assets || []).find((asset) => normalizeAssetName(asset.name) === wanted);
  if (!existing) return;

  console.log(`  Replacing existing asset ${existing.name}`);
  const res = await fetch(existing.url, { method: "DELETE", headers: apiHeaders() });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Asset delete failed (${res.status}): ${await res.text()}`);
  }
}

async function uploadAsset(release, file) {
  const name = path.basename(file);
  const body = await readFile(file);

  if (isGitLfsPointer(body)) {
    throw new Error("this is a git-lfs pointer, not the real file — point the script at the real files");
  }

  await deleteExistingAsset(release, name);

  const uploadUrl = String(release.upload_url || "").replace(/\{[^}]*\}$/, "");
  const contentType = name.toLowerCase().endsWith(".md") ? "text/markdown; charset=utf-8" : "text/html; charset=utf-8";
  const sizeMb = (body.length / (1024 * 1024)).toFixed(1);
  console.log(`Uploading ${name} (${sizeMb} MB) -> release "${tag}"`);

  const res = await fetch(`${uploadUrl}?name=${encodeURIComponent(name)}`, {
    method: "POST",
    headers: apiHeaders({ "Content-Type": contentType, "Content-Length": String(body.length) }),
    body,
  });
  if (!res.ok) throw new Error(`Upload failed (${res.status}): ${await res.text()}`);

  const asset = await res.json();
  console.log(`  Stored as ${asset.name}`);
}

const target = process.argv[2];
if (!target) {
  console.error('Usage: node scripts/upload-games-to-github.mjs <file-or-directory>');
  process.exit(1);
}

const files = await collectFiles(target);
if (files.length === 0) {
  console.error(`No .html/.md files found in ${target}`);
  process.exit(1);
}

const release = await getOrCreateRelease();

let failures = 0;
for (const file of files) {
  try {
    await uploadAsset(release, file);
  } catch (error) {
    console.error(`FAILED ${path.basename(file)}: ${error.message}`);
    failures += 1;
  }
}

console.log(failures === 0 ? "All files uploaded." : `${failures} file(s) failed or were skipped.`);
process.exit(failures === 0 ? 0 : 1);
