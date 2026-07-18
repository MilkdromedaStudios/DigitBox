package com.milkdromeda.octoloader.core;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Curated map of Modrinth project slugs to the slug of their community Fabric port,
 * for projects that publish their Fabric edition as a separate Modrinth project.
 * Users can extend this via {@code extraEquivalents} in the config.
 */
public final class Equivalents {

    private static final Map<String, String> BUILTIN = Map.ofEntries(
            // Create publishes its Fabric port as a separate project.
            Map.entry("create", "create-fabric"),
            // Iris/Oculus pairing (Oculus is the Forge port of Iris — map back to Iris on Fabric).
            Map.entry("oculus", "iris"),
            // Embeddium is the Forge/NeoForge fork of Sodium.
            Map.entry("embeddium", "sodium"),
            // Radium is the Forge port of Lithium.
            Map.entry("radium", "lithium"),
            // LuckPerms uses one project with many loaders, but EssentialsX-style permissions
            // users often arrive with GriefPrevention etc.; keep only pairs that are true ports:
            Map.entry("connectedness", "continuity")
    );

    private final Map<String, String> map;

    public Equivalents(Map<String, String> extra) {
        Map<String, String> m = new LinkedHashMap<>(BUILTIN);
        if (extra != null) {
            m.putAll(extra);
        }
        this.map = m;
    }

    /** Returns the Fabric-port slug for the given slug, or null when no mapping is known. */
    public String fabricPortOf(String slug) {
        return slug == null ? null : map.get(slug);
    }
}
