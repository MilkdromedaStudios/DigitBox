import projectsIndex from "../../data/projects-index.json";

export const config = { runtime: "experimental-edge" };

export default function ProjectRunner({ src, title }) {
  return (
    <iframe
      title={title || "Project"}
      src={src}
      sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-popups allow-modals allow-forms allow-downloads"
      allow="autoplay; fullscreen; gamepad"
      style={{ width: "100%", height: "100vh", border: "none", display: "block", background: "#000" }}
    />
  );
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
  const metadata = projectMetadataForSlug(slug);

  if (metadata && typeof metadata !== "string") {
    return {
      props: {
        src: metadata.url || `/api/content/file?path=${encodeURIComponent(metadata.path)}`,
        title: metadata.title || slug,
      },
    };
  }

  const filePath = `public/projects/${slug}.html`;

  return {
    props: {
      src: `/api/content/file?path=${encodeURIComponent(filePath)}`,
      title: slug,
    },
  };
}
