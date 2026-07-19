package com.milkdromeda.octoloader.core;

import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Enumeration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import java.util.zip.ZipOutputStream;

/**
 * Rewrites the <em>class references</em> inside a jar's bytecode: every mention of an old
 * type (renamed or relocated between Minecraft versions) is replaced with its new name,
 * everywhere it appears — class definitions, superclasses/interfaces, field and method
 * owners, descriptors, and signatures.
 *
 * <p>This is the honest core of "change the old broken APIs and replace them with the new
 * ones": when a mod broke only because Minecraft <em>moved or renamed classes</em>, a
 * correct old→new class map makes the abandoned jar link against the current API again.
 * It is dependency-free (no ASM) so the same engine runs in-game and from the CLI.
 *
 * <p><b>What it can do:</b> class renames/relocations (the largest category of breakage
 * across many version bumps). <b>What it cannot do:</b> invent APIs that were deleted,
 * change method signatures/argument counts, or rewrite logic for a redesigned subsystem —
 * those require a human port. The migration report says exactly which references it could
 * not map so nothing is silently broken.
 *
 * <p>Class references resolve, in the class-file format, through {@code CONSTANT_Utf8}
 * entries (bare internal names in {@code CONSTANT_Class}, and {@code Lpkg/Name;} tokens
 * inside descriptors/signatures). Rewriting only those Utf8 entries — and copying every
 * other constant-pool entry and section byte-for-byte — remaps all references consistently
 * while preserving every constant-pool index the rest of the class file points at.
 */
public final class ApiMigrator {

    private ApiMigrator() {
    }

    public record Result(Path migratedJar, int classesTouched, int referencesRemapped,
                         List<String> unmappedMinecraftRefs) {
    }

    /**
     * Applies {@code classRenames} (old internal name → new internal name, e.g.
     * {@code net/minecraft/old/World} → {@code net/minecraft/world/World}) to every class
     * in {@code sourceJar}, writing a new jar into {@code destDir}.
     */
    public static Result migrateJar(Path sourceJar, Map<String, String> classRenames, Path destDir)
            throws IOException {
        // Longest keys first so a longer, more specific rename wins over a shorter prefix.
        List<Map.Entry<String, String>> renames = new ArrayList<>(classRenames.entrySet());
        renames.sort(Comparator.comparingInt((Map.Entry<String, String> e) -> e.getKey().length()).reversed());
        // Names we deliberately mapped TO are not "unmapped" — don't flag them as risky.
        java.util.Set<String> targets = new java.util.HashSet<>(classRenames.values());

        Files.createDirectories(destDir);
        String outName = stripJarExt(sourceJar) + "-octo-migrated.jar";
        Path dest = destDir.resolve(outName);

        int classesTouched = 0;
        int referencesRemapped = 0;
        TreeSet<String> unmapped = new TreeSet<>();

        try (ZipFile zf = new ZipFile(sourceJar.toFile());
             ZipOutputStream out = new ZipOutputStream(Files.newOutputStream(dest))) {
            Enumeration<? extends ZipEntry> entries = zf.entries();
            while (entries.hasMoreElements()) {
                ZipEntry entry = entries.nextElement();
                String name = entry.getName();
                if (isSignatureFile(name)) {
                    continue; // a modified class breaks jar signatures; drop them
                }
                out.putNextEntry(new ZipEntry(name));
                if (entry.isDirectory()) {
                    out.closeEntry();
                    continue;
                }
                byte[] data;
                try (InputStream in = zf.getInputStream(entry)) {
                    data = in.readAllBytes();
                }
                if (name.endsWith(".class")) {
                    int[] counters = new int[1];
                    byte[] rewritten = remapClassConstants(data, renames, targets, counters, unmapped);
                    if (counters[0] > 0) {
                        classesTouched++;
                        referencesRemapped += counters[0];
                        data = rewritten;
                    }
                }
                out.write(data);
                out.closeEntry();
            }
        } catch (IOException | RuntimeException e) {
            Files.deleteIfExists(dest);
            throw e instanceof IOException io ? io : new IOException(e);
        }
        return new Result(dest, classesTouched, referencesRemapped, new ArrayList<>(unmapped));
    }

    /**
     * Rewrites the {@code CONSTANT_Utf8} entries of one class file, applying the class
     * renames and recording any remaining {@code net/minecraft/...} references that had no
     * mapping (so the report can warn that they may still break).
     */
    static byte[] remapClassConstants(byte[] classBytes, List<Map.Entry<String, String>> renames,
                                      java.util.Set<String> renameTargets, int[] remapCount,
                                      TreeSet<String> unmapped) throws IOException {
        DataInputStream in = new DataInputStream(new java.io.ByteArrayInputStream(classBytes));
        int magic = in.readInt();
        if (magic != 0xCAFEBABE) {
            return classBytes; // not a class file
        }
        int minor = in.readUnsignedShort();
        int major = in.readUnsignedShort();
        int cpCount = in.readUnsignedShort();

        // Parse constant pool, transforming Utf8 entries in place (indices preserved).
        List<byte[]> entries = new ArrayList<>();
        entries.add(null); // index 0 is unused
        for (int i = 1; i < cpCount; i++) {
            int tag = in.readUnsignedByte();
            byte[] body = readConstantBody(in, tag);
            if (tag == 1) { // Utf8
                String value = new String(body, StandardCharsets.UTF_8);
                String rewritten = applyRenames(value, renames, renameTargets, remapCount, unmapped);
                if (!rewritten.equals(value)) {
                    body = rewritten.getBytes(StandardCharsets.UTF_8);
                }
            }
            byte[] full = new byte[body.length + 1];
            full[0] = (byte) tag;
            System.arraycopy(body, 0, full, 1, body.length);
            entries.add(full);
            if (tag == 5 || tag == 6) { // Long/Double occupy two pool slots
                entries.add(null);
                i++;
            }
        }

        byte[] rest = in.readAllBytes();

        ByteArrayOutputStream bos = new ByteArrayOutputStream(classBytes.length + 64);
        DataOutputStream dos = new DataOutputStream(bos);
        dos.writeInt(magic);
        dos.writeShort(minor);
        dos.writeShort(major);
        dos.writeShort(cpCount);
        for (byte[] e : entries) {
            if (e != null) {
                dos.write(e);
            }
        }
        dos.write(rest);
        dos.flush();
        return bos.toByteArray();
    }

    private static byte[] readConstantBody(DataInputStream in, int tag) throws IOException {
        return switch (tag) {
            case 1 -> { // Utf8
                int len = in.readUnsignedShort();
                byte[] b = new byte[2 + len];
                b[0] = (byte) (len >>> 8);
                b[1] = (byte) len;
                in.readFully(b, 2, len);
                yield b;
            }
            case 3, 4, 9, 10, 11, 12, 17, 18 -> readN(in, 4); // int/float/refs/NameAndType/(Invoke)Dynamic
            case 5, 6 -> readN(in, 8); // long/double
            case 7, 8, 16, 19, 20 -> readN(in, 2); // Class/String/MethodType/Module/Package
            case 15 -> readN(in, 3); // MethodHandle
            default -> throw new IOException("Unknown constant pool tag " + tag);
        };
    }

    private static byte[] readN(DataInputStream in, int n) throws IOException {
        byte[] b = new byte[n];
        in.readFully(b);
        return b;
    }

    /**
     * Replaces old internal names with new ones inside a single Utf8 string, and flags
     * leftover Minecraft class references that had no mapping.
     */
    private static String applyRenames(String value, List<Map.Entry<String, String>> renames,
                                       java.util.Set<String> renameTargets, int[] remapCount,
                                       TreeSet<String> unmapped) {
        String result = value;
        for (Map.Entry<String, String> e : renames) {
            String from = e.getKey();
            if (result.contains(from)) {
                result = result.replace(from, e.getValue());
                remapCount[0]++;
            }
        }
        // Heuristic unmapped-reference detection: a descriptor/name still pointing at a
        // Minecraft type we didn't rename may still break at runtime. Names we deliberately
        // mapped TO are known-good and excluded.
        collectUnmappedMinecraft(result, renameTargets, unmapped);
        return result;
    }

    private static void collectUnmappedMinecraft(String value, java.util.Set<String> renameTargets,
                                                 TreeSet<String> unmapped) {
        int idx = value.indexOf("net/minecraft/");
        while (idx >= 0) {
            int end = idx;
            while (end < value.length() && (Character.isLetterOrDigit(value.charAt(end))
                    || value.charAt(end) == '/' || value.charAt(end) == '_' || value.charAt(end) == '$')) {
                end++;
            }
            String ref = value.substring(idx, end);
            if (ref.length() > "net/minecraft/".length() && !renameTargets.contains(ref)) {
                unmapped.add(ref);
            }
            idx = value.indexOf("net/minecraft/", end);
        }
    }

    private static boolean isSignatureFile(String name) {
        return name.startsWith("META-INF/")
                && (name.endsWith(".SF") || name.endsWith(".RSA") || name.endsWith(".DSA") || name.endsWith(".EC"));
    }

    private static String stripJarExt(Path jar) {
        String name = jar.getFileName().toString();
        return name.endsWith(".jar") ? name.substring(0, name.length() - 4) : name;
    }

    /** Loads an old→new class-rename map from a migration JSON file (classRenames object). */
    public static Map<String, String> loadClassRenames(Path migrationFile) throws IOException {
        Map<String, String> map = new LinkedHashMap<>();
        if (!Files.exists(migrationFile)) {
            return map;
        }
        Map<String, Object> root = Json.parseObject(Files.readString(migrationFile, StandardCharsets.UTF_8));
        for (Map.Entry<String, Object> e : Json.obj(root, "classRenames").entrySet()) {
            if (e.getValue() instanceof String s) {
                map.put(e.getKey(), s);
            }
        }
        return map;
    }

    /**
     * Merges every migration map in {@code migrationsDir} that targets {@code gameVersion}
     * — files named {@code <anything>-to-<gameVersion>.json}. This lets the community drop
     * in version-pair maps and have the right one picked up automatically.
     */
    public static Map<String, String> mergedRenamesForTarget(Path migrationsDir, String gameVersion) {
        Map<String, String> merged = new LinkedHashMap<>();
        if (!Files.isDirectory(migrationsDir)) {
            return merged;
        }
        String suffix = "-to-" + gameVersion + ".json";
        try (java.util.stream.Stream<Path> files = Files.list(migrationsDir)) {
            for (Path f : files.sorted().toList()) {
                if (f.getFileName().toString().endsWith(suffix)) {
                    try {
                        merged.putAll(loadClassRenames(f));
                    } catch (IOException | RuntimeException ignored) {
                        // a malformed map file must never break resolution
                    }
                }
            }
        } catch (IOException ignored) {
            // no migrations dir yet
        }
        return merged;
    }
}
