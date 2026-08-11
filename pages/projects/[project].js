import Link from "next/link";
import projectsIndex from "../../data/projects-index.json";
import GameFrame from "../../components/GameFrame";

// Cloudflare Pages only supports the edge runtime for pages with
// getServerSideProps; the Node serverless default builds fine on Vercel/local
// but fails the Cloudflare Pages build.
export const config = { runtime: "experimental-edge" };

export default function ProjectRunner({ src, title, slug, isExternal, unavailable }) {
  if (unavailable) {
    return (
      <main
        className="game-shell"
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "1.5rem",
          background:
            "radial-gradient(circle at 20% 10%, rgba(76, 201, 240, .18), transparent 34%), radial-gradient(circle at 80% 0%, rgba(139, 92, 246, .22), transparent 38%), var(--bg)",
        }}
      >
        <section
          className="section"
          style={{
            width: "min(100%, 560px)",
            margin: 0,
            padding: "clamp(1.4rem, 5vw, 2.4rem)",
            textAlign: "center",
          }}
        >
          <div aria-hidden="true" style={{ fontSize: "2.5rem", marginBottom: ".5rem" }}>
            🧊
          </div>
          <h1 style={{ margin: "0 0 .75rem" }}>Launcher unavailable</h1>
          <p className="post-meta" style={{ lineHeight: 1.65, margin: "0 auto 1.25rem" }}>
            The external Eaglercraft Launcher that DigitBox used has been removed from its host,
            so it can no longer be loaded here. This is not a problem with your browser or device.
          </p>
          <div style={{ display: "flex", gap: ".65rem", justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/gallery" className="auth-btn action-btn">
              ← Back to Gallery
            </Link>
            <a
              href="https://www.minecraft.net/"
              target="_blank"
              rel="noreferrer"
              className="btn-base action-btn"
            >
              Official Minecraft ↗
            </a>
          </div>
        </section>
      </main>
    );
  }

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
        src: null,
        title: "Eaglercraft Launcher",
        slug: "eaglercraft-launcher",
        isExternal: false,
        unavailable: true,
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
      unavailable: false,
    },
  };
}
