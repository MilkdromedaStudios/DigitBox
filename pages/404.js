import Head from "next/head";
import Link from "next/link";
import Icon from "../components/Icon";

// Also shown for games that were removed or hidden (pages/projects/[project].js).
export default function NotFoundPage() {
  return (
    <>
      <Head>
        <title>Not found - DigitBox</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div className="hub-page">
        <div className="hub-empty">
          <Icon name="search" />
          <h2>This page isn&apos;t here</h2>
          <p>The game or page may have been removed, or the link has a typo.</p>
          <div className="admin-actions">
            <Link href="/games" className="hub-pill-btn is-primary">Browse games</Link>
            <Link href="/" className="hub-pill-btn">Go home</Link>
          </div>
        </div>
      </div>
    </>
  );
}
