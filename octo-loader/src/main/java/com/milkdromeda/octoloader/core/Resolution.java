package com.milkdromeda.octoloader.core;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/** The outcome of running one inbox jar through the resolution engine. */
public final class Resolution {

    public enum Status {
        /** Fabric mod already suitable for this game version — staged as-is. */
        NATIVE_OK("native", "Loaded as-is"),
        /** Same project, different game version — matching build fetched from Modrinth. */
        BRIDGED_VERSION("bridged-version", "Version-bridged via Modrinth"),
        /** Same project, different loader — the project's Fabric build was fetched. */
        BRIDGED_LOADER("bridged-loader", "Loader-bridged via Modrinth"),
        /** Different project entirely — a known Fabric port was fetched instead. */
        BRIDGED_EQUIVALENT("bridged-equivalent", "Swapped for its Fabric port"),
        /** Quilt jar rewritten with synthesized Fabric metadata — the actual jar loads. */
        LOADER_CONVERTED("loader-converted", "Converted — the jar itself loads on Fabric"),
        /** Foreign jar staged as-is together with a translation-layer mod that executes it. */
        LOADER_TRANSLATED("loader-translated", "Loads through a translation layer"),
        /** No build of the original exists — closest Fabric equivalents installed instead. */
        ALTERNATIVE_INSTALLED("alternative-installed", "Replaced with Fabric equivalents"),
        /** Fabric jar for a neighbouring version, force-loaded with its constraint relaxed. */
        FORCE_LOADED("force-loaded", "Force-loaded (version constraint relaxed)"),
        /** Abandoned jar whose old class references were rewritten to the current API. */
        API_MIGRATED("api-migrated", "API-migrated (old classes rewritten to new)"),
        /** Paper plugin staged into plugins/ together with a Bukkit-on-Fabric bridge mod. */
        PLUGIN_BRIDGED("plugin-bridged", "Plugin staged with Bukkit bridge"),
        /** Already installed/staged — nothing to do. */
        ALREADY_PRESENT("already-present", "Already installed"),
        /** No compatible build exists anywhere we can see. */
        INCOMPATIBLE("incompatible", "No compatible build available"),
        /** Not a recognizable mod or plugin jar. */
        UNKNOWN_JAR("unknown", "Unrecognized jar"),
        /** Network disabled — classified only. */
        SKIPPED_OFFLINE("offline", "Offline — classified only"),
        /** Something went wrong talking to the network or disk. */
        ERROR("error", "Error during resolution");

        public final String key;
        public final String label;

        Status(String key, String label) {
            this.key = key;
            this.label = label;
        }
    }

    public final ModJarInfo jar;
    public Status status;
    public String detail = "";
    public String resolvedProject;
    public String resolvedVersion;
    public Path stagedFile;
    public final List<Path> stagedDependencies = new ArrayList<>();

    public Resolution(ModJarInfo jar) {
        this.jar = jar;
    }

    public Resolution set(Status status, String detail) {
        this.status = status;
        this.detail = detail;
        return this;
    }
}
