#!/usr/bin/env node
// Uploads game/post HTML files to the digitbox-games R2 bucket via wrangler.
//
// Run this on a machine that has the REAL files (not git-lfs pointers), e.g.
// your local checkout after `git lfs pull`, or wherever the games are saved:
//
//   node scripts/upload-games-to-r2.mjs "/path/to/games directory"
//   node scripts/upload-games-to-r2.mjs "/path/to/Crystal Seeker 3D.html"
//
// Files are uploaded under the "projects/" prefix (pass --prefix posts/ for
// posts). Wrangler needs Cloudflare credentials: either run `npx wrangler
// login` first, or set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.

import { readdir, readFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const BUCKET = "digitbox-games";

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

const args = process.argv.slice(2);
const prefixFlag = args.indexOf("--prefix");
const prefix = prefixFlag !== -1 ? args.splice(prefixFlag, 2)[1] : "projects/";
const target = args[0];

if (!target) {
  console.error('Usage: node scripts/upload-games-to-r2.mjs <file-or-directory> [--prefix projects/]');
  process.exit(1);
}

const files = await collectFiles(target);
if (files.length === 0) {
  console.error(`No .html/.md files found in ${target}`);
  process.exit(1);
}

let failures = 0;
for (const file of files) {
  const name = path.basename(file);
  const key = `${prefix.replace(/\/?$/, "/")}${name}`;
  const head = await readFile(file).then((buf) => buf.slice(0, 200));

  if (isGitLfsPointer(head)) {
    console.error(`SKIP ${name}: this is a git-lfs pointer, not the real file. Run \`git lfs pull\` first or point the script at the real files.`);
    failures += 1;
    continue;
  }

  const contentType = name.endsWith(".md") ? "text/markdown; charset=utf-8" : "text/html; charset=utf-8";
  console.log(`Uploading ${name} -> r2://${BUCKET}/${key}`);
  const result = spawnSync(
    "npx",
    ["wrangler", "r2", "object", "put", `${BUCKET}/${key}`, "--file", file, "--content-type", contentType, "--remote"],
    { stdio: "inherit" }
  );

  if (result.status !== 0) {
    console.error(`FAILED ${name} (wrangler exited ${result.status}). On older wrangler versions, retry without --remote.`);
    failures += 1;
  }
}

console.log(failures === 0 ? "All files uploaded." : `${failures} file(s) failed or were skipped.`);
process.exit(failures === 0 ? 0 : 1);
