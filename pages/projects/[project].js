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

export async function getServerSideProps({ params }) {
  const rawSlug = Array.isArray(params.project) ? params.project[0] : params.project;
  const slug = decodeURIComponent(rawSlug || "");
  const filename = `${slug}.html`
    .split("/")
    .map(encodeURIComponent)
    .join("/");

  return {
    props: {
      src: `/projects/${filename}`,
      title: slug,
    },
  };
}
