import Head from "next/head";
import Link from "next/link";

export default function PrivacyPage() {
  return (
    <>
      <Head>
        <title>Privacy Policy | DigitBox</title>
        <meta
          name="description"
          content="DigitBox privacy information for accounts, local saves, project browsing, and advertising."
        />
      </Head>

      <article className="section content-page">
        <p className="post-meta">DIGITBOX PRIVACY</p>
        <h1>Privacy information</h1>
        <p>
          This page explains the main data flows on DigitBox in plain language.
          It applies to digitbox.dev and its site features. It was last
          reviewed on August 24, 2026.
        </p>

        <h2>Browsing and project files</h2>
        <p>
          You can browse the public pages, posts, project listings, and many
          games without creating an account. Project and post files may be read
          from the DigitBox GitHub repository, GitHub release assets, or an
          optional content bucket used by the deployment.
        </p>

        <h2>Accounts and profile preferences</h2>
        <p>
          If account features are enabled on the current deployment, Supabase
          handles authentication and account-related storage. DigitBox may
          receive the email address needed for authentication and the profile
          preferences you choose to save, such as a display name, identity
          label, theme, accent color, or avatar. Do not upload information you
          do not want associated with your profile.
        </p>

        <h2>Local saves and notes</h2>
        <p>
          Game autosaves, gallery likes, and the gallery scratchpad are designed
          to stay in your browser or on your device. Clearing browser storage
          can remove this local data. Some optional account features may sync
          information through Supabase when you are signed in.
        </p>

        <h2>AI and AppGPT</h2>
        <p>
          DigitBox AI and AppGPT can process the prompts, code, screenshots, or
          other content that you choose to submit. Local Free AI runs in the
          browser when supported. Server-backed providers and GitHub publishing
          use the services described by their own privacy policies. Never enter
          passwords, private keys, or confidential information into a prompt.
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
          DigitBox links to or may use services including GitHub, Supabase,
          Google AdSense, GitHub Pages, Modrinth, Planet Minecraft, YouTube,
          Ko-fi, Telegram, and optional Cloudflare or Vercel infrastructure.
          Those services have their own policies and may process requests
          independently when you follow a link or use a feature.
        </p>

        <h2>Children and responsible use</h2>
        <p>
          DigitBox includes games and creative tools that may be interesting to
          young users. Do not use the site to collect, publish, or target
          another person&apos;s private information. Parents and guardians should
          review external services before allowing a child to create an account,
          publish an app, or follow third-party links.
        </p>

        <h2>Questions and changes</h2>
        <p>
          Features and service providers can change as DigitBox develops. This
          page will be updated when a change materially affects the information
          described here. Please return to this page after a major site update.
        </p>

        <div className="gallery-actions">
          <Link href="/" className="auth-btn action-btn">Back to DigitBox</Link>
          <Link href="/about" className="auth-btn action-btn">About DigitBox</Link>
        </div>
      </article>
    </>
  );
}
