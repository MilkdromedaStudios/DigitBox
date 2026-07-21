import projectsIndex from "../../data/projects-index.json";
import GameFrame from "../../components/GameFrame";

export default function ProjectRunner({ src, title, slug, isExternal }) {
  return <GameFrame src={src} title={title} slug={slug} isExternal={isExternal} />;
}

function projectMetadataForSlug(slug) {
  return projectsIndex.find((project) => {
    if (typeof project === "string") return project === slug;
    return project.slug === slug || project.title === slug;
  });
}

export async function getServerSideProps({ params }) {
  const rawSlug = Array.isArray(params.project) ? params.project[0] : params.project;
  const slug = decodeURIComponent(rawSlug || "");

  if (slug === "Eaglercraft Launcher" || slug === "eaglercraft-launcher") {
    return {
      props: {
        src: "https://irv77.github.io/AmplerLauncher/index.html",
        title: "Eaglercraft Launcher",
        slug: "eaglercraft-launcher",
        isExternal: true,
      },
    };
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
