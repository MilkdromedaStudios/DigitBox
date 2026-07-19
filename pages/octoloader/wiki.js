import OctoLoaderNav from "../../components/OctoLoaderNav";

export default function OctoLoaderWikiPage() {
  return (
    <div className="content">
      <h1>🐙 Octo Loader — Wiki</h1>
      <OctoLoaderNav />

      <div className="section">
        <h2>How it works</h2>
        <p>
          Mods are compiled against one loader and one game version — a Forge jar contains
          no code a Fabric game can execute, and a 1.21.1 jar calls APIs that no longer
          exist in 26.2. No mod can change that. What Octo Loader does is make sure the{" "}
          <em>right build</em> gets into your game with zero effort:
        </p>
        <ol className="octo-list">
          <li>
            <strong>Scan</strong> — every jar in <code>octoloader/</code> is fingerprinted
            (SHA-1) and its embedded metadata read: <code>fabric.mod.json</code>,{" "}
            <code>quilt.mod.json</code>, <code>META-INF/mods.toml</code>,{" "}
            <code>META-INF/neoforge.mods.toml</code>, <code>plugin.yml</code>.
          </li>
          <li>
            <strong>Identify</strong> — the fingerprint is looked up on Modrinth, which
            knows which project/version the file is, no matter what it was built for. If
            the hash is unknown (CurseForge downloads, local builds) or the endpoint is
            down, Octo Loader falls back to exact matching on the jar&apos;s own mod id and
            display name.
          </li>
          <li>
            <strong>Bridge</strong> — it fetches the same project&apos;s build for{" "}
            <em>your</em> game version and loader, or a known community Fabric port, or
            stages a plugin with the Cardboard bridge.
          </li>
          <li>
            <strong>Connect</strong> — when no proper build exists, Octo Loader loads the{" "}
            <em>actual jar</em> where that&apos;s possible: Quilt-only mods get a Fabric-loadable
            jar synthesized from their own metadata, same-family Fabric jars are
            force-loaded with their version constraint relaxed, Forge/NeoForge jars are
            staged with a translation layer (Sinytra Connector) the moment one supports
            your game version, and mods with no Fabric edition at all (OptiFine) get
            their closest Fabric equivalents installed instead.
          </li>
          <li>
            <strong>Dependencies</strong> — required dependencies of everything fetched
            are resolved recursively (depth-limited, deduplicated against what you
            already have).
          </li>
          <li>
            <strong>Report</strong> — <code>octo-report.md</code> +{" "}
            <code>octo-report.json</code> explain every decision.
          </li>
        </ol>
        <p className="post-meta">
          Fabric fixes the mod set at launch (every loader does), so staged files load on
          the next restart — Octo Loader tells you when a restart is worth it.
        </p>
      </div>

      <div className="section">
        <h2>Result statuses</h2>
        <div className="octo-table-wrap">
          <table className="octo-table">
            <thead>
              <tr><th>Status</th><th>Meaning</th></tr>
            </thead>
            <tbody>
              <tr><td>✅ Loaded as-is</td><td>Fabric mod already fits your game version — staged unchanged</td></tr>
              <tr><td>✅ Version-bridged</td><td>Same project, matching build fetched for your MC version</td></tr>
              <tr><td>✅ Loader-bridged</td><td>Same project, its native Fabric build fetched</td></tr>
              <tr><td>✅ Swapped for Fabric port</td><td>Known community port fetched instead (e.g. Create → Create Fabric)</td></tr>
              <tr><td>✅ Converted</td><td>Quilt-only jar rewritten with synthesized Fabric metadata — the actual jar loads</td></tr>
              <tr><td>✅ Translation layer</td><td>Forge/NeoForge jar staged as-is with a layer that executes it on Fabric</td></tr>
              <tr><td>♻️ Replaced with equivalents</td><td>No Fabric edition exists — closest equivalents installed (OptiFine → Sodium + Iris)</td></tr>
              <tr><td>⚠️ Force-loaded</td><td>Same-family jar (26.1 on 26.2) loaded with its version constraint relaxed</td></tr>
              <tr><td>✅ Plugin staged with bridge</td><td>Plugin put in <code>plugins/</code> next to the Cardboard Bukkit-on-Fabric bridge</td></tr>
              <tr><td>☑️ Already installed</td><td>You already have this mod — nothing to do</td></tr>
              <tr><td>❌ No compatible build</td><td>Exists on no loader for your version — the report explains exactly why</td></tr>
              <tr><td>❓ Unrecognized jar</td><td>No mod/plugin metadata inside the file</td></tr>
              <tr><td>💤 Offline</td><td>Classified only (offline mode)</td></tr>
              <tr><td>⚠️ Error</td><td>Network/disk problem — retried automatically next run</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="section">
        <h2>Compatibility matrix</h2>
        <div className="octo-table-wrap">
          <table className="octo-table">
            <thead>
              <tr><th>You drop in…</th><th>What happens</th></tr>
            </thead>
            <tbody>
              <tr><td>Fabric mod for your MC version</td><td>✅ Loads as-is</td></tr>
              <tr><td>Fabric/Quilt mod for another MC version</td><td>✅ Matching build fetched — if the project ships one for your version</td></tr>
              <tr><td>Forge/NeoForge mod whose project also ships Fabric builds</td><td>✅ Fabric build fetched automatically</td></tr>
              <tr><td>Forge/NeoForge mod with a known Fabric port</td><td>✅ Port fetched — when it supports your version</td></tr>
              <tr><td>Paper plugin with Fabric builds (WorldEdit, Chunky…)</td><td>✅ Fabric build fetched automatically</td></tr>
              <tr><td>Paper plugin without a Fabric build</td><td>⚙️ Staged with the Cardboard bridge if it supports your version; otherwise reported</td></tr>
              <tr><td>Mod that exists nowhere for your version (Create on 26.2 today)</td><td>❌ Honest report with the exact reason + alternatives</td></tr>
              <tr><td>Random non-mod jar</td><td>❓ Reported as unrecognized</td></tr>
            </tbody>
          </table>
        </div>
        <p className="post-meta">
          The last two rows are physics, not laziness: Octo Loader never silently stages
          something that would crash your game.
        </p>
      </div>

      <div className="section">
        <h2>Configuration — <code>config/octoloader.json</code></h2>
        <div className="octo-table-wrap">
          <table className="octo-table">
            <thead>
              <tr><th>Key</th><th>Default</th><th>Meaning</th></tr>
            </thead>
            <tbody>
              <tr><td><code>autoResolve</code></td><td><code>true</code></td><td>Scan + bridge automatically on every game start</td></tr>
              <tr><td><code>offline</code></td><td><code>false</code></td><td>Never touch the network</td></tr>
              <tr><td><code>includeBetaBuilds</code></td><td><code>true</code></td><td>Accept alpha/beta builds when no release matches</td></tr>
              <tr><td><code>targetGameVersion</code></td><td><code>null</code></td><td>Override the detected game version</td></tr>
              <tr><td><code>maxDependencyDepth</code></td><td><code>3</code></td><td>How deep to chase required dependencies</td></tr>
              <tr><td><code>installAlternatives</code></td><td><code>true</code></td><td>Install equivalent Fabric mods when the original has no Fabric edition</td></tr>
              <tr><td><code>forceLoadSameMajor</code></td><td><code>true</code></td><td>Force-load same-family Fabric jars that Modrinth has no proper build for</td></tr>
              <tr><td><code>extraEquivalents</code></td><td><code>{"{}"}</code></td><td>Your own port mappings, e.g. <code>{"{\"some-forge-mod\": \"its-fabric-port\"}"}</code></td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="section">
        <h2>Files and folders</h2>
        <div className="octo-table-wrap">
          <table className="octo-table">
            <thead>
              <tr><th>Path</th><th>Purpose</th></tr>
            </thead>
            <tbody>
              <tr><td><code>octoloader/</code></td><td>The inbox — drop any jar here</td></tr>
              <tr><td><code>octoloader/octo-report.md</code></td><td>Human-readable result of the last run</td></tr>
              <tr><td><code>octoloader/octo-report.json</code></td><td>Machine-readable result (used by CI)</td></tr>
              <tr><td><code>octoloader/.octo-state.json</code></td><td>Resolution cache so boots stay fast (<code>/octo resolve force</code> ignores it)</td></tr>
              <tr><td><code>config/octoloader.json</code></td><td>Configuration</td></tr>
              <tr><td><code>mods/</code> · <code>plugins/</code></td><td>Where bridged mods / plugins get staged</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="section">
        <h2>FAQ</h2>
        <h3>Can it really run Forge code inside Fabric?</h3>
        <p>
          No mod can — the bytecode targets a different loader API. Octo Loader instead
          gets you the build that <em>can</em> run: the same project&apos;s Fabric edition, a
          community port, or (for plugins) a Bukkit-API bridge. When none exists, it
          says so honestly.
        </p>
        <h3>Why do I need to restart?</h3>
        <p>
          Fabric (like Forge, NeoForge, Quilt and Paper) freezes the mod set during
          startup. Nothing can hot-load a mod into a running game; Octo Loader stages
          everything so the very next start has it.
        </p>
        <h3>The report says “Modrinth API returned HTTP 5xx”.</h3>
        <p>
          Modrinth has occasional weather. Octo Loader retries with backoff and falls
          back to metadata matching; failed jars are retried automatically on the next
          run or with <code>/octo resolve force</code>.
        </p>
        <h3>Does it work with CurseForge downloads?</h3>
        <p>
          Yes — files Modrinth doesn&apos;t recognize by hash are matched by the mod id and
          name inside the jar (exact matches only, so you never get a lookalike mod).
        </p>
        <h3>Where do I get the mod itself?</h3>
        <p>
          <a href="/downloads/octo-loader.jar" download><strong>Right here — direct download</strong></a>,
          no GitHub needed. You can also grab CI builds from{" "}
          <a
            href="https://github.com/MilkdromedaStudios/DigitBox/actions/workflows/octo-loader.yml"
            target="_blank"
            rel="noreferrer"
          >
            GitHub Actions
          </a>{" "}
          or build from{" "}
          <a
            href="https://github.com/MilkdromedaStudios/DigitBox/tree/main/octo-loader"
            target="_blank"
            rel="noreferrer"
          >
            source
          </a>{" "}
          with <code>./gradlew build</code> (the finished jar lands in <code>octo-loader/mods/</code>).
        </p>
        <h3>Can it run Forge mods directly?</h3>
        <p>
          The moment a translation layer (Sinytra Connector) publishes a build for your
          game version, yes — Octo Loader detects it automatically and stages your actual
          Forge/NeoForge jars alongside it. Until then it uses the project&apos;s own Fabric
          build, a known port, or equivalents — whichever exists.
        </p>
      </div>
    </div>
  );
}
