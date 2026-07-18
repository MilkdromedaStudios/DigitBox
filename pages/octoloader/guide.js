import OctoLoaderNav from "../../components/OctoLoaderNav";

export default function OctoLoaderGuidePage() {
  return (
    <div className="content">
      <h1>🐙 Octo Loader — How to Use</h1>
      <OctoLoaderNav />

      <div className="section">
        <h2>1. Requirements</h2>
        <ul className="octo-list">
          <li><strong>Minecraft 26.2</strong> (Java Edition, the current release)</li>
          <li><strong>Java 25</strong> (required by Minecraft 26.x itself)</li>
          <li><a href="https://fabricmc.net/use/" target="_blank" rel="noreferrer">Fabric Loader</a> 0.19.3 or newer</li>
          <li><a href="https://modrinth.com/mod/fabric-api" target="_blank" rel="noreferrer">Fabric API</a> for 26.2</li>
        </ul>
        <p className="post-meta">Works on clients and dedicated servers.</p>
      </div>

      <div className="section">
        <h2>2. Install</h2>
        <ol className="octo-list">
          <li>
            Grab <code>octo-loader-&lt;version&gt;.jar</code> from the{" "}
            <a
              href="https://github.com/MilkdromedaStudios/DigitBox/actions/workflows/octo-loader.yml"
              target="_blank"
              rel="noreferrer"
            >
              GitHub Actions build artifacts
            </a>{" "}
            (open the latest green run → “Artifacts” → <code>octo-loader</code>), or build it
            yourself with <code>./gradlew build</code> in <code>octo-loader/</code>.
          </li>
          <li>Put it in your <code>mods/</code> folder next to Fabric API.</li>
          <li>
            Start the game once — Octo Loader creates the <code>octoloader/</code> inbox
            folder and a config at <code>config/octoloader.json</code>.
          </li>
        </ol>
      </div>

      <div className="section">
        <h2>3. Everyday use</h2>
        <ol className="octo-list">
          <li>
            Download any mod or plugin from anywhere — Modrinth, CurseForge, a friend&apos;s
            Discord. Wrong loader? Wrong version? A Paper plugin? Doesn&apos;t matter.
          </li>
          <li>
            Drop the jar(s) into the <code>octoloader/</code> folder. (Jars dropped into{" "}
            <code>mods/</code> by mistake are picked up and relocated automatically.)
          </li>
          <li>
            Restart the game <em>or</em> run <code>/octo resolve</code>. Octo Loader
            identifies everything, fetches compatible builds and dependencies, and writes{" "}
            <code>octoloader/octo-report.md</code>.
          </li>
          <li>Restart once more so Fabric picks up the staged mods. Done.</li>
        </ol>
      </div>

      <div className="section">
        <h2>4. Commands (need op / permission level 2)</h2>
        <div className="octo-table-wrap">
          <table className="octo-table">
            <thead>
              <tr><th>Command</th><th>What it does</th></tr>
            </thead>
            <tbody>
              <tr><td><code>/octo resolve</code></td><td>Scan the inbox and bridge everything via Modrinth</td></tr>
              <tr><td><code>/octo resolve force</code></td><td>Same, but ignore the resolution cache</td></tr>
              <tr><td><code>/octo scan</code></td><td>Classify the inbox without touching the network</td></tr>
              <tr><td><code>/octo fetch &lt;slug&gt;</code></td><td>Fetch any Modrinth project for your MC version, e.g. <code>/octo fetch sodium</code></td></tr>
              <tr><td><code>/octo status</code></td><td>Show version and where the latest report is</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="section">
        <h2>5. Servers &amp; the CLI</h2>
        <p>
          The exact same engine runs from a terminal — perfect for provisioning a server
          without ever launching the game:
        </p>
        <pre className="octo-code">java -jar octo-loader-1.0.0.jar --dir /path/to/instance --game-version 26.2</pre>
        <p className="post-meta">
          Options: <code>--offline</code> (classify only), <code>--force</code> (ignore the cache).
        </p>
      </div>

      <div className="section">
        <h2>6. Reading the report</h2>
        <p>
          After every run, <code>octoloader/octo-report.md</code> lists each jar, what it
          was detected as, what Octo Loader did, and why. Green rows are staged and load
          after a restart; red rows explain exactly what&apos;s missing (for example, a mod
          that has no build for 26.2 on any loader yet) and suggest alternatives you can
          grab with <code>/octo fetch</code>.
        </p>
      </div>
    </div>
  );
}
