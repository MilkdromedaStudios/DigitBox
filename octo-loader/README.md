# 🐙 Octo Loader

**The eight-armed mod connector for Fabric.** Drop *any* mod or plugin jar — Fabric, Quilt,
Forge, NeoForge, or Bukkit/Spigot/Paper, built for *any* Minecraft version — into one
folder, and Octo Loader identifies it, fetches a build that actually runs on **your**
Minecraft + Fabric setup (APIs from other versions included, straight from Modrinth),
resolves required dependencies, and stages everything for the next launch.

Built and tested against **Minecraft 26.2** (the latest release) with Fabric Loader
0.19.3 and Fabric API 0.155.2+26.2, on Java 25.

---

## How it works

Minecraft mods are compiled against one loader and one game version. A Forge jar does not
contain code a Fabric game can execute, and a 1.21.1 jar calls APIs that no longer exist
in 26.2. No mod can change that — anyone claiming otherwise is bluffing. What a *connector*
can do is make sure the right build gets into your game with zero effort:

1. **Scan** – every jar in the `octoloader/` inbox is fingerprinted (SHA-1) and its
   embedded metadata read (`fabric.mod.json`, `quilt.mod.json`, `mods.toml`,
   `neoforge.mods.toml`, `plugin.yml`).
2. **Identify** – the fingerprint is looked up on Modrinth, which knows which project and
   version the file belongs to, no matter which loader or MC version it was built for.
   Files Modrinth doesn't know (e.g. CurseForge downloads) are matched by mod id/name.
3. **Bridge** – Octo Loader fetches the same project's build for *your* game version and
   loader:
   - Fabric mod, right version → staged as-is.
   - Fabric/Quilt mod, wrong version → the matching build for your version is fetched
     (**version bridge** — this is the "fetch APIs from other versions" part).
   - Forge/NeoForge mod → the project's native Fabric build is fetched, or a known
     community Fabric port (e.g. `create` → `create-fabric`) (**loader bridge**).
   - Paper plugin → the project's native Fabric build if it has one (WorldEdit, Chunky…);
     otherwise the plugin is staged into `plugins/` together with the Cardboard
     Bukkit-on-Fabric bridge when it supports your game version.
4. **Dependencies** – required dependencies of everything fetched are resolved
   recursively and staged too.
5. **Report** – `octoloader/octo-report.md` explains what happened to every single file,
   including *why* something can't run and what the closest alternatives are.

Like every loader, Fabric fixes the mod set at launch, so staged files load on the next
restart — Octo Loader tells you when a restart is worth it.

## Installation

1. Install the [Fabric Loader](https://fabricmc.net/use/) for Minecraft 26.2 (or use any
   Fabric-ready launcher profile).
2. Put these two jars into your `mods/` folder:
   - [Fabric API](https://modrinth.com/mod/fabric-api) for 26.2
   - `octo-loader-<version>.jar` (grab it from the GitHub Actions build artifacts, or
     build it yourself — see below)
3. Start the game once. Octo Loader creates the `octoloader/` inbox folder next to
   `mods/` and a default config at `config/octoloader.json`.

Works on clients and dedicated servers.

## Using it

1. Download any mod or plugin from anywhere — Modrinth, CurseForge, a friend's Discord.
   Wrong loader? Wrong Minecraft version? A Paper plugin? Doesn't matter.
2. Drop the jar(s) into the `octoloader/` folder (jars mistakenly dropped into `mods/`
   are picked up and relocated automatically).
3. Restart the game **or** run `/octo resolve`. Octo Loader does the rest in the
   background and writes the report.
4. Restart once more to play with the staged mods.

### Commands (require op / permission level 2)

| Command | What it does |
|---------|--------------|
| `/octo resolve` | Scan the inbox and bridge everything via Modrinth |
| `/octo resolve force` | Same, ignoring the resolution cache |
| `/octo scan` | Classify the inbox without touching the network |
| `/octo fetch <slug>` | Fetch any Modrinth project by slug for your MC version (e.g. `/octo fetch sodium`) |
| `/octo status` | Show version + where the latest report is |

### CLI mode (no game needed)

The same engine runs from a shell — handy for provisioning servers:

```bash
java -jar octo-loader-1.0.0.jar --dir /path/to/instance --game-version 26.2
```

Options: `--offline` (classify only), `--force` (ignore cache).

### Config (`config/octoloader.json`)

| Key | Default | Meaning |
|-----|---------|---------|
| `autoResolve` | `true` | Scan + bridge automatically on every game start |
| `offline` | `false` | Never touch the network |
| `includeBetaBuilds` | `true` | Accept alpha/beta builds when no release matches |
| `targetGameVersion` | `null` | Override the detected game version |
| `maxDependencyDepth` | `3` | How deep to chase required dependencies |
| `extraEquivalents` | `{}` | Your own cross-loader port mappings, e.g. `{"some-forge-mod": "its-fabric-port"}` |

## What can and cannot load — honest compatibility matrix

| You drop in… | What happens |
|--------------|--------------|
| Fabric mod for your MC version | ✅ Loads as-is |
| Fabric/Quilt mod for another MC version | ✅ Matching build fetched from Modrinth — if the project ships one for your version |
| Forge/NeoForge mod whose project also ships Fabric builds (Sodium, Lithium, JEI…) | ✅ Fabric build fetched automatically |
| Forge/NeoForge mod with a known community Fabric port (Create → Create Fabric…) | ✅ Port fetched automatically — when the port supports your version |
| Paper plugin whose project ships Fabric builds (WorldEdit, Chunky…) | ✅ Fabric build fetched automatically |
| Paper plugin without a Fabric build | ⚙️ Staged with the Cardboard Bukkit-bridge **if** Cardboard supports your MC version; otherwise reported |
| Mod that exists on no loader for your MC version (e.g. Create on 26.2 today) | ❌ Reported honestly, with the exact reason and the closest alternatives |
| Random non-mod jar | ❓ Reported as unrecognized |

The last two rows are physics, not laziness: a jar compiled against another loader's or
version's APIs cannot execute unmodified, so Octo Loader gets you the build that *can* —
and never silently stages something that would crash your game.

## Building from source

Requires Java 25 (Minecraft 26.x requirement).

```bash
cd octo-loader
./gradlew build
# → build/libs/octo-loader-<version>.jar
```

CI builds every push via GitHub Actions (`.github/workflows/octo-loader.yml`) and runs an
end-to-end smoke test that downloads **real** mods from Modrinth — Create (NeoForge),
Lithium built for 1.21.1 (Fabric), and WorldEdit's Bukkit plugin — resolves them for MC
26.2, boots a real Fabric dedicated server, and asserts the bridged builds actually load
in-game. That test is the proof that the whole pipeline works; run it locally with:

```bash
bash scripts/ci-smoke-test.sh build/libs/octo-loader-1.0.0.jar 26.2
```

## Project layout

```
octo-loader/
├── src/main/java/com/milkdromeda/octoloader/
│   ├── OctoLoaderMod.java        # Fabric entrypoint (auto-resolve on boot)
│   ├── OctoCommands.java         # /octo … commands (the only MC-API-facing class)
│   ├── cli/OctoCli.java          # standalone CLI entrypoint
│   └── core/                     # pure-Java engine: scanner, classifier,
│                                 # Modrinth client, resolution engine, reports
├── scripts/ci-smoke-test.sh      # end-to-end proof with real mods
└── build.gradle                  # Fabric Loom 1.17, MC 26.2, Java 25
```

The core is dependency-free on purpose (own JSON parser included) so the exact same jar
runs inside the game *and* as a plain `java -jar` tool.

## License

MIT — same as the repository.
