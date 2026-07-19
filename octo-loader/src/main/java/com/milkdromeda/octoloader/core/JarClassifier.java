package com.milkdromeda.octoloader.core;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/**
 * Detects what kind of mod/plugin a jar is by looking at the metadata files each
 * loader ecosystem embeds:
 *
 * <ul>
 *   <li>{@code fabric.mod.json} — Fabric</li>
 *   <li>{@code quilt.mod.json} — Quilt</li>
 *   <li>{@code META-INF/neoforge.mods.toml} — NeoForge</li>
 *   <li>{@code META-INF/mods.toml} — Forge (and pre-1.20.5 NeoForge)</li>
 *   <li>{@code paper-plugin.yml} / {@code plugin.yml} — Paper/Spigot/Bukkit</li>
 * </ul>
 */
public final class JarClassifier {

    private JarClassifier() {
    }

    public static ModJarInfo classify(Path jar) throws IOException {
        String sha1 = hash(jar, "SHA-1");
        String sha512 = hash(jar, "SHA-512");

        try (ZipFile zf = new ZipFile(jar.toFile())) {
            String fabricJson = read(zf, "fabric.mod.json");
            if (fabricJson != null) {
                return fromFabricJson(jar, LoaderType.FABRIC, fabricJson, sha1, sha512);
            }

            String quiltJson = read(zf, "quilt.mod.json");
            if (quiltJson != null) {
                return fromQuiltJson(jar, quiltJson, sha1, sha512);
            }

            String neoToml = read(zf, "META-INF/neoforge.mods.toml");
            if (neoToml != null) {
                return fromModsToml(jar, LoaderType.NEOFORGE, neoToml, zf, sha1, sha512);
            }

            String forgeToml = read(zf, "META-INF/mods.toml");
            if (forgeToml != null) {
                return fromModsToml(jar, LoaderType.FORGE, forgeToml, zf, sha1, sha512);
            }

            String pluginYml = read(zf, "paper-plugin.yml");
            if (pluginYml == null) {
                pluginYml = read(zf, "plugin.yml");
            }
            if (pluginYml != null) {
                return fromPluginYml(jar, pluginYml, sha1, sha512);
            }

            // OptiFine ships with no loader metadata at all, but is instantly
            // recognizable — and important enough to special-case so the engine can
            // install its Fabric equivalents (Sodium + Iris).
            if (zf.getEntry("optifine/Installer.class") != null
                    || zf.getEntry("optifine/OptiFineForgeTweaker.class") != null
                    || zf.getEntry("notch/net/optifine/Config.class") != null) {
                return new ModJarInfo(jar, LoaderType.FORGE, "optifine", "OptiFine", null, null, sha1, sha512);
            }
        }

        return new ModJarInfo(jar, LoaderType.UNKNOWN, null, null, null, null, sha1, sha512);
    }

    // ---- per-format parsers ----------------------------------------------

    private static ModJarInfo fromFabricJson(Path jar, LoaderType type, String json, String sha1, String sha512) {
        try {
            Map<String, Object> root = Json.parseObject(json);
            String id = Json.str(root, "id", null);
            String version = Json.str(root, "version", null);
            String name = Json.str(root, "name", id);
            String mc = constraintToString(Json.obj(root, "depends").get("minecraft"));
            return new ModJarInfo(jar, type, id, name, version, mc, sha1, sha512);
        } catch (RuntimeException e) {
            return new ModJarInfo(jar, type, null, null, null, null, sha1, sha512);
        }
    }

    private static ModJarInfo fromQuiltJson(Path jar, String json, String sha1, String sha512) {
        try {
            Map<String, Object> root = Json.parseObject(json);
            Map<String, Object> loaderSec = Json.obj(root, "quilt_loader");
            String id = Json.str(loaderSec, "id", null);
            String version = Json.str(loaderSec, "version", null);
            String name = Json.str(Json.obj(loaderSec, "metadata"), "name", id);
            String mc = null;
            for (Object dep : Json.arr(loaderSec, "depends")) {
                if (dep instanceof Map<?, ?> m && "minecraft".equals(m.get("id"))) {
                    mc = constraintToString(m.get("versions"));
                }
            }
            return new ModJarInfo(jar, LoaderType.QUILT, id, name, version, mc, sha1, sha512);
        } catch (RuntimeException e) {
            return new ModJarInfo(jar, LoaderType.QUILT, null, null, null, null, sha1, sha512);
        }
    }

    /**
     * Line-based best-effort extraction from mods.toml / neoforge.mods.toml. A full TOML
     * parser is overkill: we only need modId, displayName, version and the Minecraft
     * version range, which the Forge ecosystem always writes as simple {@code key="value"}
     * lines.
     */
    private static ModJarInfo fromModsToml(Path jar, LoaderType type, String toml, ZipFile zf,
                                           String sha1, String sha512) throws IOException {
        String modId = null;
        String displayName = null;
        String version = null;
        String mcRange = null;
        boolean inMinecraftDep = false;

        for (String rawLine : toml.split("\n")) {
            String line = stripTomlComment(rawLine).trim();
            if (line.isEmpty()) {
                continue;
            }
            if (line.startsWith("[")) {
                inMinecraftDep = false;
            }
            String id = tomlValue(line, "modId");
            if (id != null) {
                if (modId == null) {
                    modId = id;
                }
                inMinecraftDep = id.equals("minecraft");
            }
            if (displayName == null) {
                String dn = tomlValue(line, "displayName");
                if (dn != null) {
                    displayName = dn;
                }
            }
            if (version == null) {
                String v = tomlValue(line, "version");
                if (v != null) {
                    version = v;
                }
            }
            if (inMinecraftDep && mcRange == null) {
                String range = tomlValue(line, "versionRange");
                if (range != null) {
                    mcRange = range;
                }
            }
        }

        if (version != null && version.contains("${")) {
            version = manifestImplementationVersion(zf, version);
        }
        return new ModJarInfo(jar, type, modId, displayName, version, mcRange, sha1, sha512);
    }

    private static ModJarInfo fromPluginYml(Path jar, String yml, String sha1, String sha512) {
        String name = null;
        String version = null;
        String apiVersion = null;
        for (String rawLine : yml.split("\n")) {
            String line = rawLine.strip();
            if (name == null) {
                name = yamlValue(line, "name");
            }
            if (version == null) {
                version = yamlValue(line, "version");
            }
            if (apiVersion == null) {
                apiVersion = yamlValue(line, "api-version");
            }
        }
        String id = name == null ? null : name.toLowerCase(java.util.Locale.ROOT).replaceAll("[^a-z0-9_-]", "");
        return new ModJarInfo(jar, LoaderType.PAPER_PLUGIN, id, name, version, apiVersion, sha1, sha512);
    }

    // ---- small helpers ----------------------------------------------------

    private static String constraintToString(Object constraint) {
        if (constraint instanceof String s) {
            return s;
        }
        if (constraint instanceof List<?> l && !l.isEmpty()) {
            StringBuilder sb = new StringBuilder();
            for (Object o : l) {
                if (!sb.isEmpty()) {
                    sb.append(" || ");
                }
                sb.append(o);
            }
            return sb.toString();
        }
        return null;
    }

    private static String stripTomlComment(String line) {
        boolean inString = false;
        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            if (c == '"') {
                inString = !inString;
            } else if (c == '#' && !inString) {
                return line.substring(0, i);
            }
        }
        return line;
    }

    private static String tomlValue(String line, String key) {
        if (!line.startsWith(key)) {
            return null;
        }
        String rest = line.substring(key.length()).stripLeading();
        if (!rest.startsWith("=")) {
            return null;
        }
        rest = rest.substring(1).strip();
        if (rest.length() >= 2 && (rest.startsWith("\"") || rest.startsWith("'"))) {
            char quote = rest.charAt(0);
            int end = rest.indexOf(quote, 1);
            if (end > 0) {
                return rest.substring(1, end);
            }
        }
        return rest.isEmpty() ? null : rest;
    }

    private static String yamlValue(String line, String key) {
        if (!line.startsWith(key + ":")) {
            return null;
        }
        String v = line.substring(key.length() + 1).strip();
        if (v.length() >= 2 && ((v.startsWith("\"") && v.endsWith("\"")) || (v.startsWith("'") && v.endsWith("'")))) {
            v = v.substring(1, v.length() - 1);
        }
        return v.isEmpty() ? null : v;
    }

    private static String manifestImplementationVersion(ZipFile zf, String fallback) throws IOException {
        String manifest = read(zf, "META-INF/MANIFEST.MF");
        if (manifest != null) {
            for (String line : manifest.split("\r?\n")) {
                if (line.startsWith("Implementation-Version:")) {
                    return line.substring("Implementation-Version:".length()).strip();
                }
            }
        }
        return fallback;
    }

    private static String read(ZipFile zf, String entryName) throws IOException {
        ZipEntry entry = zf.getEntry(entryName);
        if (entry == null) {
            return null;
        }
        try (InputStream in = zf.getInputStream(entry)) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    private static String hash(Path file, String algorithm) throws IOException {
        try {
            MessageDigest md = MessageDigest.getInstance(algorithm);
            try (InputStream in = Files.newInputStream(file)) {
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = in.read(buf)) > 0) {
                    md.update(buf, 0, n);
                }
            }
            return toHex(md.digest());
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    static String toHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            sb.append(Character.forDigit((b >> 4) & 0xF, 16));
            sb.append(Character.forDigit(b & 0xF, 16));
        }
        return sb.toString();
    }
}
