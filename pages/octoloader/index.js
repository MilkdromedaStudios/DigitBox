import Link from "next/link";
import OctoLoaderNav from "../../components/OctoLoaderNav";

const FEATURES = [
  {
    icon: "🐙",
    title: "One inbox for every ecosystem",
    text: "Drop Fabric, Quilt, Forge, NeoForge mods or Bukkit/Spigot/Paper plugins — from any Minecraft version — into the octoloader/ folder. Octo Loader figures out what each jar is.",
  },
  {
    icon: "🔁",
    title: "Version bridging",
    text: "A mod built for another Minecraft version is identified on Modrinth by its file fingerprint, and the build matching YOUR game version is fetched automatically.",
  },
  {
    icon: "🌉",
    title: "Loader bridging",
    text: "Forge/NeoForge mods and Paper plugins whose projects ship native Fabric builds (Sodium, Lithium, WorldEdit, Chunky…) get the Fabric edition fetched for you — plus known community ports like Create → Create Fabric.",
  },
  {
    icon: "🔌",
    title: "Paper plugin support",
    text: "Plugins prefer their project's native Fabric build; otherwise they're staged into plugins/ together with the Cardboard Bukkit-on-Fabric bridge when it supports your version.",
  },
  {
    icon: "🧬",
    title: "Actually loads foreign jars",
    text: "Quilt-only mods get a Fabric-loadable jar synthesized from their own metadata; same-family Fabric jars (a 26.1 build on 26.2) are force-loaded with their constraint relaxed; and Forge/NeoForge jars run through a translation layer the moment one supports your version — the real jar, in your game.",
  },
  {
    icon: "⬆️",
    title: "Built-in mod updater",
    text: "/octo update checks every mod in mods/ against Modrinth and swaps in the newest build for your game version — with the old jar backed up so it's always reversible.",
  },
  {
    icon: "🧩",
    title: "Automatic dependencies",
    text: "Everything fetched gets its required dependencies resolved recursively and staged too. No more 'missing dependency' boot screens.",
  },
  {
    icon: "📋",
    title: "Honest reports",
    text: "octo-report.md explains what happened to every single jar — and when something exists on no loader for your version, it says exactly why and suggests alternatives instead of crashing your game.",
  },
  {
    icon: "⌨️",
    title: "In-game commands + CLI",
    text: "/octo resolve, /octo fetch <slug>, /octo scan, /octo status in-game — or run the very same engine from a terminal against any server folder, no game required.",
  },
  {
    icon: "✅",
    title: "Proven by CI",
    text: "Every build runs an end-to-end test: real mods from Modrinth are bridged for MC 26.2 and a real Fabric dedicated server boots with them loaded.",
  },
];

export default function OctoLoaderPage() {
  return (
    <div className="content">
      <div className="hero">
        <h1>🐙 Octo Loader</h1>
        <p>
          The eight-armed mod connector for Fabric on Minecraft 26.2. Feed it any mod or
          plugin jar — it identifies it, fetches the build that actually runs on your
          game from Modrinth, wires up the dependencies, and tells you the truth about
          the rest.
        </p>
        <p style={{ marginTop: "1rem" }}>
          <Link href="/octoloader/guide" className="auth-btn action-btn">Get started</Link>
          <a
            className="auth-btn action-btn"
            style={{ marginLeft: "10px" }}
            href="/downloads/octo-loader.jar"
            download
          >
            ⬇ Download the mod
          </a>
        </p>
      </div>

      <OctoLoaderNav />

      <h2 style={{ marginTop: "1.5rem" }}>Features</h2>
      <div className="content-list">
        {FEATURES.map((f) => (
          <article key={f.title} className="post-card">
            <h2>{f.icon} {f.title}</h2>
            <p className="post-excerpt">{f.text}</p>
          </article>
        ))}
      </div>

      <div className="section" style={{ marginTop: "1.5rem" }}>
        <h2>Tested with real mods</h2>
        <p className="post-meta">Straight from the automated smoke test on Minecraft 26.2:</p>
        <ul className="octo-list">
          <li>
            <strong>Lithium</strong> (Fabric jar built for 1.21.1) → bridged to Lithium
            0.25.2 for 26.2 and loaded on a real dedicated server. ✅
          </li>
          <li>
            <strong>WorldEdit</strong> (Bukkit/Paper plugin jar) → bridged to WorldEdit
            <em> for Fabric</em> 7.4.4 and loaded in-game. ✅
          </li>
          <li>
            <strong>Create</strong> (NeoForge jar) → correctly identified; reported
            honestly that no 26.2 build exists on any loader yet (its Fabric port stops
            at 1.20.1) — with alternatives suggested instead of a crash. ❌→📋
          </li>
        </ul>
        <p>
          <Link href="/octoloader/wiki" className="auth-btn action-btn">Read the wiki</Link>
        </p>
      </div>
    </div>
  );
}
