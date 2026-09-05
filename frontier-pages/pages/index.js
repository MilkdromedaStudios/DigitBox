import Head from "next/head";
import FrontierGame from "../components/FrontierGame";

export default function DeepforgePagesPrototype() {
  return (
    <main style={{ minHeight: "100vh", background: "#03070c", padding: "12px 0" }}>
      <Head>
        <title>DEEPFORGE — DigitBox</title>
        <meta
          name="description"
          content="A playable mining, engineering, city-building and rivalry prototype from DigitBox."
        />
      </Head>
      <FrontierGame />
    </main>
  );
}