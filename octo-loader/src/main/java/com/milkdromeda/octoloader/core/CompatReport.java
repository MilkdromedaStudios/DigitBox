package com.milkdromeda.octoloader.core;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Writes the human-readable and machine-readable compatibility reports. */
public final class CompatReport {

    private CompatReport() {
    }

    public static void writeMarkdown(Path file, String gameVersion, String octoVersion,
                                     List<Resolution> results) throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("# Octo Loader compatibility report\n\n");
        sb.append("- Minecraft: **").append(gameVersion).append("** (Fabric)\n");
        sb.append("- Octo Loader: ").append(octoVersion).append('\n');
        sb.append("- Generated: ").append(ZonedDateTime.now().format(DateTimeFormatter.RFC_1123_DATE_TIME)).append("\n\n");

        if (results.isEmpty()) {
            sb.append("The `octoloader/` inbox is empty. Drop any mod or plugin jar in there and run `/octo resolve`.\n");
        } else {
            sb.append("| File | Detected as | Result | Details |\n");
            sb.append("|------|-------------|--------|---------|\n");
            for (Resolution r : results) {
                sb.append("| `").append(r.jar.path().getFileName()).append("` | ")
                        .append(r.jar.loader().label).append(nameSuffix(r)).append(" | ")
                        .append(statusEmoji(r.status)).append(' ').append(r.status.label).append(" | ")
                        .append(r.detail.replace("|", "\\|").replace("\n", " ")).append(" |\n");
            }
            sb.append('\n');

            List<String> staged = new ArrayList<>();
            for (Resolution r : results) {
                if (r.stagedFile != null) {
                    staged.add(r.stagedFile.getFileName().toString());
                }
                for (Path dep : r.stagedDependencies) {
                    staged.add(dep.getFileName().toString() + " (dependency)");
                }
            }
            if (!staged.isEmpty()) {
                sb.append("## Staged files\n\n");
                for (String s : staged) {
                    sb.append("- ").append(s).append('\n');
                }
                sb.append("\n**Restart the game/server to load the staged files.** ")
                        .append("(Like every loader, Fabric fixes the mod set at launch — ")
                        .append("new jars are picked up on the next start.)\n");
            }
        }
        Files.createDirectories(file.getParent());
        Files.writeString(file, sb.toString(), StandardCharsets.UTF_8);
    }

    public static void writeJson(Path file, String gameVersion, String octoVersion,
                                 List<Resolution> results) throws IOException {
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("gameVersion", gameVersion);
        root.put("octoVersion", octoVersion);
        List<Object> items = new ArrayList<>();
        for (Resolution r : results) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("file", r.jar.path().getFileName().toString());
            m.put("loader", r.jar.loader().name().toLowerCase(java.util.Locale.ROOT));
            m.put("modId", r.jar.modId());
            m.put("name", r.jar.name());
            m.put("version", r.jar.version());
            m.put("declaredMcVersion", r.jar.declaredMcVersion());
            m.put("status", r.status.key);
            m.put("detail", r.detail);
            m.put("resolvedProject", r.resolvedProject);
            m.put("resolvedVersion", r.resolvedVersion);
            m.put("staged", r.stagedFile == null ? null : r.stagedFile.getFileName().toString());
            List<Object> deps = new ArrayList<>();
            for (Path p : r.stagedDependencies) {
                deps.add(p.getFileName().toString());
            }
            m.put("stagedDependencies", deps);
            items.add(m);
        }
        root.put("results", items);
        Files.createDirectories(file.getParent());
        Files.writeString(file, Json.write(root) + "\n", StandardCharsets.UTF_8);
    }

    private static String nameSuffix(Resolution r) {
        String name = r.jar.name();
        return name == null || name.isBlank() ? "" : ": " + name.replace("|", "\\|");
    }

    private static String statusEmoji(Resolution.Status status) {
        return switch (status) {
            case NATIVE_OK, BRIDGED_VERSION, BRIDGED_LOADER, BRIDGED_EQUIVALENT, PLUGIN_BRIDGED -> "✅";
            case ALREADY_PRESENT -> "☑️";
            case SKIPPED_OFFLINE -> "💤";
            case INCOMPATIBLE -> "❌";
            case UNKNOWN_JAR -> "❓";
            case ERROR -> "⚠️";
        };
    }
}
