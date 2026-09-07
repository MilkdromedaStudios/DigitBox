import Head from "next/head";
import BetaGameV2 from "../components/deepforge/BetaGameV2";
import DeepforgeOwnerTools from "../components/deepforge/DeepforgeOwnerTools";
import DeepforgeAccountTools from "../components/deepforge/DeepforgeAccountTools";

export default function Home() {
  return (
    <>
      <Head>
        <title>DEEPFORGE — DigitBox</title>
        <meta
          name="description"
          content="DEEPFORGE is DigitBox's shared-world mining game. Mine, build your city, research technology, join clans, fight zombies, and explore the underground."
        />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no"
        />
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
