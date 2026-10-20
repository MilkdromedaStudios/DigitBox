import Head from "next/head";
import Link from "next/link";

export default function TermsPage() {
  return (
    <>
      <Head>
        <title>Terms of Use | DigitBox</title>
        <meta name="description" content="The terms for using DigitBox, including the YouTube Terms of Service that apply to videos." />
      </Head>

      <article className="section content-page">
        <p className="post-meta">DIGITBOX TERMS</p>
        <h1>Terms of use</h1>
        <p>
          These terms apply to digitbox.dev. By using DigitBox you agree to
          them and to the <Link href="/privacy" className="text-link">Privacy Policy</Link>.
          They were last updated on October 20, 2026.
        </p>

        <h2>Videos from YouTube</h2>
        <p>
          DigitBox uses YouTube API Services to show videos. By using DigitBox
          you agree to be bound by the{" "}
          <a className="text-link" href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">
            YouTube Terms of Service
          </a>
          . Videos play in YouTube&apos;s own player, so YouTube&apos;s rules,
          content, and any ads it shows apply. DigitBox is not run by, endorsed
          by, or affiliated with YouTube or Google.
        </p>

        <h2>Games and other content</h2>
        <p>
          Cloud games are provided as they are, for fun. Some are made by
          other creators, who keep the credit and rights to their work. Game
          saves, likes, and history are kept in your own browser, so clearing
          it removes them.
        </p>

        <h2>Accounts and DigitBox Pro</h2>
        <p>
          Keep your login details private. DigitBox Pro is a monthly
          subscription billed through Stripe. You can cancel anytime from your
          profile, and Pro stays active until the end of the paid period.
        </p>

        <h2>Using DigitBox fairly</h2>
        <p>
          Don&apos;t try to break, overload, or misuse the site or its accounts,
          and don&apos;t use it to harm or harass anyone. DigitBox may change or
          remove features at any time.
        </p>

        <div className="gallery-actions">
          <Link href="/" className="auth-btn action-btn">Back to DigitBox</Link>
          <Link href="/privacy" className="auth-btn action-btn">Privacy</Link>
        </div>
      </article>
    </>
  );
}
