// Access to the Cloudflare R2 bucket that stores published content (game and
// post HTML). Two access paths:
//
// 1. R2 bucket binding (Cloudflare Pages): bind the `digitbox-games` bucket to
//    the Pages project with the binding name DIGITBOX_GAMES (Settings ->
//    Bindings -> R2 bucket). next-on-pages exposes bindings on process.env.
// 2. Public bucket URL (any host, e.g. the Vercel deployment): enable public
//    access on the bucket (r2.dev domain or a custom domain) and set the
//    R2_PUBLIC_BASE_URL environment variable to it.

export function getContentBucket() {
  const bucket = process.env.DIGITBOX_GAMES;
  if (bucket && typeof bucket === "object" && typeof bucket.get === "function") {
    return bucket;
  }
  return null;
}

export function getR2PublicBaseUrl() {
  const base = process.env.R2_PUBLIC_BASE_URL || "";
  return base.replace(/\/+$/, "");
}

// Repo paths like "public/projects/Foo.html" map to R2 keys like
// "projects/Foo.html".
export function toR2Key(filePath) {
  return String(filePath || "").replace(/^public\//, "");
}

export function r2PublicUrlForKey(key) {
  const base = getR2PublicBaseUrl();
  if (!base) return null;
  return `${base}/${key.split("/").map(encodeURIComponent).join("/")}`;
}
