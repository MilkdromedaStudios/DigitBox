package com.milkdromeda.octoloader.core;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/**
 * Orchestrates a full Octo Loader run: scan the inbox, classify every jar, resolve each
 * one to something loadable, stage the results, and write the compatibility report.
 * Pure Java — used both from inside the game and from the standalone CLI.
 */
public final class OctoCore {

    public static final String OCTO_VERSION = "1.0.0";

    public record Summary(List<Resolution> results, Path reportMd, Path reportJson, int stagedCount) {
    }

    private OctoCore() {
    }

    /**
     * @param gameDir       the Minecraft instance directory
     * @param gameVersion   the running (or targeted) Minecraft version, e.g. "26.2"
     * @param loadedModIds  mod ids already provided by the running game (empty in CLI mode)
     * @param networkOnly   true = resolve only (skip when offline), false = classify only
     * @param force         re-resolve jars even if the cached state already answered them
     */
    public static Summary run(Path gameDir, String gameVersion, OctoConfig config,
                              Set<String> loadedModIds, boolean networkOnly, boolean force,
                              Consumer<String> log) throws IOException {
        Path inbox = gameDir.resolve("octoloader");
        Path modsDir = gameDir.resolve("mods");
        Files.createDirectories(inbox);
        Files.createDirectories(modsDir);
        writeInboxReadme(inbox);

        if (gameVersion == null && config.targetGameVersion != null) {
            gameVersion = config.targetGameVersion;
        }
        if (config.targetGameVersion != null) {
            gameVersion = config.targetGameVersion;
        }
        if (gameVersion == null) {
            throw new IOException("No game version known — set targetGameVersion in config/octoloader.json");
        }

        log.accept("Octo Loader " + OCTO_VERSION + " — scanning for Minecraft " + gameVersion + " (Fabric)");

        // Foreign jars mistakenly dropped into mods/ are relocated to the inbox, where
        // they can be bridged; Fabric Loader would just ignore them in mods/.
        relocateForeignJars(modsDir, inbox, log);

        List<ModJarInfo> inboxJars = classifyDir(inbox, log);

        Set<String> presentModIds = new HashSet<>(loadedModIds);
        presentModIds.addAll(List.of("minecraft", "java", "fabricloader"));
        presentModIds.addAll(fabricModIdsIn(modsDir));

        OctoState state = OctoState.load(inbox.resolve(".octo-state.json"));
        ModrinthClient modrinth = new ModrinthClient(OCTO_VERSION);
        ResolutionEngine engine = new ResolutionEngine(modrinth, config, gameDir, gameVersion, presentModIds, log);

        List<Resolution> results = new ArrayList<>();
        for (ModJarInfo jar : inboxJars) {
            Resolution r;
            OctoState.Entry cached = force ? null : state.get(jar.sha1());
            if (cached != null && cacheStillValid(cached, gameDir)) {
                r = new Resolution(jar);
                r.set(statusFromKey(cached.statusKey()), cached.detail() + " (cached)");
                if (cached.stagedFile() != null) {
                    r.stagedFile = Path.of(cached.stagedFile());
                }
            } else {
                log.accept("• " + jar.path().getFileName() + " → " + jar.loader().label
                        + (jar.name() != null ? " (" + jar.displayName() + ")" : ""));
                r = engine.resolve(jar);
                state.put(jar.sha1(), r);
            }
            log.accept("    " + r.status.label + (r.detail.isBlank() ? "" : " — " + r.detail));
            results.add(r);
        }

        state.save();

        Path reportMd = inbox.resolve("octo-report.md");
        Path reportJson = inbox.resolve("octo-report.json");
        CompatReport.writeMarkdown(reportMd, gameVersion, OCTO_VERSION, results);
        CompatReport.writeJson(reportJson, gameVersion, OCTO_VERSION, results);

        int staged = 0;
        Map<Resolution.Status, Integer> counts = new EnumMap<>(Resolution.Status.class);
        for (Resolution r : results) {
            counts.merge(r.status, 1, Integer::sum);
            if (r.stagedFile != null) {
                staged++;
            }
            staged += r.stagedDependencies.size();
        }
        StringBuilder summary = new StringBuilder("Octo Loader finished: ");
        if (results.isEmpty()) {
            summary.append("inbox is empty");
        } else {
            boolean first = true;
            for (Map.Entry<Resolution.Status, Integer> e : counts.entrySet()) {
                if (!first) {
                    summary.append(", ");
                }
                summary.append(e.getValue()).append(" ").append(e.getKey().label.toLowerCase(java.util.Locale.ROOT));
                first = false;
            }
        }
        log.accept(summary.toString());
        if (staged > 0) {
            log.accept("Staged " + staged + " file(s) — restart to load them. Full report: " + reportMd);
        } else {
            log.accept("Report: " + reportMd);
        }
        return new Summary(results, reportMd, reportJson, staged);
    }

    // ---- helpers -----------------------------------------------------------

    private static List<ModJarInfo> classifyDir(Path dir, Consumer<String> log) throws IOException {
        List<ModJarInfo> out = new ArrayList<>();
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(dir, "*.jar")) {
            List<Path> files = new ArrayList<>();
            stream.forEach(files::add);
            files.sort(Comparator.comparing(p -> p.getFileName().toString()));
            for (Path p : files) {
                try {
                    out.add(JarClassifier.classify(p));
                } catch (IOException e) {
                    log.accept("! could not read " + p.getFileName() + ": " + e.getMessage());
                }
            }
        }
        return out;
    }

    private static void relocateForeignJars(Path modsDir, Path inbox, Consumer<String> log) throws IOException {
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(modsDir, "*.jar")) {
            for (Path p : stream) {
                LoaderType type;
                try {
                    type = quickType(p);
                } catch (IOException e) {
                    continue;
                }
                if (type == LoaderType.FORGE || type == LoaderType.NEOFORGE || type == LoaderType.PAPER_PLUGIN) {
                    Path dest = inbox.resolve(p.getFileName().toString());
                    if (!Files.exists(dest)) {
                        Files.move(p, dest, StandardCopyOption.ATOMIC_MOVE);
                        log.accept("Moved " + p.getFileName() + " from mods/ to octoloader/ ("
                                + type.label + " — Fabric cannot load it directly; Octo will bridge it).");
                    }
                }
            }
        }
    }

    /** Cheap classification that only looks at which metadata entries exist. */
    private static LoaderType quickType(Path jar) throws IOException {
        try (ZipFile zf = new ZipFile(jar.toFile())) {
            if (zf.getEntry("fabric.mod.json") != null) {
                return LoaderType.FABRIC;
            }
            if (zf.getEntry("quilt.mod.json") != null) {
                return LoaderType.QUILT;
            }
            if (zf.getEntry("META-INF/neoforge.mods.toml") != null) {
                return LoaderType.NEOFORGE;
            }
            if (zf.getEntry("META-INF/mods.toml") != null) {
                return LoaderType.FORGE;
            }
            if (zf.getEntry("paper-plugin.yml") != null || zf.getEntry("plugin.yml") != null) {
                return LoaderType.PAPER_PLUGIN;
            }
            return LoaderType.UNKNOWN;
        }
    }

    private static Set<String> fabricModIdsIn(Path modsDir) {
        Set<String> ids = new HashSet<>();
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(modsDir, "*.jar")) {
            for (Path p : stream) {
                try (ZipFile zf = new ZipFile(p.toFile())) {
                    ZipEntry entry = zf.getEntry("fabric.mod.json");
                    if (entry != null) {
                        String json = new String(zf.getInputStream(entry).readAllBytes(), StandardCharsets.UTF_8);
                        String id = Json.str(Json.parseObject(json), "id", null);
                        if (id != null) {
                            ids.add(id);
                        }
                    }
                } catch (IOException | RuntimeException ignored) {
                    // unreadable jar — Fabric Loader will complain about it, not us
                }
            }
        } catch (IOException ignored) {
            // no mods dir yet
        }
        return ids;
    }

    private static boolean cacheStillValid(OctoState.Entry cached, Path gameDir) {
        if (cached.statusKey() == null) {
            return false;
        }
        if (cached.stagedFile() != null) {
            return Files.exists(Path.of(cached.stagedFile()));
        }
        // Terminal negative outcomes stay cached until a force re-resolve.
        return cached.statusKey().equals(Resolution.Status.INCOMPATIBLE.key)
                || cached.statusKey().equals(Resolution.Status.UNKNOWN_JAR.key)
                || cached.statusKey().equals(Resolution.Status.ALREADY_PRESENT.key);
    }

    private static Resolution.Status statusFromKey(String key) {
        for (Resolution.Status s : Resolution.Status.values()) {
            if (s.key.equals(key)) {
                return s;
            }
        }
        return Resolution.Status.ERROR;
    }

    private static void writeInboxReadme(Path inbox) throws IOException {
        Path readme = inbox.resolve("README.txt");
        if (Files.exists(readme)) {
            return;
        }
        Files.writeString(readme, """
                This is the Octo Loader inbox.

                Drop ANY mod or plugin jar in here — Fabric, Quilt, Forge, NeoForge,
                Bukkit/Spigot/Paper, built for any Minecraft version — then run
                `/octo resolve` in-game (or just restart: auto-resolve is on by default).

                Octo Loader identifies each jar, fetches a build compatible with your
                game version and loader from Modrinth (including required dependencies),
                and stages it into mods/ (or plugins/). Check octo-report.md here for
                a full explanation of what happened to every file.
                """, StandardCharsets.UTF_8);
    }
}
