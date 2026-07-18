package com.milkdromeda.octoloader.core;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.function.Consumer;

/**
 * Decides, for every jar in the inbox, how to get an equivalent running on
 * <em>this</em> loader (Fabric) and <em>this</em> game version:
 *
 * <ol>
 *   <li>Fabric mod that already fits — staged into {@code mods/} as-is.</li>
 *   <li>Anything Modrinth recognizes by file hash — fetch the same project's build for
 *       the current game version + Fabric (cross-version and cross-loader bridging).</li>
 *   <li>Forge/NeoForge projects with a separately-published Fabric port — fetch the port
 *       (curated + user-extendable equivalence map).</li>
 *   <li>Paper plugins — prefer the same project's native Fabric build; otherwise stage the
 *       plugin into {@code plugins/} alongside a Bukkit-on-Fabric bridge mod (Cardboard)
 *       when one exists for this game version.</li>
 *   <li>Required dependencies of everything fetched are resolved recursively.</li>
 * </ol>
 */
public final class ResolutionEngine {

    /** Modrinth slug of the Bukkit-API-on-Fabric bridge used for Paper plugins. */
    private static final String BUKKIT_BRIDGE_SLUG = "cardboard";

    private final ModrinthClient modrinth;
    private final OctoConfig config;
    private final Equivalents equivalents;
    private final Path modsDir;
    private final Path pluginsDir;
    private final String gameVersion;
    private final Consumer<String> log;
    private final Set<String> presentModIds;
    private final Set<String> stagedProjectIds = new HashSet<>();
    private Optional<ModrinthClient.Version> bukkitBridge;

    public ResolutionEngine(ModrinthClient modrinth, OctoConfig config, Path gameDir,
                            String gameVersion, Set<String> presentModIds, Consumer<String> log) {
        this.modrinth = modrinth;
        this.config = config;
        this.equivalents = new Equivalents(config.extraEquivalents);
        this.modsDir = gameDir.resolve("mods");
        this.pluginsDir = gameDir.resolve("plugins");
        this.gameVersion = gameVersion;
        this.presentModIds = presentModIds;
        this.log = log;
    }

    public Resolution resolve(ModJarInfo jar) {
        Resolution r = new Resolution(jar);
        try {
            switch (jar.loader()) {
                case UNKNOWN -> r.set(Resolution.Status.UNKNOWN_JAR,
                        "No Fabric/Quilt/Forge/NeoForge/plugin metadata found inside the jar.");
                case FABRIC -> resolveFabric(r);
                case QUILT, FORGE, NEOFORGE -> bridgeViaModrinth(r);
                case PAPER_PLUGIN -> resolvePlugin(r);
            }
        } catch (IOException e) {
            r.set(Resolution.Status.ERROR, "Network/disk error: " + e.getMessage());
        }
        return r;
    }

    // ---- per-kind flows ----------------------------------------------------

    private void resolveFabric(Resolution r) throws IOException {
        ModJarInfo jar = r.jar;
        if (jar.modId() != null && presentModIds.contains(jar.modId())) {
            r.set(Resolution.Status.ALREADY_PRESENT, "Mod '" + jar.modId() + "' is already installed.");
            return;
        }
        if (SimpleVersions.matches(jar.declaredMcVersion(), gameVersion)) {
            Path staged = stageCopy(jar.path(), modsDir);
            r.stagedFile = staged;
            r.set(Resolution.Status.NATIVE_OK,
                    "Fabric mod compatible with " + gameVersion + " (declares '"
                            + orAny(jar.declaredMcVersion()) + "') — staged into mods/.");
            if (jar.modId() != null) {
                presentModIds.add(jar.modId());
            }
            return;
        }
        // Built for another Minecraft version: fetch the matching build.
        bridgeViaModrinth(r);
    }

    /** Identity of a local file on Modrinth, found via its hash. */
    private record Identity(ModrinthClient.Version version, String slug, String title) {
    }

    /**
     * Never throws: when the hash-lookup endpoint is down (it fails independently of
     * the rest of the Modrinth API), resolution falls back to metadata matching
     * instead of giving up on the jar. OCTO_DISABLE_HASH_LOOKUP=1 forces the
     * fallback path, which is how the smoke test exercises it deterministically.
     */
    private Optional<Identity> identify(String sha1) {
        if ("1".equals(System.getenv("OCTO_DISABLE_HASH_LOOKUP"))) {
            return Optional.empty();
        }
        try {
            Optional<ModrinthClient.Version> v = modrinth.versionByHash(sha1);
            if (v.isEmpty()) {
                return Optional.empty();
            }
            Optional<ModrinthClient.Project> p = modrinth.project(v.get().projectId());
            String slug = p.map(ModrinthClient.Project::slug).orElse(v.get().projectId());
            String title = p.map(ModrinthClient.Project::title).orElse(slug);
            return Optional.of(new Identity(v.get(), slug, title));
        } catch (IOException e) {
            log.accept("  ! hash lookup unavailable (" + e.getMessage()
                    + ") — falling back to metadata matching.");
            return Optional.empty();
        }
    }

    private static String describe(Identity id) {
        return "Identified as '" + id.title() + "' (" + id.slug() + ") " + id.version().versionNumber()
                + " for MC " + String.join("/", id.version().gameVersions()) + ". ";
    }

    /**
     * Fallback identification for jars whose exact file Modrinth doesn't know
     * (e.g. downloaded from CurseForge or built locally): search by the mod id and
     * display name from the jar's own metadata, accepting only exact matches.
     */
    private Optional<String> slugByMetadata(ModJarInfo jar) {
        for (String query : new String[]{jar.modId(), jar.name()}) {
            if (query == null || query.isBlank()) {
                continue;
            }
            try {
                for (ModrinthClient.SearchHit hit : modrinth.search(query, null, null, 8)) {
                    boolean slugMatch = jar.modId() != null && jar.modId().equalsIgnoreCase(hit.slug());
                    boolean titleMatch = jar.name() != null && jar.name().equalsIgnoreCase(hit.title());
                    if (slugMatch || titleMatch) {
                        return Optional.ofNullable(hit.slug());
                    }
                }
            } catch (IOException e) {
                log.accept("  ! metadata search unavailable (" + e.getMessage() + ")");
            }
        }
        return Optional.empty();
    }

    /** Cross-version and cross-loader bridging: hash (or metadata) → project → right build. */
    private void bridgeViaModrinth(Resolution r) throws IOException {
        if (config.offline) {
            r.set(Resolution.Status.SKIPPED_OFFLINE, "Offline mode: classified but not bridged.");
            return;
        }
        ModJarInfo jar = r.jar;
        Optional<Identity> idOpt = identify(jar.sha1());
        String slug;
        String title;
        String base;
        if (idOpt.isPresent()) {
            slug = idOpt.get().slug();
            title = idOpt.get().title();
            base = describe(idOpt.get());
        } else {
            Optional<String> metaSlug = slugByMetadata(jar);
            if (metaSlug.isEmpty()) {
                StringBuilder detail = new StringBuilder(
                        "File is not known to Modrinth and no exact metadata match was found "
                                + "(private/local build?). ");
                appendSuggestions(detail, jar.displayName());
                r.set(Resolution.Status.INCOMPATIBLE, detail.toString().strip());
                return;
            }
            slug = metaSlug.get();
            title = slug;
            base = "Matched by jar metadata to '" + slug + "' on Modrinth. ";
        }
        r.resolvedProject = slug;

        Optional<ModrinthClient.Version> best = pickBest(modrinth.projectVersions(slug, "fabric", gameVersion));
        if (best.isPresent()) {
            boolean sameEcosystem = jar.loader() == LoaderType.FABRIC || jar.loader() == LoaderType.QUILT;
            stageVersion(r, best.get(),
                    sameEcosystem ? Resolution.Status.BRIDGED_VERSION : Resolution.Status.BRIDGED_LOADER,
                    base + "Fetched the project's Fabric build " + best.get().versionNumber()
                            + " for " + gameVersion + " from Modrinth.");
            return;
        }

        // No Fabric build of this project for our game version — check for a known port.
        StringBuilder detail = new StringBuilder(base);
        String portSlug = equivalents.fabricPortOf(slug);
        if (portSlug != null) {
            Optional<ModrinthClient.Version> portBest =
                    pickBest(modrinth.projectVersions(portSlug, "fabric", gameVersion));
            if (portBest.isPresent()) {
                stageVersion(r, portBest.get(), Resolution.Status.BRIDGED_EQUIVALENT,
                        base + "Fetched its Fabric port '" + portSlug + "' ("
                                + portBest.get().versionNumber() + ") for " + gameVersion + " instead.");
                return;
            }
            String portLatest = latestGameVersionOf(portSlug);
            detail.append("Its Fabric port '").append(portSlug).append("' exists but currently only supports MC ")
                    .append(portLatest == null ? "older versions" : "up to " + portLatest).append(". ");
        } else {
            String fabricLatest = latestGameVersionOf(slug);
            if (fabricLatest != null) {
                detail.append("The project has Fabric builds, but only up to MC ").append(fabricLatest).append(". ");
            } else {
                detail.append("The project publishes no Fabric builds at all. ");
            }
        }
        appendSuggestions(detail, title);
        r.set(Resolution.Status.INCOMPATIBLE, detail.toString().strip());
    }

    private void resolvePlugin(Resolution r) throws IOException {
        if (config.offline) {
            r.set(Resolution.Status.SKIPPED_OFFLINE, "Offline mode: plugin classified but not bridged.");
            return;
        }
        ModJarInfo jar = r.jar;
        Optional<Identity> idOpt = identify(jar.sha1());
        String slug = idOpt.map(Identity::slug).orElse(null);
        String base = idOpt.map(ResolutionEngine::describe).orElse("");
        if (slug == null) {
            Optional<String> metaSlug = slugByMetadata(jar);
            if (metaSlug.isPresent()) {
                slug = metaSlug.get();
                base = "Matched by jar metadata to '" + slug + "' on Modrinth. ";
            }
        }

        // Best case: the same project ships a native Fabric build (WorldEdit, Chunky, ...).
        if (slug != null) {
            r.resolvedProject = slug;
            Optional<ModrinthClient.Version> best =
                    pickBest(modrinth.projectVersions(slug, "fabric", gameVersion));
            if (best.isPresent()) {
                stageVersion(r, best.get(), Resolution.Status.BRIDGED_LOADER,
                        base + "The project publishes a native Fabric build — fetched "
                                + best.get().versionNumber() + " for " + gameVersion
                                + " instead of running the plugin through a bridge.");
                return;
            }
        }

        // Otherwise: run the plugin as-is through a Bukkit-API-on-Fabric bridge, if one
        // exists for this game version.
        Optional<ModrinthClient.Version> bridge = bukkitBridge();
        if (bridge.isPresent()) {
            Path stagedPlugin = stageCopy(jar.path(), pluginsDir);
            r.stagedFile = stagedPlugin;
            if (!presentModIds.contains(BUKKIT_BRIDGE_SLUG) && !stagedProjectIds.contains(BUKKIT_BRIDGE_SLUG)) {
                Path bridgeJar = modrinth.download(bridge.get(), modsDir);
                r.stagedDependencies.add(bridgeJar);
                stagedProjectIds.add(BUKKIT_BRIDGE_SLUG);
                resolveDependencies(bridge.get(), r, 1);
            }
            r.set(Resolution.Status.PLUGIN_BRIDGED,
                    base + "Staged into plugins/ with the '" + BUKKIT_BRIDGE_SLUG
                            + "' Bukkit-on-Fabric bridge (" + bridge.get().versionNumber() + ").");
            return;
        }

        StringBuilder detail = new StringBuilder(!base.isEmpty() ? base
                : "Plugin is not known to Modrinth. ");
        detail.append("No native Fabric build of this project for ").append(gameVersion)
                .append(", and the Bukkit bridge mod ('").append(BUKKIT_BRIDGE_SLUG)
                .append("') has no ").append(gameVersion).append(" build yet. ");
        appendSuggestions(detail, jar.displayName());
        r.set(Resolution.Status.INCOMPATIBLE, detail.toString().strip());
    }

    // ---- helpers -----------------------------------------------------------

    private void stageVersion(Resolution r, ModrinthClient.Version version,
                              Resolution.Status status, String detail) throws IOException {
        if (stagedProjectIds.contains(version.projectId())) {
            r.set(Resolution.Status.ALREADY_PRESENT, "Already staged earlier in this run.");
            return;
        }
        Path staged = modrinth.download(version, modsDir);
        r.stagedFile = staged;
        r.resolvedProject = version.projectId();
        r.resolvedVersion = version.versionNumber();
        stagedProjectIds.add(version.projectId());
        r.set(status, detail);
        resolveDependencies(version, r, 1);
    }

    private void resolveDependencies(ModrinthClient.Version version, Resolution r, int depth) {
        if (depth > config.maxDependencyDepth) {
            return;
        }
        for (ModrinthClient.Dependency dep : version.dependencies()) {
            if (!"required".equals(dep.type()) || dep.projectId() == null) {
                continue;
            }
            if (stagedProjectIds.contains(dep.projectId())) {
                continue;
            }
            try {
                Optional<ModrinthClient.Project> proj = modrinth.project(dep.projectId());
                String slug = proj.map(ModrinthClient.Project::slug).orElse(dep.projectId());
                if (presentModIds.contains(slug)) {
                    continue;
                }
                Optional<ModrinthClient.Version> depVersion = Optional.empty();
                if (dep.versionId() != null) {
                    depVersion = modrinth.version(dep.versionId())
                            .filter(v -> v.gameVersions().contains(gameVersion));
                }
                if (depVersion.isEmpty()) {
                    depVersion = pickBest(modrinth.projectVersions(slug, "fabric", gameVersion));
                }
                if (depVersion.isPresent()) {
                    Path staged = modrinth.download(depVersion.get(), modsDir);
                    r.stagedDependencies.add(staged);
                    stagedProjectIds.add(dep.projectId());
                    presentModIds.add(slug);
                    log.accept("  + dependency: " + slug + " " + depVersion.get().versionNumber());
                    resolveDependencies(depVersion.get(), r, depth + 1);
                } else {
                    log.accept("  ! required dependency '" + slug + "' has no Fabric build for "
                            + gameVersion + " — install it manually if the mod fails to load.");
                }
            } catch (IOException e) {
                log.accept("  ! failed to resolve dependency " + dep.projectId() + ": " + e.getMessage());
            }
        }
    }

    private Optional<ModrinthClient.Version> pickBest(List<ModrinthClient.Version> versions) {
        Optional<ModrinthClient.Version> release = versions.stream()
                .filter(v -> "release".equals(v.versionType()))
                .findFirst();
        if (release.isPresent() || !config.includeBetaBuilds) {
            return release;
        }
        return versions.stream().findFirst();
    }

    private Optional<ModrinthClient.Version> bukkitBridge() {
        if (bukkitBridge == null) {
            try {
                bukkitBridge = pickBest(modrinth.projectVersions(BUKKIT_BRIDGE_SLUG, "fabric", gameVersion));
            } catch (IOException e) {
                log.accept("  ! could not check the Bukkit bridge mod: " + e.getMessage());
                bukkitBridge = Optional.empty();
            }
        }
        return bukkitBridge;
    }

    private String latestGameVersionOf(String slug) {
        try {
            List<String> gvs = modrinth.project(slug)
                    .map(ModrinthClient.Project::gameVersions)
                    .orElse(List.of());
            if (!gvs.isEmpty()) {
                return gvs.get(gvs.size() - 1);
            }
        } catch (IOException ignored) {
            // suggestion-only path
        }
        return null;
    }

    private void appendSuggestions(StringBuilder detail, String query) {
        if (query == null || query.isBlank()) {
            return;
        }
        try {
            String needle = query.toLowerCase(java.util.Locale.ROOT);
            List<ModrinthClient.SearchHit> hits = modrinth.search(query, "fabric", gameVersion, 8).stream()
                    .filter(h -> h.title() != null
                            && h.title().toLowerCase(java.util.Locale.ROOT).contains(needle))
                    .limit(3)
                    .toList();
            if (!hits.isEmpty()) {
                detail.append("Possible Fabric alternatives on ").append(gameVersion).append(": ");
                for (int i = 0; i < hits.size(); i++) {
                    if (i > 0) {
                        detail.append(", ");
                    }
                    detail.append(hits.get(i).title()).append(" (/octo fetch ").append(hits.get(i).slug()).append(")");
                }
                detail.append('.');
            }
        } catch (IOException ignored) {
            // suggestion-only path
        }
    }

    private Path stageCopy(Path source, Path destDir) throws IOException {
        Files.createDirectories(destDir);
        Path dest = destDir.resolve(source.getFileName().toString());
        if (Files.exists(dest)) {
            return dest;
        }
        Files.copy(source, dest, StandardCopyOption.COPY_ATTRIBUTES);
        return dest;
    }

    private static String orAny(String s) {
        return s == null || s.isBlank() ? "*" : s;
    }
}
