import Head from "next/head";
import FrontierGame from "../frontier-pages/components/FrontierGame";

export default function FrontierPage() {
  return (
    <>
      <Head>
        <title>DEEPFORGE — DigitBox</title>
        <meta
          name="description"
          content="Dig, engineer, upgrade a mining empire, and compete in the DEEPFORGE prototype."
        />
      </Head>
      <FrontierGame />
    </>
  );
}