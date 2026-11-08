import Head from "next/head";
import { useState } from "react";
import Icon from "../components/Icon";

const PROJECTS = [
  {
    number: "01",
    category: "BROWSER CUSTOMIZATION",
    title: "Nexus Sidebar",
    description: "A customizable browser sidebar built to bring your favorite tools, websites, and shortcuts into one focused workspace.",
    href: "https://github.com/MilkdromedaStudios/Nexus-Sidebar",
    action: "Explore on GitHub",
    icon: "grid",
    accent: "violet",
    external: true,
  },
  {
    number: "02",
    category: "MINECRAFT SERVER",
    title: "Minecraft Server",
    description: "A community Minecraft server. Add the server address to your multiplayer list and come explore.",
    address: "mc.digitbox.dev",
    icon: "games",
    accent: "green",
  },
];

export default function MiscPage() {
  const [copied, setCopied] = useState(false);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText("mc.digitbox.dev");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copy the Minecraft server address:", "mc.digitbox.dev");
    }
  }

  return (
    <>
      <Head>
        <title>Misc — DigitBox</title>
        <meta name="description" content="Side projects, experiments, and other things from DigitBox." />
      </Head>
      <div className="hub-page misc-page">
        <header className="misc-hero">
          <span className="hub-kicker">OUTSIDE THE HUB</span>
          <h1>Miscellaneous</h1>
          <p>Side projects, experiments, and other things I'm building or running. A little bit of everything, all in one place.</p>
          <div className="misc-hero-meta"><span><i /> PROJECTS &amp; EXPERIMENTS</span><span>UPDATED AS THINGS GROW</span></div>
        </header>

        <section className="misc-section" aria-labelledby="misc-featured-title">
          <div className="misc-section-head">
            <div>
              <span className="hub-kicker">THE COLLECTION</span>
              <h2 id="misc-featured-title">Featured</h2>
            </div>
            <span className="misc-count">0{PROJECTS.length} PROJECTS</span>
          </div>

          <div className="misc-grid">
            {PROJECTS.map((project) => (
              <article className={"misc-card misc-card-" + project.accent} key={project.number}>
                <div className="misc-card-top">
                  <span className="misc-card-icon"><Icon name={project.icon} size={25} /></span>
                  <span className="misc-card-number">{project.number} / 0{PROJECTS.length}</span>
                </div>
                <span className="misc-card-category">{project.category}</span>
                <h3>{project.title}</h3>
                <p>{project.description}</p>
                {project.address ? (
                  <div className="misc-server-address">
                    <span><i /> SERVER ADDRESS</span>
                    <code>{project.address}</code>
                    <button type="button" onClick={copyAddress} aria-label="Copy Minecraft server address"><Icon name={copied ? "check" : "copy"} size={17} /> {copied ? "Copied" : "Copy"}</button>
                  </div>
                ) : null}
                <a className="misc-card-link" href={project.href} target="_blank" rel="noopener noreferrer">
                  {project.action}<Icon name="external" size={17} />
                </a>
              </article>
            ))}
          </div>
        </section>

        <section className="misc-note">
          <span className="misc-note-mark"><Icon name="plus" size={20} /></span>
          <div><h2>More coming soon</h2><p>This is where smaller projects, experiments, and things that don't fit elsewhere will show up.</p></div>
        </section>
      </div>
    </>
  );
}
