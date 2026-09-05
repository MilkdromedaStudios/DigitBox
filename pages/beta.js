import Head from "next/head";
import BetaGameV2 from "../components/deepforge/BetaGameV2";
import DeepforgeOwnerTools from "../components/deepforge/DeepforgeOwnerTools";
import DeepforgeAccountTools from "../components/deepforge/DeepforgeAccountTools";

export default function BetaPage() {
  return (
    <>
      <Head>
        <title>DigitBox Beta</title>
        <meta name="description" content="Private DigitBox mining game beta." />
        <meta name="robots" content="noindex,nofollow,noarchive,nosnippet" />
        <meta name="googlebot" content="noindex,nofollow,noarchive,nosnippet" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" />
        <meta name="theme-color" content="#2d251d" />
      </Head>
      <main className="df-beta-page">
        <BetaGameV2 />
        <DeepforgeAccountTools />
        <DeepforgeOwnerTools />
      </main>
    </>
  );
}
