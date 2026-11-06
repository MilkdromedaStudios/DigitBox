import Head from "next/head";
import Link from "next/link";
import Icon from "../../components/Icon";
import { GUIDES, getGuide } from "../../lib/guides";

export default function GuideArticlePage({ guide }) {
  return (
    <>
      <Head>
        <title>{guide.title} | DigitBox Guides</title>
        <meta name="description" content={guide.description} />
        <meta name="robots" content="index,follow,max-image-preview:large" />
      </Head>
      <article className="section content-page hub-guide-article">
        <nav className="hub-guide-breadcrumb" aria-label="Breadcrumb">
          <Link href="/">Home</Link><span aria-hidden="true">/</span><Link href="/guides">Guides</Link>
        </nav>
        <p className="post-meta">DIGITBOX GUIDE · {guide.readingTime.toUpperCase()}</p>
        <h1>{guide.title}</h1>
        <p className="hub-guide-intro">{guide.intro}</p>
        <p className="hub-guide-reviewed">Last reviewed: {guide.updated}</p>
        <div className="hub-guide-body">
          {guide.sections.map((section) => (
            <section key={section.heading}>
              <h2>{section.heading}</h2>
              {(section.paragraphs || []).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
              {section.bullets && (
                <ul>{section.bullets.map((item) => <li key={item}>{item}</li>)}</ul>
              )}
            </section>
          ))}
        </div>
        <div className="hub-guide-related">
          <Link href="/guides"><Icon name="book-open" size={17} /> Browse all DigitBox guides</Link>
          <Link href="/games"><Icon name="games" size={17} /> Explore cloud games</Link>
        </div>
      </article>
    </>
  );
}

export async function getStaticPaths() {
  return { paths: GUIDES.map((guide) => ({ params: { guide: guide.slug } })), fallback: false };
}

export async function getStaticProps({ params }) {
  const guide = getGuide(params.guide);
  return guide ? { props: { guide } } : { notFound: true };
}
