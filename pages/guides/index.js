import Head from "next/head";
import Link from "next/link";
import Icon from "../../components/Icon";
import { GUIDES } from "../../lib/guides";

export default function GuidesIndexPage() {
  return (
    <>
      <Head>
        <title>Guides and Help - DigitBox</title>
        <meta name="description" content="Practical DigitBox guides to browser games, game saves, troubleshooting and the unofficial Minecraft browser launcher." />
      </Head>
      <div className="hub-page">
        <header className="hub-page-head">
          <div>
            <span className="hub-kicker">DIGITBOX HELP</span>
            <h1>Guides and practical help</h1>
            <p>Clear explanations of how DigitBox features work, where their limits are, and what to try when something goes wrong.</p>
          </div>
        </header>
        <div className="hub-guide-grid">
          {GUIDES.map((guide) => (
            <article className="hub-guide-card" key={guide.slug}>
              <span className="hub-guide-meta">{guide.readingTime} · Reviewed {guide.updated}</span>
              <h2><Link href={"/guides/" + guide.slug}>{guide.title}</Link></h2>
              <p>{guide.description}</p>
              <Link className="hub-guide-link" href={"/guides/" + guide.slug}>
                Read guide <Icon name="chevron" size={16} />
              </Link>
            </article>
          ))}
        </div>
        <p className="hub-guide-note">These guides describe DigitBox's current features and known limitations. The game catalogue and upstream projects can change independently, so check a game's own source information when compatibility matters.</p>
      </div>
    </>
  );
}
