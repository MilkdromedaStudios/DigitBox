import Head from "next/head";
import GameFrame from "../../components/GameFrame";
import HubProjectFrame from "../../components/HubProjectFrame";
import { GAMES } from "../../lib/catalog";
import { blockedBuiltIns, builtInForFile, getProject, isValidSlug } from "../../lib/hubProjects";
import { getD1 } from "../../lib/serverAuth";

// Cloudflare Pages only supports the edge runtime for pages with
// getServerSideProps; the Node serverless default builds fine on Vercel/local
// but fails the Cloudflare Pages build.
export const config = { runtime: "experimental-edge" };

export default function ProjectRunner({ hubProject, src, title, slug, isExternal }) {
  if (hubProject) {
    return (
      <>
        <Head>
          <title>{hubProject.name + " - DigitBox"}</title>
          {hubProject.description && <meta name="description" content={hubProject.description} />}
        </Head>
        <HubProjectFrame project={hubProject} />
      </>
    );
  }
  return <GameFrame src={src} title={title} slug={slug} isExternal={isExternal} />;
}

// Built-in games hidden or deleted from the admin page get a 404, like their
// files (see isBlockedFile), whatever case or punctuation the address uses.
// Storage problems never block a game.
async function isBlocked(name) {
  const slug = builtInForFile(name) || name;
  const db = getD1();
  if (!db) return false;
  const blocked = await blockedBuiltIns(db).catch(() => null);
  return Boolean(blocked && blocked.has(slug));
}

export async function getServerSideProps({ params }) {
  const rawSlug = Array.isArray(params.project) ? params.project[0] : params.project;
  let slug = String(rawSlug || "");
  try {
    slug = decodeURIComponent(slug);
  } catch {
    /* already decoded */
  }

  if (slug === "Five Nights at Freddy's Launcher" || slug === "fnaf-launcher") {
    if (await isBlocked("fnaf-launcher")) return { notFound: true };
    return {
      props: {
        src: "https://irv77.github.io/FnafLauncher/",
        title: "Five Nights at Freddy's Launcher",
        slug: "fnaf-launcher",
        isExternal: true,
      },
    };
  }

  if (slug === "Eaglercraft Launcher" || slug === "eaglercraft-launcher") {
    if (await isBlocked("eaglercraft-launcher")) return { notFound: true };
    const filePath = "public/projects/eaglercraft-launcher.html";
    return {
      props: {
        src: `/api/content/file?path=${encodeURIComponent(filePath)}`,
        title: "Eaglercraft Launcher",
        slug: "eaglercraft-launcher",
        isExternal: false,
      },
    };
  }

  if (await isBlocked(slug)) return { notFound: true };
  if (!GAMES.some((game) => game.slug === slug) && isValidSlug(slug) && getD1()) {
    // An address in the added projects' format: one of those or nothing.
    const project = await getProject(getD1(), slug).catch(() => undefined);
    if (project && project.visible && project.htmlBytes > 0) return { props: { hubProject: project } };
    if (project !== undefined) return { notFound: true };
  }

  const filePath = `public/projects/${slug}.html`;

  return {
    props: {
      src: `/api/content/file?path=${encodeURIComponent(filePath)}`,
      title: slug,
      slug,
      isExternal: false,
    },
  };
}
