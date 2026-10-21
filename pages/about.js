import Head from "next/head";
import Link from "next/link";

export default function AboutPage() {
  return (
    <>
      <Head>
        <title>About DigitBox</title>
        <meta
          name="description"
          content="DigitBox is an entertainment hub for videos, Shorts and cloud games that run right in your browser."
        />
      </Head>

      <article className="section content-page">
        <p className="post-meta">ABOUT DIGITBOX</p>
        <h1>Watch, play, and come back for more.</h1>
        <p>
          DigitBox is an entertainment hub. Watch popular videos and Shorts
          from YouTube and from the DigitBox channel, then jump straight into
          a cloud game without downloading anything. Everything runs in your
          browser, on a laptop, a Chromebook, or a phone.
        </p>

        <h2>What you can do here</h2>
        <div className="card-grid">
          <section className="card">
            <h3>Watch videos</h3>
            <p>
              Browse what&apos;s popular on YouTube, search for anything, and
              swipe through Shorts. Save favourites and pick up where you left
              off from your Library.
            </p>
          </section>
          <section className="card">
            <h3>Play cloud games</h3>
            <p>
              Every game loads from the DigitBox cloud: 3D adventures,
              Scratch games, creator tools and more. Many games can
              autosave, export, and import progress on your device.
            </p>
          </section>
          <section className="card">
            <h3>Follow the community</h3>
            <p>
              Community posts and the changelog cover new games, new videos,
              and everything that changes on the site.
            </p>
          </section>
        </div>

        <h2>How it works</h2>
        <p>
          The site and its game catalog live in the public DigitBox GitHub
          repository. Larger game files are served from GitHub release assets
          or cloud storage, so games stay quick to load without making the
          website itself heavy. Videos come from YouTube through YouTube API
          Services and play in YouTube&apos;s own embedded player.
        </p>
        <p>
          DigitBox is independent. It is not an official Minecraft, Scratch,
          YouTube, GitHub, Modrinth, or Planet Minecraft site, and links to
          those services do not imply endorsement. Games keep the credit of
          their original creators.
        </p>

        <div className="gallery-actions">
          <Link href="/" className="auth-btn action-btn">Go to DigitBox</Link>
          <Link href="/games" className="auth-btn action-btn">Play cloud games</Link>
          <Link href="/privacy" className="auth-btn action-btn">Privacy</Link>
        </div>
      </article>
    </>
  );
}
