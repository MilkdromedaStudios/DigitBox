import Head from "next/head";
import Link from "next/link";

export default function PrivacyPage() {
  return (
    <>
      <Head>
        <title>Privacy Policy | DigitBox</title>
        <meta
          name="description"
          content="DigitBox privacy information for accounts, the video player, cloud game saves, and advertising."
        />
      </Head>

      <article className="section content-page">
        <p className="post-meta">DIGITBOX PRIVACY</p>
        <h1>Privacy information</h1>
        <p>
          This page explains the main data flows on DigitBox in plain language.
          It applies to digitbox.dev and its site features. It was last
          reviewed on October 20, 2026.
        </p>

        <h2>Browsing, videos, and cloud games</h2>
        <p>
          You can watch videos, play cloud games, and read posts without
          creating an account. Game and post files may be read from the
          DigitBox GitHub repository, GitHub release assets, or an optional
          content bucket used by the deployment.
        </p>

        <h2>YouTube API Services</h2>
        <p>
          DigitBox uses YouTube API Services to find and show videos. By
          watching videos on DigitBox you agree to the{" "}
          <a className="text-link" href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">
            YouTube Terms of Service
          </a>
          , and Google&apos;s use of data is covered by the{" "}
          <a className="text-link" href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">
            Google Privacy Policy
          </a>
          .
        </p>
        <p>
          When you search, the DigitBox server sends your search words to
          YouTube to get matching videos. Popular videos are shown for one
          country (the United States unless the site owner picks another). If
          the owner turns on per-country charts, the server also uses the
          country your request comes from (never your precise location).
          DigitBox does not send YouTube your account, email address, or
          anything that identifies you. It keeps video details from YouTube
          only briefly (a few days at most), in a cache, to stay within
          YouTube&apos;s usage limits, and your browser forgets watch history
          after 30 days.
        </p>

        <h2>The video player</h2>
        <p>
          Videos play in YouTube&apos;s embedded player, loaded from
          youtube-nocookie.com. The player only loads when you press play.
          From then on your browser connects to YouTube, and YouTube may show
          ads and use cookies or similar technologies under Google&apos;s
          privacy policy. Thumbnails and channel pictures are loaded from
          YouTube&apos;s image servers.
        </p>

        <h2>Accounts and profile preferences</h2>
        <p>
          DigitBox accounts use a Cloudflare D1 authentication system. The
          account stores the email address needed for login, a display name,
          password-verification data, session information, an optional profile
          picture, and DigitBox Pro subscription status. Accounts that played
          the retired DEEPFORGE beta may still have that game&apos;s progress
          stored with them. Visual profile preferences such as theme, accent
          color, or a local avatar may also be stored in your browser.
        </p>

        <h2>Local saves, likes, and history</h2>
        <p>
          Likes, watch and play history, the Library scratchpad, cloud game
          autosaves, and some visual preferences stay in your browser or on
          your device. Clearing browser storage removes this local data. You
          can also clear your history from the Library page.
        </p>

        <h2>Advertising and cookies</h2>
        <p>
          DigitBox may display Google AdSense advertising on pages that contain
          publisher content. Google and its partners may use cookies or similar
          technologies to deliver, measure, or personalize ads according to
          applicable settings and consent requirements. Learn more in
          <a
            className="text-link"
            href="https://policies.google.com/technologies/partner-sites"
            target="_blank"
            rel="noreferrer"
          >
            Google&apos;s partner-site privacy information
          </a>
          {" "}and manage personalized advertising through
          <a
            className="text-link"
            href="https://adssettings.google.com/"
            target="_blank"
            rel="noreferrer"
          >
            Google Ad Settings
          </a>
          .
        </p>

        <h2>Third-party services</h2>
        <p>
          DigitBox links to or may use services including GitHub, Cloudflare,
          Google AdSense, Modrinth, Planet Minecraft, YouTube, Ko-fi, Stripe,
          and Vercel infrastructure. Some legacy publishing or
          analytics features may also use separately configured services.
          Those services have their own policies and may process requests
          independently when you follow a link or use a feature.
        </p>

        <h2>Children and responsible use</h2>
        <p>
          DigitBox includes games and videos that may be interesting to young
          users. Do not use the site to collect, publish, or target
          another person&apos;s private information. Parents and guardians should
          review external services before allowing a child to create an account
          or follow third-party links.
        </p>

        <h2>Questions and changes</h2>
        <p>
          Questions or complaints about privacy or about how DigitBox uses
          YouTube can be sent by opening an issue on the{" "}
          <a className="text-link" href="https://github.com/MilkdromedaStudios/DigitBox/issues" target="_blank" rel="noreferrer">
            DigitBox GitHub repository
          </a>
          . Features and service providers can change as DigitBox develops.
          This page will be updated when a change materially affects the
          information described here.
        </p>

        <div className="gallery-actions">
          <Link href="/" className="auth-btn action-btn">Back to DigitBox</Link>
          <Link href="/terms" className="auth-btn action-btn">Terms</Link>
          <Link href="/about" className="auth-btn action-btn">About DigitBox</Link>
        </div>
      </article>
    </>
  );
}
