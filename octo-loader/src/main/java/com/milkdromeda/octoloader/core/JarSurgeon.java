package com.milkdromeda.octoloader.core;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Enumeration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import java.util.zip.ZipOutputStream;

/**
 * Rewrites jars so they can genuinely load on this Fabric game — the "actually connect
 * the mod" half of Octo Loader:
 *
 * <ul>
 *   <li>{@link #convertQuiltJar}: synthesizes a {@code fabric.mod.json} from a Quilt-only
 *       jar's {@code quilt.mod.json}, producing a jar Fabric Loader loads natively. Only
 *       done for mods that don't depend on QSL APIs (those need real Quilt).</li>
 *   <li>{@link #relaxMinecraftConstraint}: rewrites an out-of-range Minecraft version
 *       constraint in a Fabric jar so a neighbouring-version build can be force-loaded.</li>
 * </ul>
 *
 * Jar signatures are stripped during rewriting (a modified signed jar would refuse to load).
 */
public final class JarSurgeon {

    private JarSurgeon() {
    }

    /** Quilt dependency ids that mean the mod needs real QSL, not just quilt_loader metadata. */
    private static boolean needsQsl(String depId) {
        if (depId == null) {
            return false;
        }
        String id = depId.toLowerCase(java.util.Locale.ROOT);
        return id.equals("qsl") || id.equals("quilted_fabric_api")
                || (id.startsWith("quilt") && !id.equals("quilt_loader") && !id.equals("quilt_loader_type"));
    }

    /**
     * Converts a Quilt-only jar into a Fabric-loadable one. Returns empty when the mod
     * declares QSL dependencies (it needs the real Quilt loader) or has no usable metadata.
     */
    public static Optional<Path> convertQuiltJar(Path quiltJar, Path destDir) throws IOException {
        String quiltJson = readEntry(quiltJar, "quilt.mod.json");
        if (quiltJson == null) {
            return Optional.empty();
        }
        Map<String, Object> root;
        try {
            root = Json.parseObject(quiltJson);
        } catch (RuntimeException e) {
            return Optional.empty();
        }
        Map<String, Object> loader = Json.obj(root, "quilt_loader");
        String id = Json.str(loader, "id", null);
        String version = Json.str(loader, "version", null);
        if (id == null || version == null) {
            return Optional.empty();
        }
        for (Object dep : Json.arr(loader, "depends")) {
            if (dep instanceof Map<?, ?> m && needsQsl(String.valueOf(m.get("id")))) {
                return Optional.empty();
            }
        }

        Map<String, Object> fabric = new LinkedHashMap<>();
        fabric.put("schemaVersion", 1L);
        fabric.put("id", id);
        fabric.put("version", version);
        String name = Json.str(Json.obj(loader, "metadata"), "name", id);
        fabric.put("name", name);
        String description = Json.str(Json.obj(loader, "metadata"), "description", null);
        if (description != null) {
            fabric.put("description", description);
        }
        fabric.put("environment", "*");

        // Quilt entrypoint keys map 1:1 onto Fabric's; the value shapes are identical.
        Map<String, Object> quiltEntrypoints = Json.obj(loader, "entrypoints");
        if (!quiltEntrypoints.isEmpty()) {
            Map<String, Object> entrypoints = new LinkedHashMap<>();
            for (Map.Entry<String, Object> e : quiltEntrypoints.entrySet()) {
                String key = switch (e.getKey()) {
                    case "init" -> "main";
                    case "client_init" -> "client";
                    case "server_init" -> "server";
                    default -> e.getKey();
                };
                entrypoints.put(key, e.getValue() instanceof List<?> ? e.getValue() : List.of(e.getValue()));
            }
            fabric.put("entrypoints", entrypoints);
        }
        fabric.put("depends", Map.of("fabricloader", "*"));
        fabric.put("custom", Map.of("octoloader:converted-from", "quilt"));

        Path dest = destDir.resolve(stripJarExt(quiltJar) + "-octo-converted.jar");
        if (!Files.exists(dest)) {
            Files.createDirectories(destDir);
            rewriteWithEntry(quiltJar, dest, "fabric.mod.json",
                    Json.write(fabric).getBytes(StandardCharsets.UTF_8));
        }
        return Optional.of(dest);
    }

    /**
     * Rewrites a Fabric jar's {@code depends.minecraft} constraint to {@code *} so a
     * build for a neighbouring game version can be force-loaded. Used only as a last
     * resort, for same-major-version jars that exist nowhere on Modrinth.
     */
    public static Optional<Path> relaxMinecraftConstraint(Path fabricJar, Path destDir) throws IOException {
        String fabricJson = readEntry(fabricJar, "fabric.mod.json");
        if (fabricJson == null) {
            return Optional.empty();
        }
        Map<String, Object> root;
        try {
            root = Json.parseObject(fabricJson);
        } catch (RuntimeException e) {
            return Optional.empty();
        }
        Object depends = root.get("depends");
        if (depends instanceof Map<?, ?> d) {
            Map<String, Object> relaxed = new LinkedHashMap<>();
            for (Map.Entry<?, ?> e : d.entrySet()) {
                relaxed.put(String.valueOf(e.getKey()),
                        "minecraft".equals(e.getKey()) ? "*" : e.getValue());
            }
            root.put("depends", relaxed);
        }
        Map<String, Object> custom = new LinkedHashMap<>(Json.obj(root, "custom"));
        custom.put("octoloader:force-loaded", Boolean.TRUE);
        root.put("custom", custom);

        Path dest = destDir.resolve(stripJarExt(fabricJar) + "-octo-forced.jar");
        if (!Files.exists(dest)) {
            Files.createDirectories(destDir);
            rewriteWithEntry(fabricJar, dest, "fabric.mod.json",
                    Json.write(root).getBytes(StandardCharsets.UTF_8));
        }
        return Optional.of(dest);
    }

    // ---- plumbing ----------------------------------------------------------

    static void rewriteWithEntry(Path source, Path dest, String entryName, byte[] content) throws IOException {
        try (ZipFile zf = new ZipFile(source.toFile());
             ZipOutputStream out = new ZipOutputStream(Files.newOutputStream(dest))) {
            Enumeration<? extends ZipEntry> entries = zf.entries();
            while (entries.hasMoreElements()) {
                ZipEntry entry = entries.nextElement();
                String entryPath = entry.getName();
                if (entryPath.equals(entryName) || isSignatureFile(entryPath)) {
                    continue;
                }
                out.putNextEntry(new ZipEntry(entryPath));
                if (!entry.isDirectory()) {
                    try (InputStream in = zf.getInputStream(entry)) {
                        in.transferTo(out);
                    }
                }
                out.closeEntry();
            }
            out.putNextEntry(new ZipEntry(entryName));
            out.write(content);
            out.closeEntry();
        } catch (IOException | RuntimeException e) {
            Files.deleteIfExists(dest);
            throw e instanceof IOException io ? io : new IOException(e);
        }
    }

    private static boolean isSignatureFile(String name) {
        return name.startsWith("META-INF/")
                && (name.endsWith(".SF") || name.endsWith(".RSA") || name.endsWith(".DSA") || name.endsWith(".EC"));
    }

    private static String readEntry(Path jar, String entryName) throws IOException {
        try (ZipFile zf = new ZipFile(jar.toFile())) {
            ZipEntry entry = zf.getEntry(entryName);
            if (entry == null) {
                return null;
            }
            try (InputStream in = zf.getInputStream(entry)) {
                return new String(in.readAllBytes(), StandardCharsets.UTF_8);
            }
        }
    }

    private static String stripJarExt(Path jar) {
        String name = jar.getFileName().toString();
        return name.endsWith(".jar") ? name.substring(0, name.length() - 4) : name;
    }
}
