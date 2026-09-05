import Head from "next/head";
import BetaGame from "../components/deepforge/BetaGame";

export default function BetaPage() {
  return (
    <>
      <Head>
        <title>DigitBox Beta</title>
        <meta name="description" content="Private DigitBox game beta." />
        <meta name="robots" content="noindex,nofollow,noarchive,nosnippet" />
        <meta name="googlebot" content="noindex,nofollow,noarchive,nosnippet" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#03070c" />
      </Head>
      <main className="df-beta-page">
        <BetaGame />
      </main>
    </>
  );
}
