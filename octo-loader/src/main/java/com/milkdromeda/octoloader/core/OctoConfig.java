package com.milkdromeda.octoloader.core;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;

/** Config stored at {@code config/octoloader.json}. Created with defaults on first run. */
public final class OctoConfig {
    /** Scan + resolve automatically whenever the game starts. */
    public boolean autoResolve = true;
    /** Never touch the network (classify-only mode). */
    public boolean offline = false;
    /** Allow alpha/beta builds from Modrinth when no release build matches. */
    public boolean includeBetaBuilds = true;
    /** Overrides the detected game version (mostly useful for testing). */
    public String targetGameVersion = null;
    /** How deep to chase required dependencies of fetched mods. */
    public int maxDependencyDepth = 3;
    /** Install functionally-equivalent Fabric mods for mods that have no Fabric edition (e.g. OptiFine -> Sodium+Iris). */
    public boolean installAlternatives = true;
    /** Force-load Fabric jars built for a neighbouring version in the same major (e.g. a 26.1 jar on 26.2) when Modrinth has no proper build. */
    public boolean forceLoadSameMajor = true;
    /** The big red switch: force-load Fabric/Quilt jars from ANY Minecraft version when nothing better exists. Old jars may crash — the connector tries anyway. */
    public boolean forceLoadAnyVersion = false;
    /** Extra cross-loader equivalences: Modrinth slug of what you have -> slug of the Fabric port. */
    public Map<String, String> extraEquivalents = new LinkedHashMap<>();

    public static OctoConfig load(Path configDir) {
        OctoConfig cfg = new OctoConfig();
        Path file = configDir.resolve("octoloader.json");
        try {
            if (Files.exists(file)) {
                Map<String, Object> root = Json.parseObject(Files.readString(file, StandardCharsets.UTF_8));
                cfg.autoResolve = Json.bool(root, "autoResolve", cfg.autoResolve);
                cfg.offline = Json.bool(root, "offline", cfg.offline);
                cfg.includeBetaBuilds = Json.bool(root, "includeBetaBuilds", cfg.includeBetaBuilds);
                cfg.targetGameVersion = Json.str(root, "targetGameVersion", null);
                cfg.maxDependencyDepth = (int) Json.integer(root, "maxDependencyDepth", cfg.maxDependencyDepth);
                cfg.installAlternatives = Json.bool(root, "installAlternatives", cfg.installAlternatives);
                cfg.forceLoadSameMajor = Json.bool(root, "forceLoadSameMajor", cfg.forceLoadSameMajor);
                cfg.forceLoadAnyVersion = Json.bool(root, "forceLoadAnyVersion", cfg.forceLoadAnyVersion);
                for (Map.Entry<String, Object> e : Json.obj(root, "extraEquivalents").entrySet()) {
                    if (e.getValue() instanceof String s) {
                        cfg.extraEquivalents.put(e.getKey(), s);
                    }
                }
            } else {
                cfg.save(configDir);
            }
        } catch (IOException | RuntimeException ignored) {
            // A broken config file should never stop the game from booting.
        }
        return cfg;
    }

    public void save(Path configDir) throws IOException {
        Files.createDirectories(configDir);
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("autoResolve", autoResolve);
        root.put("offline", offline);
        root.put("includeBetaBuilds", includeBetaBuilds);
        root.put("targetGameVersion", targetGameVersion);
        root.put("maxDependencyDepth", maxDependencyDepth);
        root.put("installAlternatives", installAlternatives);
        root.put("forceLoadSameMajor", forceLoadSameMajor);
        root.put("forceLoadAnyVersion", forceLoadAnyVersion);
        root.put("extraEquivalents", extraEquivalents);
        Files.writeString(configDir.resolve("octoloader.json"), Json.write(root) + "\n", StandardCharsets.UTF_8);
    }
}
