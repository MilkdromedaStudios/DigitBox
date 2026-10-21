import Head from "next/head";
import Link from "next/link";
import Icon from "../components/Icon";
import NotFoundPage from "./404";

// Cloudflare Pages renders this (not pages/404.js) for getServerSideProps
// notFound, e.g. a removed game, so 404s get the same page here.
function ErrorPage({ statusCode }) {
  if (statusCode === 404) return <NotFoundPage />;
  return (
    <>
      <Head>
        <title>Something went wrong - DigitBox</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div className="hub-page">
        <div className="hub-empty">
          <Icon name="info" />
          <h2>Something went wrong</h2>
          <p>Try again in a moment.</p>
          <Link href="/" className="hub-pill-btn is-primary">Go home</Link>
        </div>
      </div>
    </>
  );
}

ErrorPage.getInitialProps = ({ res, err }) => ({ statusCode: res ? res.statusCode : err ? err.statusCode || 500 : 404 });

export default ErrorPage;
