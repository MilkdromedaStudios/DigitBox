package com.milkdromeda.octoloader.core;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The cross-loader replacement database, in two tiers:
 *
 * <ul>
 *   <li><b>Ports</b> — the same mod, published for Fabric as a separate Modrinth project
 *       (or the Fabric original that a Forge project was forked from). Installed
 *       automatically as a drop-in.</li>
 *   <li><b>Alternatives</b> — different projects that provide the same functionality,
 *       for mods that simply don't exist on Fabric (OptiFine being the classic case).
 *       Installed automatically when {@code installAlternatives} is enabled, and always
 *       labeled honestly as replacements.</li>
 * </ul>
 *
 * Users can extend the ports tier via {@code extraEquivalents} in the config.
 */
public final class Equivalents {

    private static final Map<String, String> PORTS = Map.ofEntries(
            // Create publishes its Fabric port as a separate project.
            Map.entry("create", "create-fabric"),
            // Oculus is the Forge port of Iris — map back to the Fabric original.
            Map.entry("oculus", "iris"),
            // Embeddium / Rubidium / Magnesium are Forge forks of Sodium.
            Map.entry("embeddium", "sodium"),
            Map.entry("rubidium", "sodium"),
            Map.entry("magnesium", "sodium"),
            // Radium / Canary are Forge ports of Lithium.
            Map.entry("radium", "lithium"),
            Map.entry("canary", "lithium"),
            // Connectedness maps back to Continuity (connected textures).
            Map.entry("connectedness", "continuity"),
            // Cull Leaves ports.
            Map.entry("cull-less-leaves", "cull-leaves"),
            // Dynamic lights: Forge forks of LambDynamicLights.
            Map.entry("dynamiclightsreforged", "lambdynamiclights"),
            Map.entry("sodium-dynamic-lights", "lambdynamiclights")
    );

    private static final Map<String, List<String>> ALTERNATIVES = Map.of(
            // OptiFine isn't a Fabric mod and never will be: Sodium covers the
            // performance half, Iris runs OptiFine-format shader packs.
            "optifine", List.of("sodium", "iris"),
            // Quark's closest Fabric counterpart.
            "quark", List.of("charm")
    );

    private final Map<String, String> ports;

    public Equivalents(Map<String, String> extra) {
        Map<String, String> m = new LinkedHashMap<>(PORTS);
        if (extra != null) {
            m.putAll(extra);
        }
        this.ports = m;
    }

    /** Returns the Fabric-port slug for the given slug, or null when no mapping is known. */
    public String fabricPortOf(String slug) {
        return slug == null ? null : ports.get(slug.toLowerCase(java.util.Locale.ROOT));
    }

    /** Returns functionally-equivalent Fabric projects for a mod with no Fabric edition. */
    public List<String> alternativesFor(String slugOrId) {
        return slugOrId == null ? List.of()
                : ALTERNATIVES.getOrDefault(slugOrId.toLowerCase(java.util.Locale.ROOT), List.of());
    }
}
