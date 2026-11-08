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
  {
    number: "03",
    category: "MINECRAFT · MOD LOADER",
    title: "Octo Loader",
    description: "A Minecraft mod loader and launcher designed to bring Fabric, Quilt, Forge, and NeoForge mods together.",
    href: "https://github.com/MilkdromedaStudios/Octo-Loader",
    action: "Explore Octo Loader",
    icon: "download",
    accent: "cyan",
  },
  {
    number: "04",
    category: "WINDOWS · AI ASSISTANT",
    title: "NebulaDesk",
    description: "A lightweight Windows desktop AI assistant with a global hotkey and local Ollama model integration.",
    href: "https://github.com/MilkdromedaStudios/Nebula-Desk",
    action: "Explore on GitHub",
    icon: "ai",
    accent: "violet",
  },
  {
    number: "05",
    category: "MINECRAFT · AI COMPANION",
    title: "Blockpal AI",
    description: "An AI companion for Minecraft that can build, gather, explore, and interact with the world.",
    href: "https://github.com/MilkdromedaStudios/Blockpal-AI",
    action: "Explore on GitHub",
    icon: "ai",
    accent: "green",
  },
  {
    number: "06",
    category: "MINECRAFT · LAUNCHER",
    title: "Dwine Launcher",
    description: "A Windows companion launcher paired with a native Fabric client mod for Minecraft.",
    href: "https://github.com/MilkdromedaStudios/Dwine-Minecraft-Launcher",
    action: "Explore on GitHub",
    icon: "download",
    accent: "blue",
  },
  {
    number: "07",
    category: "MINECRAFT · SERVER PLUGIN",
    title: "PlayerGen",
    description: "A Purpur plugin that creates configurable idle players for the server player list.",
    href: "https://github.com/MilkdromedaStudios/Playergen",
    action: "Explore on GitHub",
    icon: "user",
    accent: "orange",
  },
  {
    number: "08",
    category: "BROWSER EXTENSION",
    title: "Magnitude",
    description: "A sidebar extension project for Opera GX.",
    href: "https://github.com/MilkdromedaStudios/Magnitude",
    action: "Explore on GitHub",
    icon: "grid",
    accent: "violet",
  },
  {
    number: "09",
    category: "MINECRAFT · AI TOOL",
    title: "BlockSmith",
    description: "An AI-powered generator for Minecraft mods, plugins, resource packs, and shader packs.",
    href: "https://github.com/MilkdromedaStudios/AI-Minecarft",
    action: "Explore on GitHub",
    icon: "ai",
    accent: "cyan",
  },
  {
    number: "10",
    category: "MINECRAFT · BEDROCK ADDON",
    title: "Elderfall",
    description: "A story-driven Bedrock addon featuring a growing village, characters, quests, gear, spells, and raids.",
    href: "https://github.com/MilkdromedaStudios/lore-mod",
    action: "Explore on GitHub",
    icon: "games",
    accent: "orange",
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
            <span className="misc-count">{String(PROJECTS.length).padStart(2, "0")} PROJECTS</span>
          </div>

          <div className="misc-grid">
            {PROJECTS.map((project) => (
              <article className={"misc-card misc-card-" + project.accent} key={project.number}>
                <div className="misc-card-top">
                  <span className="misc-card-icon"><Icon name={project.icon} size={25} /></span>
                  <span className="misc-card-number">{project.number} / {String(PROJECTS.length).padStart(2, "0")}</span>
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
                {project.href ? (
                  <a className="misc-card-link" href={project.href} target="_blank" rel="noopener noreferrer">
                    {project.action}<Icon name="external" size={17} />
                  </a>
                ) : null}
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
