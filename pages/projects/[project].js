import Head from "next/head";
import GameFrame from "../../components/GameFrame";
import HubProjectFrame from "../../components/HubProjectFrame";
import { GAMES } from "../../lib/catalog";
import { getProject } from "../../lib/hubProjects";
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

// A shown project from the admin page (lib/hubProjects.js), or null.
async function findHubProject(slug) {
  if (GAMES.some((game) => game.slug === slug)) return null;
  const db = getD1();
  if (!db) return null;
  const project = await getProject(db, slug).catch(() => null);
  return project && project.visible && project.htmlBytes > 0 ? project : null;
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

  const hubProject = await findHubProject(slug);
  if (hubProject) return { props: { hubProject } };

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
