import Head from "next/head";
import Link from "next/link";

export default function AboutPage() {
  return (
    <>
      <Head>
        <title>About DigitBox</title>
        <meta
          name="description"
          content="Learn what DigitBox is and how its games, mods, tools, posts, and AppGPT projects are organized."
        />
      </Head>

      <article className="section content-page">
        <p className="post-meta">ABOUT DIGITBOX</p>
        <h1>Projects made to be tried, not just listed.</h1>
        <p>
          DigitBox is a personal project hub for browser games, Minecraft
          experiments, coding tools, development notes, and AppGPT. It is a
          place to publish small ideas while they are still connected to the
          questions that produced them: What happens if this mechanic changes?
          Can this tool work on mobile? Can a project be easier to install,
          save, or understand?
        </p>
        <p>
          The site is connected to the public DigitBox GitHub repository. The
          repository stores the website code, project indexes, posts, and
          smaller content files. Larger game assets can be published through
          GitHub release assets so a game can remain playable without making
          every website build unnecessarily large.
        </p>

        <h2>What you can do here</h2>
        <div className="card-grid">
          <section className="card">
            <h3>Play and test</h3>
            <p>
              Open a project from the gallery and try it in the browser. Some
              games also provide optional save, export, and restore tools.
            </p>
          </section>
          <section className="card">
            <h3>Read the reasoning</h3>
            <p>
              Posts and changelog entries provide context for updates, fixes,
              experiments, and features that are difficult to explain from a
              project thumbnail alone.
            </p>
          </section>
          <section className="card">
            <h3>Build with AppGPT</h3>
            <p>
              AppGPT is a separate DigitBox surface for turning a conversation
              into an editable Telegram Mini App, with preview, debugging, and
              publishing tools.
            </p>
          </section>
        </div>

        <h2>How projects are presented</h2>
        <p>
          DigitBox keeps the original project link close to the playable
          experience. Titles, descriptions, update notes, and external links
          may change as a project develops. A project page is therefore a
          snapshot of the current build, not a promise that every experiment is
          finished or production-ready.
        </p>
        <p>
          DigitBox is independent. It is not an official Minecraft, Telegram,
          GitHub, Modrinth, Planet Minecraft, or YouTube site, and links to
          those services do not imply endorsement.
        </p>

        <div className="gallery-actions">
          <Link href="/gallery" className="auth-btn action-btn">Browse projects</Link>
          <Link href="/posts" className="auth-btn action-btn">Read posts</Link>
          <Link href="/privacy" className="auth-btn action-btn">Privacy</Link>
        </div>
      </article>
    </>
  );
}
