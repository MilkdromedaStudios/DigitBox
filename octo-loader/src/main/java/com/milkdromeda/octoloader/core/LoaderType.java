package com.milkdromeda.octoloader.core;

/** The ecosystem a jar was built for, detected from its embedded metadata. */
public enum LoaderType {
    FABRIC("Fabric mod"),
    QUILT("Quilt mod"),
    FORGE("Forge mod"),
    NEOFORGE("NeoForge mod"),
    PAPER_PLUGIN("Bukkit/Spigot/Paper plugin"),
    UNKNOWN("Unrecognized jar");

    public final String label;

    LoaderType(String label) {
        this.label = label;
    }
}
